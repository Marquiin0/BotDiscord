const { Blacklist } = require('../database')
const { Sequelize } = require('sequelize')
const { EmbedBuilder } = require('discord.js')
const config = require('../config')

async function checkExpiredBlacklist(client) {
  try {
    const expiredRecords = await Blacklist.findAll({
      where: {
        expirationDate: { [Sequelize.Op.lte]: new Date() },
      },
    })

    if (expiredRecords.length === 0) return

    const guild = client.guilds.cache.get(config.guilds.main)
    if (!guild) return

    for (const record of expiredRecords) {
      try {
        const member = await guild.members.fetch(record.userId).catch(() => null)

        if (member) {
          // Remover cargo de blacklist
          await member.roles.remove(config.roles.blacklistUnidade).catch(console.error)

          // DM avisando que a blacklist expirou
          try {
            const dmEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle(`✅ ${config.branding.name} - Blacklist Expirada`)
              .setDescription(
                `Sua blacklist de unidade expirou.\n\n` +
                `Você já pode ingressar em unidades novamente.`,
              )
              .setFooter({ text: config.branding.footerText })
              .setTimestamp()

            await member.send({ embeds: [dmEmbed] }).catch(() => {})
          } catch (e) { /* DM fechada */ }
        }

        // Deletar registro do BD
        await record.destroy()
        console.log(`[Blacklist] Blacklist expirada removida para ${record.userId} (unidade: ${record.unitName})`)
      } catch (err) {
        console.error(`[Blacklist] Erro ao processar expiração de ${record.userId}:`, err.message)
      }
    }
  } catch (err) {
    console.error('[Blacklist] Erro geral na verificação:', err)
  }
}

module.exports = checkExpiredBlacklist
