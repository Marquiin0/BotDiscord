const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { UserPontos } = require('../database');
const { DateTime } = require('luxon');
const config = require('../config');

const messageIdFilePath = path.join(__dirname, 'leaderboardMessageId.json');

function saveMessageId(messageId) {
    fs.writeFileSync(messageIdFilePath, JSON.stringify({ messageId }, null, 2));
}

function loadMessageId() {
    try {
        if (fs.existsSync(messageIdFilePath)) {
            const parsed = JSON.parse(fs.readFileSync(messageIdFilePath));
            return parsed.messageId || null;
        }
    } catch (error) {
        console.error('Erro ao carregar messageId:', error);
    }
    return null;
}

async function getTopUsers() {
    try {
        const topUsers = await UserPontos.findAll({
            order: [['pontos', 'DESC']],
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

async function buildLeaderboardMessage() {
    const localTime = DateTime.now().setZone('America/Sao_Paulo').toFormat('dd/MM/yyyy, HH:mm:ss');
    const leaderboard = await getTopUsers();

    const bannerPath = path.join(__dirname, '..', config.branding.bannerPath);
    const bannerName = path.basename(config.branding.bannerPath);
    const attachment = new AttachmentBuilder(bannerPath, { name: bannerName });

    const embed = new EmbedBuilder()
        .setTitle('🏆 Ranking de Pontos da Loja')
        .setDescription(leaderboard || 'Não há dados disponíveis no momento.')
        .setImage(`attachment://${bannerName}`)
        .setColor(config.branding.color)
        .setTimestamp()
        .setFooter({ text: `${config.branding.footerText} • Atualizado em ${localTime}` });

    return { embed, attachment };
}

// Na inicialização: encontra a mensagem do bot no canal, edita ela, e apaga as duplicadas
async function initLeaderboard(client, channelId) {
    try {
        const guild = client.guilds.cache.get(config.guilds.main) || await client.guilds.fetch(config.guilds.main);
        if (!guild) return;

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;

        const { embed, attachment } = await buildLeaderboardMessage();

        // Busca TODAS as mensagens do bot no canal
        const messages = await channel.messages.fetch({ limit: 50 });
        const botMessages = messages.filter(m => m.author.id === client.user.id);

        if (botMessages.size > 0) {
            // Pega a primeira mensagem (mais antiga) e edita ela
            const sorted = [...botMessages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
            const keepMessage = sorted[0];

            await keepMessage.edit({ embeds: [embed], files: [attachment] });
            saveMessageId(keepMessage.id);
            console.log(`Leaderboard editado na mensagem existente (${keepMessage.id}).`);

            // Apaga todas as outras mensagens duplicadas do bot
            for (let i = 1; i < sorted.length; i++) {
                try {
                    await sorted[i].delete();
                    console.log(`Mensagem duplicada apagada: ${sorted[i].id}`);
                } catch (err) {
                    console.error(`Não conseguiu apagar mensagem ${sorted[i].id}:`, err.message);
                }
            }
        } else {
            // Nenhuma mensagem do bot — cria uma nova
            const newMessage = await channel.send({ embeds: [embed], files: [attachment] });
            saveMessageId(newMessage.id);
            console.log('Leaderboard criado e messageId salvo.');
        }
    } catch (error) {
        console.error('Erro ao inicializar leaderboard:', error);
    }
}

// Atualização periódica — edita a mensagem existente, recria se necessário
async function updateLeaderboard(client, channelId) {
    try {
        const guild = client.guilds.cache.get(config.guilds.main) || await client.guilds.fetch(config.guilds.main);
        if (!guild) return;

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;

        const { embed, attachment } = await buildLeaderboardMessage();
        const savedMessageId = loadMessageId();

        if (savedMessageId) {
            try {
                const message = await channel.messages.fetch(savedMessageId);
                const newAttachment = new AttachmentBuilder(path.join(__dirname, '..', config.branding.bannerPath), { name: path.basename(config.branding.bannerPath) });
                await message.edit({ embeds: [embed], files: [newAttachment] });
                console.log('Leaderboard atualizado.');
                return;
            } catch {
                console.log('Mensagem não encontrada, recriando...');
            }
        }

        // Se não existe ou não encontrou, cria nova
        const newMessage = await channel.send({ embeds: [embed], files: [attachment] });
        saveMessageId(newMessage.id);
        console.log('Leaderboard recriado e messageId salvo.');
    } catch (error) {
        console.error('Erro ao atualizar leaderboard:', error);
    }
}

function startLeaderboardUpdate(client) {
    // Inicializa: encontra/edita mensagem existente, apaga duplicadas
    initLeaderboard(client, config.channels.ranking);

    // Atualiza a cada 5 minutos (só edita, nunca cria nova)
    setInterval(async () => {
        await updateLeaderboard(client, config.channels.ranking);
    }, 5 * 60 * 1000);
}

module.exports = {
    startLeaderboardUpdate,
    updateLeaderboard
};
