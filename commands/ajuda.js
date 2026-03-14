const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { isValidImageURL } = require('../utils/isValidImageURL');
const { sendEphemeralReply } = require('../utils/sendEphemeralReply');

module.exports = {
    data: {
        name: 'tagbi',
        permissions: PermissionsBitField.Flags.Administrator,
    },
    async execute(message, args, client) {
        if (message.content.toLowerCase().startsWith('/tagbi')) {
            if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                message.author.send('Beijo beijo na bocaaaa te amoooooooooooooooooooo <3 lindaaaaa <3 :3');    
            }
        }
    },
};




