const {
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const { updateLeaderboard } = require('../utils/leaderboardUpdate')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Força a atualização da tabela de ranking de pontos da loja.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !interaction.member.roles.cache.hasAny(...config.permissions.hcPlus)) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      await updateLeaderboard(interaction.client, config.channels.ranking)

      await interaction.editReply({
        content: `✅ Ranking atualizado no canal <#${config.channels.ranking}>!`,
      })
    } catch (error) {
      console.error('Erro ao atualizar ranking:', error)
      await interaction.editReply({ content: '❌ Erro ao atualizar o ranking.' })
    }
  },
}
