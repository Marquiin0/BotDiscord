const { PermissionsBitField } = require('discord.js');
const { sendEphemeralReply } = require('../utils/sendEphemeralReply');
const { MessageFlags } = require('discord.js');
const config = require('../config');

module.exports = {
    data: {
        name: 'anunciobot',
    },
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await sendEphemeralReply(message, 'Você não tem permissão para usar este comando.');
            return;
        }

        if (!message.content.toLowerCase().startsWith('/anunciobot ')) return;

        // Deleta a mensagem original do usuário
        message.delete().catch(error => {
            console.error(`Não consegui deletar a mensagem devido a: ${error}`);
        });

        // Pega o conteúdo do anúncio
        const announcementText = message.content.slice(12).trim(); // Remove "/anunciobot " e trim para evitar espaços desnecessários

        if (!announcementText) {
            await sendEphemeralReply(message, 'Por favor, forneça uma mensagem para o anúncio.');
            return;
        }

        if (announcementText.length > 2000) {
            await sendEphemeralReply(message, 'Você excedeu o limite de 2000 caracteres.');
            return;
        }

        // Envia o anúncio como o próprio bot
        message.channel.send({ content: announcementText });
    },
};
