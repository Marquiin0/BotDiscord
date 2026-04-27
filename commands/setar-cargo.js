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
        // Apenas Sub Commander e Commander podem setar cargos
        if (!interaction.member.roles.cache.hasAny(...config.permissions.staffMerry)) {
            return interaction.reply({
                content: '❌ Apenas Sub Commander e Commander podem usar este comando.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const membroAlvo = interaction.options.getMember('membro');
        const opcaoEscolhida = interaction.options.getString('opcao');
        const memberRoles = interaction.member.roles.cache;

        let cargoAtribuir;
        if (opcaoEscolhida === 'membro') {
            cargoAtribuir = config.roles.membro;
        } else {
            // 'cmd' — atribui o mesmo cargo de comando do executor (CMD ou SCMD)
            if (memberRoles.has(config.ranks.CMD.roleId)) {
                cargoAtribuir = config.ranks.CMD.roleId;
            } else if (memberRoles.has(config.ranks.SCMD.roleId)) {
                cargoAtribuir = config.ranks.SCMD.roleId;
            } else {
                return interaction.editReply({
                    content: '❌ Você não possui um cargo de comando para atribuir.',
                });
            }
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
