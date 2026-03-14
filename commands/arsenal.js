const { SlashCommandBuilder, PermissionsBitField, MessageFlags, EmbedBuilder } = require('discord.js');
const { ArsenalIsento } = require('../database');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('arsenal')
        .setDescription('Gerencia isenções do sistema de verificação do arsenal.')
        .addSubcommand(sub =>
            sub.setName('liberar')
                .setDescription('Adiciona um membro à lista de isenção do arsenal.')
                .addUserOption(opt =>
                    opt.setName('membro')
                        .setDescription('Membro a ser isentado')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remover')
                .setDescription('Remove um membro da lista de isenção do arsenal.')
                .addUserOption(opt =>
                    opt.setName('membro')
                        .setDescription('Membro a ter a isenção removida')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('isentos')
                .setDescription('Lista todos os membros isentos da verificação do arsenal.')
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '❌ Você precisa ser administrador para usar este comando.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'liberar') {
            const membro = interaction.options.getUser('membro');

            await ArsenalIsento.upsert({
                userId: membro.id,
                addedBy: interaction.user.id,
            });

            return interaction.reply({
                content: `✅ ${membro} foi isentado das infrações de arsenal.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        if (subcommand === 'remover') {
            const membro = interaction.options.getUser('membro');

            const deleted = await ArsenalIsento.destroy({
                where: { userId: membro.id },
            });

            if (deleted === 0) {
                return interaction.reply({
                    content: `⚠️ ${membro} não estava na lista de isentos.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            return interaction.reply({
                content: `❌ ${membro} não está mais isento das infrações de arsenal.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        if (subcommand === 'isentos') {
            const isentos = await ArsenalIsento.findAll();

            if (isentos.length === 0) {
                return interaction.reply({
                    content: '🔍 Nenhum membro está isento atualmente.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const mencoes = isentos.map(i => `• <@${i.userId}>`);

            const embed = new EmbedBuilder()
                .setTitle('🛡️ Lista de Isentos do Arsenal')
                .setDescription(mencoes.join('\n'))
                .setColor(config.branding.color)
                .setFooter({ text: config.branding.footerText });

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },
};
