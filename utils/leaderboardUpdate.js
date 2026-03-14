const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { UserPontos } = require('../database'); // Certifique-se de importar o modelo UserPontos
const { DateTime } = require('luxon'); // Para o timestamp
const config = require('../config');

// Caminho do arquivo JSON onde o messageId será salvo
const messageIdFilePath = path.join(__dirname, 'leaderboardMessageId.json');

// Função para salvar o messageId no arquivo JSON
function saveMessageId(messageId) {
    const data = { messageId };
    fs.writeFileSync(messageIdFilePath, JSON.stringify(data, null, 2)); // Salva com formatação legível
}

// Função para carregar o messageId do arquivo JSON
function loadMessageId() {
    if (fs.existsSync(messageIdFilePath)) {
        try {
            const data = fs.readFileSync(messageIdFilePath);
            const parsed = JSON.parse(data);
            return parsed.messageId || null;
        } catch (error) {
            console.error('Erro ao carregar o arquivo JSON:', error);
            return null;
        }
    }
    return null;
}

// Função para obter os top 10 usuários com mais pontos
async function getTopUsers() {
    try {
        // Busca os top 10 usuários com mais pontos
        const topUsers = await UserPontos.findAll({
            order: [['pontos', 'DESC']], // Ordena pela quantidade de pontos
            limit: 30
        });

        const medals = ['🥇', '🥈', '🥉'];
        let leaderboard = '';
        topUsers.forEach((user, index) => {
            const prefix = index < 3 ? `${medals[index]}` : `${index + 1}.`;
            leaderboard += `${prefix} <@${user.userId}> — **${user.pontos}** pts\n`;
        });

        return leaderboard;
    } catch (error) {
        console.error('Erro ao buscar top usuários:', error);
        return 'Erro ao buscar usuários com mais pontos.';
    }
}

// Função para construir o embed com o leaderboard de top usuários
async function buildLeaderboardMessage() {
    const localTime = DateTime.now().setZone('America/Sao_Paulo').toFormat('dd/MM/yyyy, HH:mm:ss');
    const leaderboard = await getTopUsers();

    const embed = new EmbedBuilder()
        .setTitle('Tabela de procedência duvidosa do Apollo')
        .setDescription(leaderboard || 'Não há dados disponíveis no momento.')
        .setImage(config.branding.bannerUrl)
        .setColor('#FFD700')
        .setTimestamp()
        .setFooter({ text: `Atualizado em ${localTime}` });

    return embed;
}

// Função para atualizar o embed de leaderboard no canal específico
async function updateLeaderboard(client, channelId) {
    const guildId = config.guilds.main;
    let guild;

    try {
        // Buscar a guild no cache ou forçar a busca
        guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);

        if (!guild) {
            console.log('Guild não encontrada.');
            return;
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            console.log('Canal não encontrado.');
            return;
        }

        const embed = await buildLeaderboardMessage();

        // Carregar o messageId salvo
        const savedMessageId = loadMessageId();

        if (savedMessageId) {
            try {
                const message = await channel.messages.fetch(savedMessageId);
                if (message) {
                    await message.edit({ embeds: [embed] });
                    console.log('Leaderboard atualizado.');
                } else {
                    await sendNewLeaderboardMessage(channel, embed);
                }
            } catch (error) {
                console.log('Mensagem não encontrada, criando uma nova...');
                await sendNewLeaderboardMessage(channel, embed);
            }
        } else {
            console.log('Nenhuma mensagem encontrada, criando uma nova...');
            await sendNewLeaderboardMessage(channel, embed);
        }
    } catch (error) {
        console.error('Erro ao tentar acessar a guild ou canal:', error);
    }
}

// Função para enviar uma nova mensagem de leaderboard
async function sendNewLeaderboardMessage(channel, embed) {
    try {
        const newMessage = await channel.send({ embeds: [embed] });
        // Salva o messageId da nova mensagem
        saveMessageId(newMessage.id);
        console.log('Leaderboard enviado e messageId salvo.');
    } catch (error) {
        console.error('Erro ao enviar o leaderboard:', error);
    }
}

// Função para agendar a atualização a cada 1h
function startLeaderboardUpdate(client) {
    // Executa imediatamente na inicialização
    updateLeaderboard(client, config.channels.ranking);
    // Depois atualiza a cada 1 hora
    setInterval(async () => {
        await updateLeaderboard(client, config.channels.ranking);
    }, 60 * 60 * 1000);
}

module.exports = {
    startLeaderboardUpdate
};
