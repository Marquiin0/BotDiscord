const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { reportIdentificationStatus } = require('../utils/identificationExpiryUtils');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('relatorio-identificacao')
    .setDescription('Envia o relatório de identificações (sem identificação + expiradas).'),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
      !interaction.member.roles.cache.hasAny(...config.permissions.rhPlus)
    ) {
      return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await reportIdentificationStatus(interaction.client);

    await interaction.editReply({ content: '✅ Relatório de identificações enviado com sucesso!' });
  },
};
