const { SlashCommandBuilder, PermissionsBitField, MessageFlags, EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('idspatente')
        .setDescription('Lista os IDs dos membros agrupados por patente.'),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '❌ Você não tem permissão para usar este comando.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const members = await guild.members.fetch({ time: 120000 });

        const regex = /\|\s*(\d+)$/;
        const dados = {};

        for (const rankKey of config.rankOrder) {
            const rank = config.ranks[rankKey];
            if (!rank) continue;

            const role = guild.roles.cache.get(rank.roleId);
            if (!role) continue;

            const idsSet = new Set();
            members.forEach(member => {
                if (member.roles.cache.has(rank.roleId)) {
                    const match = member.displayName.match(regex);
                    if (match) {
                        idsSet.add(match[1]);
                    }
                }
            });

            const listaIds = Array.from(idsSet).sort((a, b) => parseInt(a) - parseInt(b));
            if (listaIds.length > 0) {
                dados[`${rank.tag} ${rank.name}`] = listaIds;
            }
        }

        if (Object.keys(dados).length === 0) {
            return interaction.editReply({
                content: '❌ Nenhum membro com ID encontrado nas patentes.',
            });
        }

        const cargos = Object.entries(dados);
        const paginaSize = 15;
        const paginas = [];
        for (let i = 0; i < cargos.length; i += paginaSize) {
            paginas.push(cargos.slice(i, i + paginaSize));
        }

        for (const pagina of paginas) {
            const embed = new EmbedBuilder()
                .setTitle('📋 IDs por Patente')
                .setColor(config.branding.color)
                .setFooter({ text: config.branding.footerText });

            for (const [cargo, listaIds] of pagina) {
                let valor = listaIds.map(id => `\`${id}\``).join(', ');
                if (valor.length > 1020) {
                    valor = valor.substring(0, 1017) + '...';
                }
                embed.addFields({
                    name: `${cargo} (${listaIds.length})`,
                    value: valor,
                    inline: false,
                });
            }

            await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },
};
