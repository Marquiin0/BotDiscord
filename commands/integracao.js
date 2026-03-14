const { SlashCommandBuilder, PermissionsBitField, MessageFlags, EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('integracao')
        .setDescription('Envia mensagem de integração para novos membros via DM.')
        .addStringOption(option =>
            option.setName('usuarios')
                .setDescription('Mencione os usuários separados por espaço')
                .setRequired(true)
        ),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return interaction.reply({
                content: '❌ Você não tem permissão para usar este comando.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const usuariosStr = interaction.options.getString('usuarios');
        const mentions = usuariosStr.match(/<@!?(\d+)>/g) || [];

        if (mentions.length === 0) {
            return interaction.editReply({
                content: '❌ Nenhum usuário mencionado. Use @ para mencionar os usuários.',
            });
        }

        const guildId = config.guilds.main;
        let enviados = 0;
        const falhas = [];

        for (const mention of mentions) {
            const userId = mention.replace(/<@!?/, '').replace('>', '');
            try {
                const user = await interaction.client.users.fetch(userId);
                const embed = new EmbedBuilder()
                    .setTitle('FUI RECRUTADO, O QUE DEVO FAZER?')
                    .setDescription(
                        `# Parabéns Estagiário, você foi aprovado na ${config.branding.name}! Vou te passar um passo a passo de tudo que você deve fazer agora!\n\n` +
                        '**1. Coloque o fardamento de estagiário:**\n\n' +
                        '**ESTAGIARIO MASCULINO**\n' +
                        '```chapeu  ; mascara -1 0; jaqueta 299 17; blusa 15 0; maos 0 0; calca 140 0; sapatos 42; acessorios -1 0; oculos  ; mochila -1 254; colete -1 0```\n\n' +
                        '**ESTAGIARIA FEMININO**\n' +
                        '```chapeu  ; mascara -1 0; jaqueta 428 17; blusa 6 0; maos 228 0; calca 139 0; sapatos 1 0; acessorios -1 0; oculos  ; mochila -1 0; colete -1 0```\n\n' +
                        `**2.** Faça sua identificação em: https://discord.com/channels/${guildId}/${config.channels.identificacaoLog}\n` +
                        `**3.** Faça seu curso básico MAA em: https://discord.com/channels/${guildId}/${config.cursoMAA.channelId}\n` +
                        `**4.** Leia todas informações Básicas: https://discord.com/channels/${guildId}/${config.channels.hierarquia}\n` +
                        '**5.** Inicie patrulhamento! E fique atento ao /bd caso seja solicitado formações!\n\n' +
                        '__**# Dicas úteis**__\n\n' +
                        '- **Pegar armas**\n```/painellegal```\n\n' +
                        '- **Falar no chat interno**\n```/bd mensagem```\n\n' +
                        '- **Falar no chat das duas polícias**\n```/pd2 mensagem```\n\n' +
                        '- **Rádio para patrulha**\n```/radio 2```\n\n' +
                        '- **Fechar/abrir perímetro**\n```/pmt ou /pmt2```'
                    )
                    .setColor('#FFFFFF')
                    .setFooter({ text: config.branding.footerText });

                await user.send({ content: `${user}`, embeds: [embed] });
                enviados++;
            } catch {
                falhas.push(mention);
            }
        }

        let resposta = `✅ Mensagem de integração enviada para **${enviados}** usuário(s).`;
        if (falhas.length > 0) {
            resposta += `\n❌ Falha ao enviar para: ${falhas.join(', ')} (DM fechada ou usuário inválido).`;
        }

        await interaction.editReply({ content: resposta });
    },
};
