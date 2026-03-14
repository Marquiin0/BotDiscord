const { MemberID } = require('../database');
const config = require('../config');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (!message.guild) return;
        if (message.author.bot && message.author.id === message.client.user.id) return;

        // Remove blocos de código se houver
        let conteudo = message.content.trim();
        if (conteudo.startsWith('```')) {
            conteudo = conteudo.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '');
        }

        if (!conteudo.includes('[===== SAIU DA POL')) return;

        // Regex para extrair ID, data e hora
        const regex = /\[===== SAIU DA POL[ÍI]CIA =====]\s*\n\[ID\]: (\d+)\s*\n\[USOU O COMANDO\]: \/sairlegal\s*\n\[Data\]: ([^\[]+)\s*\[Hora\]: (.+?)\s*$/s;
        const match = conteudo.match(regex);
        if (!match) return;

        const [, idJogo, data, hora] = match;

        try {
            // Verifica se o ID é de um membro da organização
            const membro = await MemberID.findOne({ where: { discordId: idJogo } });
            if (!membro) return;

            const mainGuild = message.client.guilds.cache.get(config.guilds.main);
            if (!mainGuild) return;

            const canalAlerta = mainGuild.channels.cache.get(config.channels.saidaAlerta);
            if (!canalAlerta) return;

            await canalAlerta.send(
                `O player abaixo saiu da ${config.branding.name}. Exonerar in-game e no Discord! ` +
                `<@&${config.permissions.corregedoria[0]}>\n` +
                `👤 Discord: <@${membro.memberId}>\n` +
                `\`\`\`prolog\n${conteudo}\n\`\`\``
            );

            console.log(`[SaiuPolicia] Alerta enviado - ID ${idJogo} | ${data.trim()} ${hora.trim()}`);

        } catch (err) {
            console.error('[SaiuPolicia] Erro ao processar mensagem:', err);
        }
    },
};
