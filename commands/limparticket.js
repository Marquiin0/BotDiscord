const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { Ticket } = require('../database'); // Ajuste o caminho conforme sua estrutura

module.exports = {
    data: new SlashCommandBuilder()
        .setName('limparticket')
        .setDescription('🧾 Remove os tickets de uma pessoa do banco de dados (apenas administradores)')
        .addUserOption(option =>
            option.setName('pessoa')
                .setDescription('Usuário cujo ticket será removido')
                .setRequired(true)
        ),

    async execute(interaction) {
         // Verifica se o usuário tem permissão de administrador
                if (
                    !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                    !interaction.memberPermissions.has(PermissionsBitField.Flags.UseApplicationCommands)
                ) {
                    return interaction.reply({
                        content: '❌ Você não tem permissão para usar este comando.',
                        flags: MessageFlags.Ephemeral,
                    });
                }

        const user = interaction.options.getUser('pessoa');

        try {
            // Remove todos os tickets onde o usuário abriu
            const deletedCount = await Ticket.destroy({
                where: { userIdOpened: user.id }
            });

            const embed = new EmbedBuilder()
                .setColor(deletedCount > 0 ? 'Green' : 'Orange')
                .setTitle('📋 Tickets Removidos')
                .setDescription(
                    deletedCount > 0
                        ? `🧾 Foram removidos \`${deletedCount}\` ticket(s) de <@${user.id}> do banco de dados.`
                        : `⚠️ Nenhum ticket encontrado para <@${user.id}>.`
                )
                .setFooter({ text: `Executado por ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: 64 }); // flags: 64 = ephemeral
        } catch (error) {
            console.error('Erro ao remover tickets:', error);
            await interaction.reply({
                content: '❌ Ocorreu um erro ao tentar remover os tickets.',
                flags: 64,
            });
        }
    }
};
