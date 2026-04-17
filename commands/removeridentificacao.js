const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { Identificacao } = require('../database.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removeriden')
    .setDescription('Remove o registro de identificação de um usuário pelo userId do Discord.')
    .addStringOption(option =>
      option
        .setName('user_id')
        .setDescription('ID do usuário do Discord (ex: 123456789012345678)')
        .setRequired(true)
    ),

  async execute(interaction) {

     // Verifica permissão
          if (
            !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
            !interaction.member.roles.cache.hasAny(...config.permissions.rhPlus)
          ) {
            return await interaction.editReply({
              content: '❌ Você não tem permissão.'
            })
          }

    const userId = interaction.options.getString('user_id');

    // Verifica se o userId é válido
    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({
        content: '❌ O ID fornecido não é válido. Verifique e tente novamente.',
        ephemeral: true,
      });
    }

    try {
      const registro = await Identificacao.findOne({ where: { userId } });

      if (!registro) {
        return interaction.reply({
          content: `⚠️ Nenhum registro de identificação encontrado para o ID \`${userId}\`.`,
          ephemeral: true,
        });
      }

      await registro.destroy();

      // Remove cargo identificado e adiciona não identificado
      try {
        const targetMember = interaction.guild.members.cache.get(userId) ||
          await interaction.guild.members.fetch(userId).catch(() => null)
        if (targetMember) {
          await targetMember.roles.remove(config.roles.identificado).catch(console.error)
          await targetMember.roles.add(config.roles.naoIdentificado).catch(console.error)
        }
      } catch (err) {
        console.error('Erro ao remover cargo de identificado:', err)
      }

      return interaction.reply({
        content: `✅ O registro de identificação do usuário com ID \`${userId}\` foi **removido com sucesso** e os cargos foram atualizados.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Erro ao remover identificação:', error);
      return interaction.reply({
        content: '❌ Ocorreu um erro ao tentar remover o registro. Tente novamente mais tarde.',
        ephemeral: true,
      });
    }
  },
};
