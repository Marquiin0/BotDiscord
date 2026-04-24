const { MemberID, PatrolSession } = require('../database.js');
const config = require('../config');

async function updateMemberIDs(guild, channelId = null) {

    const roleId = config.roles.membro;
    const membersWithRole = await guild.members.fetch({ time: 120000 }); // Aumentar para 120 segundos

    // Cria um mapa de membros atuais com o cargo
    const currentMembersWithRole = new Map();
    membersWithRole.forEach(member => {
        if (member.roles.cache.has(roleId)) {
            currentMembersWithRole.set(member.user.id, member.displayName);
        }
    });

    // Recuperar todos os registros do banco de dados
    const allMembersInDB = await MemberID.findAll();

    // Verifica cada membro no banco de dados
    for (const dbMember of allMembersInDB) {
        const discordUserId = dbMember.memberId;
        const displayName = currentMembersWithRole.get(discordUserId);

        if (displayName) {
            // Atualiza o membro se ele ainda tiver o cargo
            const idMatch = displayName.match(/\|\s*(\d+)$/);
            const displayId = idMatch ? idMatch[1] : null;
            const name = displayName.split(' | ')[0];

            // Certifique-se de que displayId não é nulo antes de atualizar
            if (displayId) {
                await MemberID.update({
                    memberName: name,
                    discordId: displayId
                }, {
                    where: { memberId: discordUserId }
                });

                // Recarregar a instância do banco de dados após a atualização
                await dbMember.reload();
            }

            // Remove o membro do mapa, indicando que foi processado
            currentMembersWithRole.delete(discordUserId);
        } else {
            // Remove ou atualiza o registro do membro que não tem mais o cargo
            await MemberID.destroy({ where: { memberId: discordUserId } });
        }
    }

    // Adiciona novos membros que têm o cargo e ainda não estão no banco de dados
    for (const [discordUserId, displayName] of currentMembersWithRole) {
        const idMatch = displayName.match(/\|\s*(\d+)$/);
        const displayId = idMatch ? idMatch[1] : null;
        const name = displayName.split(' | ')[0];

        // Certifique-se de que displayId não é nulo antes de criar
        if (displayId) {
            const newMember = await MemberID.create({
                memberName: name,
                discordId: displayId,
                memberId: discordUserId
            });

            // Recarregar a instância após a inserção
            await newMember.reload();
        }
    }

    // Backfill PatrolSessions com discordId null
    try {
        const orphanSessions = await PatrolSession.findAll({ where: { discordId: null } });
        for (const session of orphanSessions) {
            const match = await MemberID.findOne({ where: { discordId: session.inGameId } });
            if (match) {
                await session.update({ discordId: match.memberId });
                console.log(`[UpdateMemberIDs] Backfill: sessão ${session.id} vinculada ao Discord ID ${match.memberId}`);
            }
        }
    } catch (err) {
        console.error('[UpdateMemberIDs] Erro no backfill de PatrolSessions:', err);
    }

    console.log('IDs atualizados com sucesso.');
}

module.exports = updateMemberIDs;
