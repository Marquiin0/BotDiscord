const { SlashCommandBuilder, MessageFlags, PermissionsBitField } = require('discord.js');
// Certifique-se de ajustar o caminho para o seu arquivo de database conforme a estrutura do projeto
const { RoleLimit } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('limite-set')
        .setDescription('Define um limite para um cargo (apenas administradores).')
        .addRoleOption(option =>
            option
                .setName('cargo')
                .setDescription('Selecione o cargo para definir o limite.')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('limite')
                .setDescription('Informe o limite para o cargo.')
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

        const role = interaction.options.getRole('cargo');
        const limit = interaction.options.getInteger('limite');

        try {
            // Procura um registro existente para o cargo
            let roleLimitRecord = await RoleLimit.findOne({ where: { roleId: role.id } });

            if (roleLimitRecord) {
                // Atualiza o registro existente
                await roleLimitRecord.update({ limit });
                return interaction.reply({
                    content: `Limite atualizado para o cargo **${role.name}**: ${limit}.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                // Cria um novo registro se não existir
                await RoleLimit.create({
                    roleId: role.id,
                    limit: limit
                });
                return interaction.reply({
                    content: `Limite definido para o cargo **${role.name}**: ${limit}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            console.error('Erro ao definir limite:', error);
            return interaction.reply({ content: 'Ocorreu um erro ao definir o limite.', flags: MessageFlags.Ephemeral });
        }
    },
};
