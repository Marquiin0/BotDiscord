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
    .setName('setupacoes')
    .setDescription('Configura o embed de relatórios de ações no canal.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const channel = interaction.guild.channels.cache.get(config.channels.acoes)
    if (!channel) {
      return interaction.reply({
        content: '❌ Canal de ações não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`⚔️ ${config.branding.name} - Relatórios de Ações`)
      .setDescription(
        `Clique no botão abaixo para criar um relatório de ação.\n\n` +
        `O relatório será criado em um canal privado onde você preencherá os dados da ação.`,
      )
      .setImage(config.branding.bannerUrl)
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('relatorio_acao')
        .setLabel('📋 Criar Relatório de Ação')
        .setStyle(ButtonStyle.Primary),
    )

    await channel.send({ embeds: [embed], components: [buttons] })

    await interaction.reply({
      content: `✅ Embed de ações criado no canal <#${config.channels.acoes}>!`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
