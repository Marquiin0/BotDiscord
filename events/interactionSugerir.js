// interactionCreate.sugerir.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const votesFilePath = path.join(__dirname, '..', 'sugerirVotes.json');

// Função para carregar os votos persistidos
function loadSugerirVotes() {
    try {
        if (fs.existsSync(votesFilePath)) {
            const data = fs.readFileSync(votesFilePath, 'utf8');
            const obj = JSON.parse(data);
            const map = new Map();
            for (const key in obj) {
                map.set(key, {
                    votes: {
                        sim: new Set(obj[key].votes.sim),
                        nao: new Set(obj[key].votes.nao)
                    }
                    // A propriedade "message" não é persistida, pois o objeto Message é volátil
                });
            }
            return map;
        }
    } catch (err) {
        console.error("Erro ao carregar votos:", err);
    }
    return new Map();
}

// Função para salvar os votos persistidos
function saveSugerirVotes(votesMap) {
    try {
        const obj = {};
        for (const [key, value] of votesMap.entries()) {
            obj[key] = {
                votes: {
                    sim: Array.from(value.votes.sim),
                    nao: Array.from(value.votes.nao)
                }
            };
        }
        fs.writeFileSync(votesFilePath, JSON.stringify(obj, null, 4));
    } catch (err) {
        console.error("Erro ao salvar votos:", err);
    }
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (interaction.deferred || interaction.replied) return
        if (!interaction.isButton()) return;

        // Verifica se o botão clicado é dos comandos de sugestão
        if (interaction.customId !== "sugerir_sim" && interaction.customId !== "sugerir_nao") return;

        // Garante que o Map de votos esteja carregado (ou carrega a partir do arquivo, se necessário)
        if (!client.sugerirVotes) {
            client.sugerirVotes = loadSugerirVotes();
        }

        // Recupera os dados da sugestão usando o ID da mensagem onde o embed foi enviado
        const suggestionData = client.sugerirVotes.get(interaction.message.id);
        if (!suggestionData) return; // Se não houver registro, não é uma sugestão registrada

        const votes = suggestionData.votes;

        // Remove votos anteriores do usuário (garante um voto único)
        votes.sim.delete(interaction.user.id);
        votes.nao.delete(interaction.user.id);

        // Registra o voto conforme o botão clicado
        if (interaction.customId === "sugerir_sim") {
            votes.sim.add(interaction.user.id);
        } else if (interaction.customId === "sugerir_nao") {
            votes.nao.add(interaction.user.id);
        }

        // Calcula o total de votos e as porcentagens
        const totalVotes = votes.sim.size + votes.nao.size;
        const simPercent = totalVotes ? Math.round((votes.sim.size / totalVotes) * 100) : 0;
        const naoPercent = totalVotes ? Math.round((votes.nao.size / totalVotes) * 100) : 0;

        // Cria uma nova ActionRow com os botões atualizados
        const updatedRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("sugerir_sim")
                    .setEmoji("✅")
                    .setLabel(`• ${simPercent}% - (${votes.sim.size})`)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("sugerir_nao")
                    .setEmoji("❌")
                    .setLabel(`• ${naoPercent}% - (${votes.nao.size})`)
                    .setStyle(ButtonStyle.Danger)
            );

        try {
            await interaction.update({ components: [updatedRow] });
        } catch (err) {
            console.error("Erro ao atualizar a interação:", err);
        }

        // Atualiza o arquivo persistente com os votos atuais
        saveSugerirVotes(client.sugerirVotes);
    }
};
