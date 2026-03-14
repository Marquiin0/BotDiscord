const { SlashCommandBuilder } = require('discord.js')
const { PermissionsBitField } = require('discord.js')
const { MessageFlags } = require('discord.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lista')
    .setDescription('Lista todos os membros com um cargo específico.')
    .addRoleOption(option =>
      option
        .setName('cargo')
        .setDescription('O cargo cujos membros deseja listar.')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      if (
        !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
        !interaction.memberPermissions.has(PermissionsBitField.Flags.UseApplicationCommands)
      ) {
        return interaction.reply({
          content: '❌ Você não tem permissão.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const role = interaction.options.getRole('cargo')

      if (!role) {
        return interaction.reply({
          content: '❌ Cargo não encontrado.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Obtém os membros diretamente do servidor para evitar cache incompleto
      await interaction.guild.members.fetch();
      const members = role.members.map(member => member.toString());

      if (members.length === 0) {
        return interaction.reply({
          content: `⚠️ Nenhum membro encontrado com o cargo ${role}.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Formata a mensagem com título, quantidade e menciona os usuários
      const header = `**OFICIAIS COM CARGO ${role} (${members.length})**\n`;
      const chunkSize = 2000 - header.length;
      let response = header;
      const messages = [];

      for (const member of members) {
        if (response.length + member.length + 2 > chunkSize) {
          messages.push(response);
          response = header;
        }
        response += `\n${member}`;
      }
      messages.push(response);

      // Envia a resposta em partes, caso necessário
      await interaction.reply({ content: messages[0] });
      for (let i = 1; i < messages.length; i++) {
        await interaction.followUp({ content: messages[i] });
      }
    } catch (error) {
      console.error('Erro ao executar o comando /lista:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao buscar os membros desse cargo.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
}
