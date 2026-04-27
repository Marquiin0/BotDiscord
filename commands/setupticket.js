const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const path = require('path')
const config = require('../config')
const { attachImage } = require('../utils/attachImage')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupticket')
    .setDescription('Configura o painel de tickets no canal de tickets da MerryWeather.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const channel = interaction.guild.channels.cache.get(config.channels.tickets)
    if (!channel) {
      return interaction.reply({
        content: '❌ Canal de tickets não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📩 ${config.branding.name} — Tickets`)
      .setDescription(
        'Selecione abaixo o tipo de ticket que deseja abrir.\n' +
        'Cada ticket trata um assunto específico:',
      )
      .addFields(
        {
          name: '🛂 Corregedoria',
          value: 'Assuntos internos, denúncias e solicitações de exoneração.',
        },
        {
          name: '🚨 Alto Comando',
          value: 'Assuntos voltados ao comando da MerryWeather.',
        },
        {
          name: '❓ Dúvidas',
          value: 'Dúvidas gerais sobre regras, processos ou comandos.',
        },
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_corregedoria')
        .setLabel('🛂 Corregedoria')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ticket_alto_comando')
        .setLabel('🚨 Alto Comando')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ticket_duvidas')
        .setLabel('❓ Dúvidas')
        .setStyle(ButtonStyle.Secondary),
    )

    await channel.send({ embeds: [embed], components: [row], files: [banner.attachment] })

    await interaction.reply({
      content: `✅ Painel de tickets enviado em <#${config.channels.tickets}>.`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
