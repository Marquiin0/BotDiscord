const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: {
        name: 'sugerir'
    },
    async execute(message, args, client) {
        try {
            // Executa somente no canal com o ID especificado
            if (message.channel.id !== "1333590156208377928") return;
            if (!message.content.toLowerCase().startsWith('/sugerir ')) return;
            
            const suggestionText = message.content.slice(9).trim();
            if (!suggestionText) {
                return message.reply('Você precisa fornecer uma sugestão!');
            }
            
            // Deleta a mensagem original do usuário
            await message.delete();
            
            // Cria o embed com o autor (foto e nickname) e a descrição formatada:
            // > **Sugestão:**
            // ```conteúdo da sugestão```
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: message.member ? message.member.displayName : message.author.username,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                })
                .setDescription(`> **Sugestão:**\n\`\`\`${suggestionText}\`\`\``)
                .setColor(0x00AE86)
                .setTimestamp();
            
            // Cria os botões de votação com labels iniciais
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("sugerir_sim")
                        .setEmoji("✅")
                        .setLabel("• 0% - (0)")
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId("sugerir_nao")
                        .setEmoji("❌")
                        .setLabel("• 0% - (0)")
                        .setStyle(ButtonStyle.Danger)
                );
            
            // Envia o embed com os botões
            const sentMsg = await message.channel.send({ embeds: [embed], components: [row] });
            
            // Cria uma thread para debate, usando os primeiros 20 caracteres da sugestão como parte do nome
            try {
                await sentMsg.startThread({
                    name: `Debate: ${suggestionText.substring(0, 20)}...`,
                    autoArchiveDuration: 1440 // 24 horas em minutos
                });
            } catch (err) {
                console.error("Erro ao criar a thread:", err);
            }
            
            // Armazena os dados dos votos para que o listener global (em interactionCreate) possa atualizar os botões
            if (!client.sugerirVotes) {
                client.sugerirVotes = new Map();
            }
            client.sugerirVotes.set(sentMsg.id, {
                votes: {
                    sim: new Set(),
                    nao: new Set()
                },
                message: sentMsg
            });
        } catch (error) {
            console.error("Erro no comando sugerir:", error);
        }
    }
};
