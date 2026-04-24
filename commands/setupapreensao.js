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
    .setName('setupapreensao')
    .setDescription('Configura o embed de relatórios de apreensão no canal.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const channel = interaction.guild.channels.cache.get(config.channels.apreensaoEmbed)
    if (!channel) {
      return interaction.reply({
        content: '❌ Canal de apreensões não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📦 ${config.branding.name} - Relatórios de Apreensão`)
      .setDescription(
        `Clique no botão abaixo para criar um relatório de apreensão.\n\n` +
        `O relatório será criado e enviado no canal de logs de apreensões.`,
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('relatorio_apreensao')
        .setLabel('📦 Criar Relatório de Apreensão')
        .setStyle(ButtonStyle.Primary),
    )

    await channel.send({ embeds: [embed], components: [buttons], files: [banner.attachment] })

    await interaction.reply({
      content: `✅ Embed de apreensões criado no canal <#${config.channels.apreensaoEmbed}>!`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
