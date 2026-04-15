const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();
const config = require('./config');

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data instanceof SlashCommandBuilder) {
        commands.push(command.data.toJSON());
    }
}

const rest = new REST({ version: '9' }).setToken(process.env.TOKEN);

// Guilds onde registrar os comandos: principal + batalhões
const guildIds = [
    process.env.GUILD_ID,
    ...config.battalions.map(b => b.guildId),
];

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        for (const guildId of guildIds) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: commands },
            );
            console.log(`Commands registered in guild: ${guildId}`);
        }

        console.log('Successfully reloaded application (/) commands in all guilds.');
    } catch (error) {
        console.error(error);
    }
})();
