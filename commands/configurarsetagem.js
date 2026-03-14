const {
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js')
const { SetagemConfig } = require('../database')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configurarsetagem')
    .setDescription('Configura a mensagem de boas-vindas enviada ao aceitar uma setagem.'),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
      !interaction.member.roles.cache.hasAny(...config.permissions.corregedoria)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    // Busca config atual
    const currentConfig = await SetagemConfig.findOne({
      where: { key: 'welcomeMessage' },
    })

    const modal = new ModalBuilder()
      .setCustomId('modal_configurar_setagem')
      .setTitle('Configurar Mensagem de Setagem')

    const messageInput = new TextInputBuilder()
      .setCustomId('setagem_welcome_message')
      .setLabel('Mensagem de boas-vindas (aceitar setagem)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        'Bem-vindo(a) à Genesis Police!\n\nVocê foi aceito(a) como estagiário...',
      )
      .setValue(
        currentConfig
          ? currentConfig.value
          : `Bem-vindo(a) à **${config.branding.name}**!\n\nVocê foi aceito(a) como Estagiário. Siga as regras e tenha uma boa estadia!\n\nRegras: ${config.cursoMAA.siteUrl}`,
      )
      .setRequired(true)
      .setMaxLength(2000)

    const row = new ActionRowBuilder().addComponents(messageInput)
    modal.addComponents(row)

    await interaction.showModal(modal)
  },
}
