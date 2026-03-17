const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-batalhao')
    .setDescription('Configura o painel de solicitação de set no canal do batalhão')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const battalion = config.battalions.find(b => b.guildId === interaction.guildId)

    if (!battalion) {
      return interaction.reply({
        content: '❌ Este servidor não está configurado como batalhão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const channel = interaction.guild.channels.cache.get(battalion.channelId)
    if (!channel) {
      return interaction.reply({
        content: `❌ Canal configurado não encontrado (<#${battalion.channelId}>).`,
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`🪖 ${battalion.roleName} — Solicitação de Set`)
      .setDescription(
        `Bem-vindo ao processo de setagem do **${battalion.roleName}**!\n\n` +
        `Para se tornar membro deste batalhão, clique no botão abaixo.\n\n` +
        `Ao receber o cargo de membro, você também será registrado automaticamente no servidor principal da **${config.branding.name}**.`,
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('solicitar_set_batalhao')
        .setLabel('📋 Solicitar Set')
        .setStyle(ButtonStyle.Primary),
    )

    await channel.send({ embeds: [embed], components: [row] })

    await interaction.reply({
      content: `✅ Painel de set enviado para <#${battalion.channelId}>.`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
