const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, MessageFlags } = require('discord.js')
const path = require('path')
const config = require('../config')
const { attachImage } = require('../utils/attachImage')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupticketlogs')
    .setDescription('Configura o embed de tickets no Discord de FTO.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral })
    }

    const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
    if (!logsGuild) return interaction.reply({ content: '❌ Guild de logs não encontrada.', flags: MessageFlags.Ephemeral })

    const channel = logsGuild.channels.cache.get(config.logsChannels.ticketsLogs)
    if (!channel) return interaction.reply({ content: '❌ Canal de tickets não encontrado.', flags: MessageFlags.Ephemeral })

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📩 Tickets - ${config.branding.name} FTO`)
      .setDescription(
        'Precisa de ajuda ou tem alguma dúvida?\n\n' +
        'Clique no botão abaixo para abrir um ticket.\n' +
        'Um membro da equipe irá atendê-lo o mais breve possível.\n\n' +
        '⚠️ **Atenção:** Não abra tickets desnecessários.',
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_fto_abrir')
        .setLabel('🎟 Abrir Ticket')
        .setStyle(ButtonStyle.Primary),
    )

    await channel.send({ embeds: [embed], components: [buttons], files: [banner.attachment] })
    await interaction.reply({ content: `✅ Embed de tickets enviado no canal <#${config.logsChannels.ticketsLogs}>.`, flags: MessageFlags.Ephemeral })
  },
}
