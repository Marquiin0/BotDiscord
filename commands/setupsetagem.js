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
      .setTitle(`📋 ${config.branding.name} - Solicitar Setagem`)
      .setDescription(
        `Bem-vindo ao sistema de setagem da ${config.branding.name}!\n\n` +
        `Ao clicar no botão abaixo, será criado um canal privado onde você deverá preencher:\n\n` +
        `1. **Nome do recrutador** (quem te indicou)\n` +
        `2. **Seu nome** (nome do personagem)\n` +
        `3. **Seu ID** (ID do personagem)\n` +
        `4. **Foto do personagem** (fardamento correto)\n\n` +
        `Após o preenchimento, sua setagem será analisada pelo comando.`,
      )
      .setImage(config.branding.bannerUrl)
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('solicitar_setagem')
        .setLabel('📋 Solicitar Setagem')
        .setStyle(ButtonStyle.Primary),
    )

    await channel.send({ embeds: [embed], components: [buttons] })

    await interaction.reply({
      content: `✅ Embed de setagem criado no canal <#${config.channels.setagem}>!`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
