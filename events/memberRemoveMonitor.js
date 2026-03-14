const config = require('../config');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        // Só processa na guild principal
        if (member.guild.id !== config.guilds.main) return;

        // Verifica se o membro tinha alguma patente
        const allRankRoleIds = config.rankOrder
            .map(key => config.ranks[key]?.roleId)
            .filter(Boolean);

        const tinhaPatente = member.roles.cache.some(role => allRankRoleIds.includes(role.id));
        if (!tinhaPatente) return;

        try {
            const canal = member.guild.channels.cache.get(config.channels.saidaAlerta);
            if (!canal) return;

            // Identifica a patente que o membro tinha
            let patenteInfo = 'Desconhecida';
            for (const rankKey of config.rankOrder) {
                const rank = config.ranks[rankKey];
                if (rank && member.roles.cache.has(rank.roleId)) {
                    patenteInfo = `${rank.tag} ${rank.name}`;
                    break;
                }
            }

            await canal.send(
                `⚠️ O membro <@${member.id}> (**${member.displayName}**) saiu do servidor do Discord.\n` +
                `📋 Patente: **${patenteInfo}**\n` +
                `Faça a exoneração dele utilizando o \`/corregedoria\` <@&${config.permissions.corregedoria[0]}>`
            );

            console.log(`[MemberRemove] Alerta enviado - ${member.displayName} saiu do servidor`);

        } catch (err) {
            console.error('[MemberRemove] Erro ao processar saída:', err);
        }
    },
};
