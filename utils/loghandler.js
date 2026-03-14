const { EmbedBuilder } = require('discord.js');
const { MemberID, UserLog, UserPoints, WeaponLog, WeeklyPoints  } = require('../database');
const moment = require('moment');
const { Op } = require('sequelize');
const config = require('../config');


// Alias do item e seus respectivos pontos (ajuste conforme necessário)
const pointValues = {
    "FN Five Seven": 90000,
    "Pistol HK": 70000,
    "Magnum 44": 115000,
    "AK-47 MK2": 190000,
    "AK-47": 190000,
    "M4 SPEC": 190000,
    "Tec-9": 100000,
    "MTAR-21": 135000,
    "Sniper": 350000,
    "SMG MK2": 135000,
    "Micro Smg": 135000,
    "M.FN Five Seven": 550,
    "M.Pistol HK": 550,
    "M-MicroSmg": 550,
    "M.M4 Spec": 550,
    "M.AK47": 550,
    "M.MP5": 550,
    "M.MTAR-21": 550,
    "Munição Sniper": 1250,
    "Dinheiro Sujo": 0.35,
    "Dorfrex": 10000,
    "Paracetamil": 10000,
    "Kit de Reparos": 10000,
    "Militec": 5000,
    "Galão": 2500,
    "Celular": 2000,
    "Jogodepneu": 2500,
    "Adrenalina": 20000,
};

const itemsNoPointsWhenAdded = [
    "Dorfrex",
    "Paracetamil",
    "Kit de Reparos",
    "Militec",
    "Galão",
    "Celular",
    "Jogodepneu",
    "Adrenalina",
    "K9 embalada",
    "Skunk embalada",
    "Ecstasy embalada",
    "Maconha",
    "Masterpick",
];
const lastSunday = moment().day(0).subtract(moment().day() === 0 ? 7 : 0, 'days').endOf('day').toDate();


const extractLogData = messageContent => {
    const logPattern = /\[ID\]:\s*(\d+)\s*([^\n]+)\n\[([A-Z]+)\]:\s*(\d+)\s*([^\n]+)\n\[BAU\]:\s*([^\n]+)\n\[CDS\]:\s*([^\n]+)\n\[Data\]:\s*(\d{2}\/\d{2}\/\d{4})\s*\[Hora\]:\s*(\d{2}:\d{2}:\d{2})/gi;
    const matches = [...messageContent.matchAll(logPattern)];
    return matches.map(match => ({
        userId: match[1].trim(),
        userName: match[2].replace(/\[(MW|CMD)\]\s*/, '').split('|')[0].trim(),
        action: match[3],
        quantity: parseInt(match[4], 10),
        item: match[5].trim(),
        date: `${match[8]} ${match[9]}`
    }));
};

const getMemberIds = async () => {
    try {
        const members = await MemberID.findAll({
            attributes: ['discordId', 'memberName'],
        });
        return members.reduce((ids, member) => {
            ids[member.discordId] = {
                memberName: member.memberName,
            };
            return ids;
        }, {});
    } catch (error) {
        console.error('Erro ao buscar os IDs dos membros:', error);
        return {};
    }
};

async function sendLogMessage(logChannel, user) {
    try {
        const embed = new EmbedBuilder()
            .setTitle('Log de Registro')
            .setDescription(`Sala de log criada para o usuário <@${user.id}>.

Essa sala é destinada para contabilizar seus pontos na Merry.

Caso você complete uma semana com um saldo de pontos negativo, indicando que retirou mais pontos do que adicionou, você receberá uma advertência.

Referência de pontos ao adicionar itens:
\`\`\`
║ Pistola Five    ║   90.000        ║
║ Pistola HK      ║   70.000        ║
║ Pistola Magnum  ║   115.000       ║
║ Fuzil AK-47 MK2 ║   190.000       ║
║ Fuzil AK-47     ║   190.000       ║
║ Fuzil M4 Spec   ║   190.000       ║
║ SMG Tec-9       ║   100.000       ║
║ SMG Mtar        ║   135.000       ║
║ Sniper          ║   350.000       ║
║ SMG MK2         ║   135.000       ║
║ SMG Thompson    ║   135.000       ║
║ Munição Pistola ║   550           ║
║ Munição Fuzil   ║   550           ║
║ Munição Sub     ║   550           ║
║ Munição Sniper  ║   1.250         ║
\`\`\`

Referência de pontos ao retirar itens do baú:
\`\`\`
║ Remédio         ║   10.000        ║
║ Kit de reparo   ║   10.000        ║
║ Militec         ║   5.000         ║
║ Galão           ║   2.500         ║
║ Celular         ║   2.000         ║
║ Jogo de Pneus   ║   2.500         ║
║ Adrenalina      ║   20.000        ║
\`\`\`
`)
            .setColor('#00FF00')
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });
        console.log(`Log de registro enviado para o canal ${logChannel.name}.`);
    } catch (error) {
        console.error('Erro ao enviar mensagem de log:', error);
    }
}

const cleanOldLogs = async () => {
    try {
        const sevenDaysAgo = moment().subtract(7, 'days').toDate();
        const deletedLogs = await WeaponLog.destroy({
            where: {
                date: { [Op.lt]: sevenDaysAgo }
            }
        });
        console.log(`Logs antigos deletados: ${deletedLogs} registros.`);
    } catch (error) {
        console.error('Erro ao limpar logs antigos:', error);
    }
};

let lastProcessedMessageId = null;

const processSingleMessage = async (message) => {
    const memberIds = await getMemberIds();

    const guild = message.client.guilds.cache.get(config.guilds.logs)

    const logData = extractLogData(message.content);
    if (!logData.length) return;

    for (const log of logData) {
        const { userId, action, quantity, item, date } = log;

        // Ignorar itens não registrados em pointValues ou registros antigos
        if (!pointValues.hasOwnProperty(item)) continue;


        const memberInfo = memberIds[userId];
        if (!memberInfo) continue;

        let points = 0;
        if (!(action === 'COLOCOU' && itemsNoPointsWhenAdded.includes(item))) {
            points = Math.round(pointValues[item] * quantity * (action === 'COLOCOU' ? 1 : -1));
        }

        console.log(`Atualizando log para usuário ${userId}: ${action} ${quantity} ${item} com ${points} pontos.`);

        // Atualize ou crie o registro do banco de dados para UserLog
        await UserLog.create({
            userId,
            userName: memberInfo.memberName,
            action,
            item,
            quantity,
            points,
        });

        // Atualize o banco de dados para weaponlog
        const trackedWeapons = ["FN Five Seven", "Pistol HK", "MTAR-21", "AK-47", "M4 SPEC", "Tec-9", "Micro Smg"];
        if (trackedWeapons.includes(item) && action === 'COLOCOU') {
            console.log(`Arma rastreada ${item} adicionada pelo usuário ${userId}. Atualizando WeaponLog.`);
            await WeaponLog.create({
                userId,
                userName: memberInfo.memberName,
                item,
                date: moment(date, 'DD/MM/YYYY HH:mm:ss').toDate(),
                quantity
            });
        }

        // Obtenha o total atual de pontos do UserPoints
        const userPointsEntry = await UserPoints.findOne({ where: { userId } });

        let totalPoints = userPointsEntry ? userPointsEntry.totalPoints : 0;

        // Atualize o total de pontos com base na ação atual
        totalPoints += points;

        // Atualize ou crie o registro do banco de dados para UserPoints
        if (userPointsEntry) {
            userPointsEntry.totalPoints = totalPoints;
            await userPointsEntry.save();
        } else {
            await UserPoints.create({
                userId,
                userName: memberInfo.memberName,
                totalPoints
            });
        }

        // Filtrar registros na tabela UserLogs desde o último domingo às 23:59
        const userLogs = await UserLog.findAll({
            where: {
                userId: userId,
                createdAt: {
                    [Op.gte]: lastSunday
                }
            }
        });

        // Calcular os pontos semanais
        let weeklyPoints = userLogs.reduce((total, log) => total + log.points, 0);

        // Atualizar ou criar a entrada na tabela WeeklyPoints
        const weeklyPointsEntry = await WeeklyPoints.findOne({
            where: {
                userId: userId,
            }
        });

        if (weeklyPointsEntry) {
            weeklyPointsEntry.weeklyPoints = weeklyPoints;
            await weeklyPointsEntry.save();
        } else {
            await WeeklyPoints.create({
                userId: userId,
                userName: memberInfo.memberName, // Usando memberInfo.memberName para definir userName
                weeklyPoints: weeklyPoints,
            });
        }
        // Envie a mensagem para o canal de log do usuário
        const userLogChannelName = `logs-${memberInfo.memberName.replace(/\[(MW|CMD)\]\s*/, '').toLowerCase().replace(/ /g, '-')}`;
        const userLogChannel = guild.channels.cache.find(ch => ch.name === userLogChannelName);
        if (!userLogChannel) {
            console.log(`Canal de log do usuário ${memberInfo.memberName} (${userId}) não encontrado. Canal esperado: ${userLogChannelName}`);
            continue;
        }

        try {
            console.log(`Tentando enviar mensagem de log para o canal ${userLogChannelName} para o usuário ${memberInfo.memberName}.`);
            await userLogChannel.send({
                content: `📦 **Você ${action === 'COLOCOU' ? 'adicionou 🟩' : 'retirou 🟥'}** \`${quantity}\` **${item} no baú**.\n
${action === 'COLOCOU' ? '🔼' : '🔽'} **Você ${action === 'COLOCOU' ? 'ganhou' : 'perdeu'}** \`${Math.abs(points)}\` **pontos**.\n
🏆 **Sua quantidade total de pontos é**: \`${totalPoints}\`. \n ----------------------------------------------------`
            });
            console.log(`Mensagem enviada com sucesso para o canal ${userLogChannelName}.`);
        } catch (error) {
            console.error(`Erro ao enviar mensagem para o canal ${userLogChannelName}:`, error);
        }
    }

    await message.react('✅'); // Marca a mensagem como processada
};

const updateLog = async (client) => {
    const guild = client.guilds.cache.get(config.guilds.logs);
    if (!guild) {
        console.error('Guilda não encontrada.');
        return;
    }

    const channel = guild.channels.cache.get(config.logsChannels.apreensao);
    if (!channel) {
        console.error('Canal de logs não encontrado.');
        return;
    }

    const memberIds = await getMemberIds();

    const options = { limit: 20 };
    if (lastProcessedMessageId) options.after = lastProcessedMessageId;
    const messages = await channel.messages.fetch(options);

    console.log(`Foram encontradas ${messages.size} mensagens para processar.`);

    for (const message of messages.values()) {
        if (!message.reactions.cache.has('✅')) {
            await processSingleMessage(message, memberIds, guild);
        }
    }

    if (messages.size > 0) {
        lastProcessedMessageId = messages.last()?.id;
    }

    if (messages.size === 20) {
        console.log('Processando próximo lote de mensagens...');
        setTimeout(() => updateLog(client), 5000); // Pausa de 5 segundos entre lotes
    } else {
        console.log('Todas as mensagens foram processadas.');
    }
};

module.exports = {
    sendLogMessage,
    updateLog,
    cleanOldLogs, // Não removi esta função
    processSingleMessage,
    getMemberIds,
};
