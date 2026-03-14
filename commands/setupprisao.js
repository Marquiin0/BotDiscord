const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupprisao')
    .setDescription('Configura o embed de relatórios de prisão no canal.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const channel = interaction.guild.channels.cache.get(config.channels.prisaoEmbed)
    if (!channel) {
      return interaction.reply({
        content: '❌ Canal de prisões não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`🚔 ${config.branding.name} - Relatórios de Prisão`)
      .setDescription(
        `Clique no botão abaixo para criar um relatório de prisão.\n\n` +
        `O relatório será criado e enviado no canal de logs de prisões.`,
      )
      .setImage(config.branding.bannerUrl)
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('relatorio_prisao')
        .setLabel('🚔 Criar Relatório de Prisão')
        .setStyle(ButtonStyle.Primary),
    )

    await channel.send({ embeds: [embed], components: [buttons] })

    await interaction.reply({
      content: `✅ Embed de prisões criado no canal <#${config.channels.prisaoEmbed}>!`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
