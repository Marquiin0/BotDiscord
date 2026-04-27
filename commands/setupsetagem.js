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
    .setName('setupsetagem')
    .setDescription('Configura o embed de setagem/recrutamento no canal.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const channel = interaction.guild.channels.cache.get(config.channels.setagem)
    if (!channel) {
      return interaction.reply({
        content: '❌ Canal de setagem não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📋 ${config.branding.name} — Solicitar Setagem`)
      .setDescription(
        `Bem-vindo ao processo de setagem da **${config.branding.name}**!\n\n` +
        `Ao clicar no botão abaixo, abrirá um **formulário** para você preencher:\n\n` +
        `• **Recrutador** — quem te indicou\n` +
        `• **Nome do personagem**\n` +
        `• **ID do personagem**\n\n` +
        `Após enviar, sua solicitação será analisada pelo comando.`,
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('solicitar_setagem')
        .setLabel('📋 Solicitar Setagem')
        .setStyle(ButtonStyle.Primary),
    )

    await channel.send({ embeds: [embed], components: [buttons], files: [banner.attachment] })

    await interaction.reply({
      content: `✅ Embed de setagem criado no canal <#${config.channels.setagem}>!`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
