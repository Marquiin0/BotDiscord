const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('registrar-rec')
    .setDescription('Registra um recrutamento e distribui pontos automaticamente.'),

  async execute(interaction) {
    const hasRole = interaction.member.roles.cache.some(r =>
      config.permissions.rec.includes(r.id),
    )
    if (!hasRole) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_registrar_rec')
      .setTitle('📋 Registro de Recrutamento')

    const recrutadorInput = new TextInputBuilder()
      .setCustomId('rec_recrutador')
      .setLabel('Recrutador (@menção)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('@Marquin')
      .setRequired(true)

    const auxiliaresInput = new TextInputBuilder()
      .setCustomId('rec_auxiliares')
      .setLabel('Auxiliares (@menções, separe por espaço)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('@Kamy @Apollo — deixe vazio se não houver')
      .setRequired(false)

    const idsInput = new TextInputBuilder()
      .setCustomId('rec_ids')
      .setLabel('IDs dos Recrutados (separe por espaço)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('1245 2249 1666 8663 8911')
      .setRequired(true)

    modal.addComponents(
      new ActionRowBuilder().addComponents(recrutadorInput),
      new ActionRowBuilder().addComponents(auxiliaresInput),
      new ActionRowBuilder().addComponents(idsInput),
    )

    await interaction.showModal(modal)
  },
}
