const { SlashCommandBuilder, PermissionsBitField } = require('discord.js')
const updateMemberIDs = require('../utils/updateMembersIDs') // Importe a função refatorada
const { MessageFlags } = require('discord.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('saveids')
    .setDescription(
      'Salva os IDs dos usuários com um certo cargo em um banco de dados.'
    ),
  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
      !interaction.memberPermissions.has(PermissionsBitField.Flags.UseApplicationCommands)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    await updateMemberIDs(interaction.guild)
    await interaction.editReply({
      content: `Atualização concluída. Nomes dos membros atualizados conforme necessário.`,
    })
  },
}
