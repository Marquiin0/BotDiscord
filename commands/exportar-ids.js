const { SlashCommandBuilder, PermissionsBitField, MessageFlags, AttachmentBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('exportar-ids')
        .setDescription('Exporta os IDs dos membros no formato "ID_JOGO" "ID_DISCORD".'),
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
        const membrosMap = new Map();

        members.forEach(member => {
            const match = member.displayName.match(regex);
            if (match) {
                membrosMap.set(match[1], member.id);
            }
        });

        if (membrosMap.size === 0) {
            return interaction.editReply({
                content: '❌ Nenhum membro encontrado com ID no nome (formato: `Nome | 123`).',
            });
        }

        const linhas = Array.from(membrosMap.entries())
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([idJogo, idDiscord]) => `    "${idJogo}" "${idDiscord}".`);

        const txtStr = `{\n${linhas.join('\n')}\n}`;

        if (txtStr.length > 1900) {
            const buffer = Buffer.from(txtStr, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: 'ids_membros.json' });

            return interaction.editReply({
                content: `📎 **ids_membros.json** gerado!\n✅ Total de membros exportados: **${membrosMap.size}**`,
                files: [attachment],
            });
        }

        await interaction.editReply({
            content: `\`\`\`text\n${txtStr}\n\`\`\`\n✅ Total de membros exportados: **${membrosMap.size}**`,
        });
    },
};
