const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { RemovedRole } = require('../database'); // ajuste o caminho conforme sua estrutura

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
        // Restrição: o comando só pode ser usado no canal especificado
        if (interaction.channel.id !== '1353204226876248074') {
            return interaction.reply({ 
                content: 'Este comando só pode ser utilizado neste canal.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // IDs dos cargos que autorizam o uso do comando
        const cargosPermitidos = ['1333590154660679744', '1346721354753376256'];
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

        // Lógica de remoção: se o usuário que executa o comando possui o cargo "1346721354753376256"
        // define qual cargo será removido, conforme a opção selecionada.
        if (interaction.member.roles.cache.has('1346721354753376256')) {
            if (optionChosen === 'cmd') {
                roleToRemove = '1346721354753376256';
            } else if (optionChosen === 'membro') {
                roleToRemove = '1346721297836802068';
            }
        } 
        
        if (interaction.member.roles.cache.has('1333590154660679744')) {
            if (optionChosen === 'cmd') {
                roleToRemove = '1333590154660679744';
            } else if (optionChosen === 'membro') {
                roleToRemove = '1333590154660679745';
            }
        }else {
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
                content: `O membro ${targetMember.user.tag} não possui o cargo para ser removido.`,
                flags: MessageFlags.Ephemeral 
            });
        }

        // Cargo temporário a ser atribuído automaticamente
        const tempRole = '1350575714520531036';

        try {
            // Remove o cargo definido do membro
            await targetMember.roles.remove(roleToRemove, `Cargo removido por ${interaction.user.tag}`);
            // Atribui o cargo temporário
            await targetMember.roles.add(tempRole, `Cargo temporário atribuído por ${interaction.user.tag}`);

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

            // Envia log da operação no canal específico com o padrão solicitado
            const logChannel = await interaction.client.channels.fetch('1353204226876248074');
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
