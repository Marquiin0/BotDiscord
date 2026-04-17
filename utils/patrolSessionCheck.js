const { PatrolSession } = require('../database')
const { Op } = require('sequelize')
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')
const config = require('../config')
const moment = require('moment-timezone')

async function checkLongPatrolSessions(client) {
  try {
    const now = new Date()

    const sessions = await PatrolSession.findAll({
      where: {
        exitTime: null,
        discordId: { [Op.ne]: null },
        nextCheckAt: { [Op.lte]: now },
      },
    })

    for (const session of sessions) {
      try {
        const user = await client.users.fetch(session.discordId)

        const hoursOnDuty = moment(now).diff(moment(session.entryTime), 'hours', true)

        const embed = new EmbedBuilder()
          .setColor(config.branding.color)
          .setTitle('⏰ Verificação de Patrulha')
          .setDescription(
            `Você está em serviço há **${hoursOnDuty.toFixed(1)} horas**.\n\n` +
            `Você ainda está online no jogo ou crashou?`
          )
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`patrol_still_playing_${session.id}`)
            .setLabel('Ainda estou no jogo')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎮'),
          new ButtonBuilder()
            .setCustomId(`patrol_crashed_${session.id}`)
            .setLabel('Crashei')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('💥'),
        )

        await user.send({ embeds: [embed], components: [row] })

        // Setar nextCheckAt = null para evitar DM duplicada
        await session.update({ nextCheckAt: null })

        console.log(`[PatrolCheck] DM enviada para ${user.tag} (sessão ${session.id}, ${hoursOnDuty.toFixed(1)}h)`)
      } catch (err) {
        // Usuário com DMs desabilitadas ou erro ao enviar
        console.error(`[PatrolCheck] Erro ao enviar DM para ${session.discordId}:`, err.message)
        // Avança nextCheckAt para não ficar tentando indefinidamente
        await session.update({ nextCheckAt: moment().add(3, 'hours').toDate() })
      }
    }
    // Auto-close: sessões com nextCheckAt = null (DM enviada, nunca respondida) e >6h
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
    const abandonedSessions = await PatrolSession.findAll({
      where: {
        exitTime: null,
        nextCheckAt: null,
        entryTime: { [Op.lte]: sixHoursAgo },
      },
    })

    for (const session of abandonedSessions) {
      try {
        const exitTime = new Date(new Date(session.entryTime).getTime() + 3 * 60 * 60 * 1000)
        await session.update({ exitTime, duration: 3.0 })
        console.log(`[PatrolCheck] Sessão ${session.id} auto-fechada (sem resposta >6h, 3.0h contabilizadas)`)
      } catch (e) {
        console.error(`[PatrolCheck] Erro ao auto-fechar sessão ${session.id}:`, e.message)
      }
    }

    if (abandonedSessions.length > 0) {
      console.log(`[PatrolCheck] ${abandonedSessions.length} sessões abandonadas auto-fechadas`)
    }
  } catch (err) {
    console.error('[PatrolCheck] Erro geral na verificação:', err)
  }
}

module.exports = { checkLongPatrolSessions }
