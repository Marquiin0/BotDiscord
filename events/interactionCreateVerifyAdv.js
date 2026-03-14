const { Events, EmbedBuilder } = require('discord.js')
const { Warning } = require('../database')
const config = require('../config')
const { MessageFlags } = require('discord.js')

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (!interaction.isButton()) return

    const [action, userId] = interaction.customId.split('_')

    if (action !== 'verificar') return

    const member = await interaction.guild.members
      .fetch(userId)
      .catch(() => null)
    if (!member) {
      return interaction.reply({
        content: `⚠️ O usuário <@${userId}> não foi encontrado no servidor.`,
        flags: MessageFlags.Ephemeral,
      })
    }

    const warnings = await Warning.findAll({ where: { userId } })

    if (!warnings || warnings.length === 0) {
      return interaction.reply({
        content: `✅ O usuário <@${userId}> não possui advertências ativas.`,
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('🔍 Verificação de Advertências')
      .setDescription(`Advertências ativas de <@${userId}>`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setTimestamp()
      .setFooter({ text: `${config.branding.footerText} - Corregedoria` })

    warnings.forEach((warn, index) => {
      embed.addFields(
        {
          name: `⚠️ Advertência ${index + 1}`,
          value: `<@&${warn.roleId}>`,
          inline: true,
        },
        { name: `📌 Motivo`, value: `${warn.reason}`, inline: true },
        {
          name: `👮 Aplicada por`,
          value: `<@${warn.appliedBy}>`,
          inline: true,
        },
      )
    })

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
  },
}
