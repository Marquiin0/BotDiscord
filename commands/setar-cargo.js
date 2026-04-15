const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { RoleLimit } = require('../database');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setar-cargo')
        .setDescription('Comando para setar cargo em um membro.')
        .addUserOption(option =>
            option
                .setName('membro')
                .setDescription('Membro que receberá o cargo.')
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
        // Verifica se o comando está sendo usado no canal de setagem aprovação
        if (interaction.channel.id !== config.channels.setagemAprovacao) {
            return interaction.reply({
                content: 'Este comando só pode ser utilizado neste canal.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Verifica se o usuário tem permissão para usar o comando
        // NOTE: These sub-division role IDs are from the old guild
        // Update when new guild sub-division roles are created
        const cargosPermitidos = config.permissions.corregedoria;
        if (!interaction.member.roles.cache.some(role => cargosPermitidos.includes(role.id))) {
            return interaction.reply({
                content: 'Você não tem permissão para usar este comando.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Após as verificações iniciais, defere a resposta para evitar timeout
        await interaction.deferReply({ ephemeral: true });

        // Obtém os parâmetros do comando
        const membroAlvo = interaction.options.getMember('membro');
        const opcaoEscolhida = interaction.options.getString('opcao');
        let cargoAtribuir;

        // NOTE: Sub-division role logic - these role IDs need to be updated
        // when the new guild sub-division roles are created.
        // For now, using a simplified approach based on rank roles
        const memberRoles = interaction.member.roles.cache;

        if (memberRoles.has(config.ranks.CMD.roleId)) {
            cargoAtribuir = opcaoEscolhida === 'cmd' ? config.ranks.CMD.roleId : config.roles.membro;
        } else if (memberRoles.has(config.ranks.SCMD.roleId)) {
            cargoAtribuir = opcaoEscolhida === 'cmd' ? config.ranks.SCMD.roleId : config.roles.membro;
        } else if (memberRoles.has(config.ranks.HC.roleId)) {
            cargoAtribuir = opcaoEscolhida === 'cmd' ? config.ranks.HC.roleId : config.roles.membro;
        } else if (memberRoles.has(config.ranks.IA.roleId)) {
            cargoAtribuir = opcaoEscolhida === 'cmd' ? config.ranks.IA.roleId : config.roles.membro;
        } else {
            return interaction.editReply({
                content: 'Lógica para o seu cargo ainda não foi implementada.',
            });
        }

        if (!cargoAtribuir) {
            return interaction.editReply({
                content: 'Opção inválida.',
            });
        }

        // Verifica se o membro alvo já possui o cargo para evitar duplicidade
        if (membroAlvo.roles.cache.has(cargoAtribuir)) {
            return interaction.editReply({
                content: `O membro ${membroAlvo.user.nickname} já possui o cargo <@&${cargoAtribuir}>.`,
            });
        }

        try {
            // Verifica se há um limite definido para o cargo que está sendo atribuído
            const roleLimitRecord = await RoleLimit.findOne({ where: { roleId: cargoAtribuir } });
            if (roleLimitRecord) {
                // Atualiza o cache dos membros para garantir dados atualizados
                await interaction.guild.members.fetch();
                // Conta quantos membros possuem o cargo específico
                const currentCount = interaction.guild.members.cache.filter(member =>
                    member.roles.cache.has(cargoAtribuir)
                ).size;

                if (currentCount >= roleLimitRecord.limit) {
                    return interaction.editReply({
                        content: `O limite para o cargo <@&${cargoAtribuir}> foi atingido (Limite: ${roleLimitRecord.limit}).`,
                    });
                }
            }
        } catch (error) {
            console.error('Erro ao verificar o limite do cargo:', error);
            return interaction.editReply({
                content: 'Erro ao verificar o limite do cargo.',
            });
        }

        try {
            // Atribui o cargo ao membro selecionado
            await membroAlvo.roles.add(cargoAtribuir, `Cargo setado por ${interaction.user}`);
            await interaction.editReply({
                content: `Cargo setado com sucesso para ${membroAlvo}.`,
            });

            // Envia log da operação no canal de setagem aprovação
            const canalLog = await interaction.client.channels.fetch(config.channels.setagemAprovacao);
            if (canalLog) {
                canalLog.send(
`CMD: ${interaction.user}
Oficial setado: ${membroAlvo}
Batalhão: (<@&${cargoAtribuir}>)`
                );
            }
        } catch (error) {
            console.error('Erro ao setar o cargo:', error);
            return interaction.editReply({
                content: 'Ocorreu um erro ao tentar setar o cargo.',
            });
        }
    },
};
