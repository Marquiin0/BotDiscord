const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { RemovedRole } = require('../database'); // ajuste o caminho conforme sua estrutura
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remover-cargo')
        .setDescription('Remove um cargo de um membro e atribui um cargo temporário.')
        .addUserOption(option =>
            option
                .setName('pessoa')
                .setDescription('Pessoa de quem será removido o cargo.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('opcao')
                .setDescription('Selecione entre CMD ou Membro.')
                .setRequired(true)
                .addChoices(
                    { name: 'CMD', value: 'cmd' },
                    { name: 'Membro', value: 'membro' }
                )
        ),

    async execute(interaction) {
        // Restrição: o comando só pode ser usado no canal de setagem
        if (interaction.channel.id !== config.channels.setagem) {
            return interaction.reply({
                content: 'Este comando só pode ser utilizado neste canal.',
                flags: MessageFlags.Ephemeral
            });
        }

        // IDs dos cargos que autorizam o uso do comando
        // NOTE: These sub-division role IDs are from the old guild
        // Update these when the new guild sub-division roles are created
        const cargosPermitidos = config.permissions.corregedoria;
        if (!interaction.member.roles.cache.some(role => cargosPermitidos.includes(role.id))) {
            return interaction.reply({
                content: 'Você não tem permissão para usar este comando.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Obtém os parâmetros: pessoa e opção
        const targetMember = interaction.options.getMember('pessoa');
        const optionChosen = interaction.options.getString('opcao');
        let roleToRemove;

        // NOTE: Sub-division role logic - these role IDs need to be updated
        // when the new guild sub-division roles are created.
        // For now, using a simplified approach based on rank roles
        // The executor's highest permission role determines what they can remove
        const memberRoles = interaction.member.roles.cache;

        // Check from highest to lowest permission
        if (memberRoles.has(config.ranks.CMD.roleId)) {
            roleToRemove = optionChosen === 'cmd' ? config.ranks.CMD.roleId : config.roles.membro;
        } else if (memberRoles.has(config.ranks.SCMD.roleId)) {
            roleToRemove = optionChosen === 'cmd' ? config.ranks.SCMD.roleId : config.roles.membro;
        } else if (memberRoles.has(config.ranks.HC.roleId)) {
            roleToRemove = optionChosen === 'cmd' ? config.ranks.HC.roleId : config.roles.membro;
        } else if (memberRoles.has(config.ranks.IA.roleId)) {
            roleToRemove = optionChosen === 'cmd' ? config.ranks.IA.roleId : config.roles.membro;
        } else {
            return interaction.reply({
                content: 'Lógica para o seu cargo ainda não foi implementada.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!roleToRemove) {
            return interaction.reply({
                content: 'Opção inválida.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Valida se o membro alvo realmente possui o cargo a ser removido
        if (!targetMember.roles.cache.has(roleToRemove)) {
            return interaction.reply({
                content: `O membro ${targetMember.user.nickname} não possui o cargo para ser removido.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Cargo temporário a ser atribuído automaticamente (recruta)
        const tempRole = config.roles.recruta;

        try {
            const membernick = await interaction.guild.members.fetch(interaction.user.id);

            // Remove o cargo definido do membro
            await targetMember.roles.remove(roleToRemove, `Cargo removido por ${membernick.displayName}`);
            // Atribui o cargo temporário
            await targetMember.roles.add(tempRole, `Cargo temporário atribuído por ${membernick.displayName}`);

            // Define a data de expiração para 7 dias a partir de agora
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + 7);

            // Cria o registro no banco de dados
            await RemovedRole.create({
                userId: targetMember.user.id,
                roleId: tempRole,
                expiration: expirationDate
            });

            // Responde de forma efêmera ao usuário que executou o comando
            await interaction.reply({
                content: `Cargo removido com sucesso e cargo temporário atribuído para ${targetMember}.`,
                flags: MessageFlags.Ephemeral
            });

            // Envia log da operação no canal de setagem aprovação
            const logChannel = await interaction.client.channels.fetch(config.channels.setagemAprovacao);
            if (logChannel) {
                logChannel.send(
`CMD: ${interaction.user}
Remoção de set: ${targetMember}
Batalhão: (<@&${roleToRemove}>)
Cargo temporário atribuido: <@&${tempRole}>
Expiração: ${expirationDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
                );
            }
        } catch (error) {
            console.error('Erro ao remover o cargo:', error);
            return interaction.reply({
                content: 'Ocorreu um erro ao remover o cargo.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};
