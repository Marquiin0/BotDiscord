const { EmbedBuilder } = require('discord.js');
const { MemberID, ArsenalProcessedLog, ArsenalIsento } = require('../database');
const config = require('../config');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (!message.guild) return;
        if (message.author.bot && message.author.id === message.client.user.id) return;

        // Regex para detectar compras: [ID]: 123 [COMPROU UM(A)]: weapon_name
        const regex = /\[ID\]:\s*(\d+)\s*\[COMPROU UM\(A\)\]:\s*([A-Za-z0-9_]+)/i;
        const match = message.content.match(regex);
        if (!match) return;

        const [, idJogo, itemRaw] = match;
        const item = itemRaw.toLowerCase();

        try {
            // Verifica se já foi processado
            const jaProcessado = await ArsenalProcessedLog.findByPk(message.id);
            if (jaProcessado) return;

            // Marca como processado
            await ArsenalProcessedLog.create({ messageId: message.id });

            // Busca o membro no banco pelo ID do jogo
            const membro = await MemberID.findOne({ where: { discordId: idJogo } });
            if (!membro) return;

            // Verifica se está isento
            const isento = await ArsenalIsento.findByPk(membro.memberId);
            if (isento) return;

            // Descobre a patente do membro na guild principal
            const mainGuild = message.client.guilds.cache.get(config.guilds.main);
            if (!mainGuild) return;

            let guildMember;
            try {
                guildMember = await mainGuild.members.fetch(membro.memberId);
            } catch {
                return;
            }

            // Identifica a patente do membro (da menor para maior)
            let patenteKey = null;
            for (const rankKey of [...config.rankOrder].reverse()) {
                const rank = config.ranks[rankKey];
                if (rank && guildMember.roles.cache.has(rank.roleId)) {
                    patenteKey = rankKey;
                    break;
                }
            }

            if (!patenteKey) return;

            // Verifica se o item é proibido para essa patente
            const proibidos = config.arsenalProibido[patenteKey];
            if (!proibidos || !proibidos.includes(item)) return;

            const patente = config.ranks[patenteKey];

            // Envia alerta no canal de arsenal do servidor principal
            const canalAlerta = mainGuild.channels.cache.get(config.channels.arsenalAlerta);
            if (!canalAlerta) return;

            const embed = new EmbedBuilder()
                .setTitle('🚨 Infração Detectada no Arsenal')
                .setDescription(
                    `👮 **ID** \`${idJogo}\` | **${patente.tag} ${patente.name}**\n` +
                    `📦 Comprou: \`${item}\`\n` +
                    `👤 Discord: <@${membro.memberId}>`
                )
                .setColor('#DC143C')
                .setFooter({ text: `${config.branding.footerText} • Verificação automática` })
                .setTimestamp();

            await canalAlerta.send({
                content: `<@&${config.permissions.corregedoria[0]}>`,
                embeds: [embed],
            });

        } catch (err) {
            console.error('[ArsenalMonitor] Erro ao processar mensagem:', err);
        }
    },
};
