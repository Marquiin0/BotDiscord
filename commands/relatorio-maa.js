const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js')
const { reportMAAStatus } = require('../utils/identificationExpiryUtils')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('relatorio-maa')
    .setDescription('Envia o relatório de oficiais sem curso MAA.'),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
      !interaction.member.roles.cache.hasAny(...config.permissions.rhPlus)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    await reportMAAStatus(interaction.client)

    await interaction.editReply({ content: '✅ Relatório de oficiais sem curso MAA enviado com sucesso!' })
  },
}
