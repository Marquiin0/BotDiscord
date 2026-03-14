const { Loja } = require('../database.js'); // Importando o modelo Loja
const { EmbedBuilder } = require('discord.js');
const { Sequelize } = require('sequelize');

async function checkExpiredLoja(client) {
    // Buscar todas as compras com dataExpiracao menor ou igual à data atual
    const expiredPurchases = await Loja.findAll({
        where: {
            dataExpiracao: {
                [Sequelize.Op.lte]: new Date(), // Expiradas até a data/hora atual
            },
        },
    });

    // Iterar por cada compra expirada
    for (const purchase of expiredPurchases) {
        // Obter a guild (substitua pelo ID do seu servidor)
        const guild = client.guilds.cache.get('1333590154660679740');
        if (!guild) continue;

        let member;
        try {
            member = await guild.members.fetch(purchase.userId);
        } catch (error) {
            console.error(`Erro ao buscar o membro ${purchase.userId}: ${error.message}`);
            // Se o usuário não for encontrado, remove apenas o registro da compra expirada do banco
            await Loja.destroy({
                where: {
                    id: purchase.id,
                },
            });
            continue;
        }

        // Tentar remover o cargo do usuário, se existir no registro
        if (purchase.cargo) {
            try {
                const role = guild.roles.cache.get(purchase.cargo);
                if (role && member.roles.cache.has(role.id)) {
                    await member.roles.remove(role.id);
                }
            } catch (error) {
                console.error(`Erro ao remover o cargo ${purchase.cargo} do membro ${purchase.userId}: ${error.message}`);
            }
        }

        // Criar o embed da mensagem para o usuário via DM
        const dmEmbed = new EmbedBuilder()
            .setTitle('❌ Compra Expirada')
            .setDescription('O prazo para utilizar sua compra\nexpirou.\n\nCaso tenha dúvidas, abra um ticket.\n\n')
            .addFields({ name: '📌 Item Expirado', value: `\`\`\`${purchase.item}\`\`\`` })
            .setImage('https://media1.tenor.com/m/ufPsZFFomo4AAAAd/crying-cat-sad-cat.gif')
            .setColor('#FFD700')
            .setTimestamp();

        // Enviar a mensagem privada para o usuário
        try {
            await member.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.log(`⚠️ Não foi possível enviar a mensagem para ${member.user.tag}.`);
        }

        // Remover apenas o registro da compra expirada utilizando o id único do registro
        await Loja.destroy({
            where: {
                id: purchase.id,
            },
        });
    }
}

module.exports = checkExpiredLoja;
