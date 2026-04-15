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
  } catch (err) {
    console.error('[PatrolCheck] Erro geral na verificação:', err)
  }
}

module.exports = { checkLongPatrolSessions }
