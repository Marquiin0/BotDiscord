const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { updateLeaderboard } = require('../utils/leaderboardUpdate');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking-update')
    .setDescription('Força a atualização imediata do ranking de pontos.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({
        content: '❌ Você não tem permissão para executar este comando.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await updateLeaderboard(interaction.client, config.channels.ranking);
      return interaction.editReply({ content: '✅ Ranking atualizado com sucesso!' });
    } catch (error) {
      console.error('Erro ao forçar atualização do ranking:', error);
      return interaction.editReply({ content: '❌ Erro ao atualizar o ranking.' });
    }
  },
};
