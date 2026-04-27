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
    config.guilds.logs,
];

(async () => {
    console.log('Started refreshing application (/) commands.');

    for (const guildId of guildIds) {
        if (!guildId) continue;
        try {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: commands },
            );
            console.log(`✅ Commands registered in guild: ${guildId}`);
        } catch (error) {
            // Bot pode não estar mais em guilds de batalhão — não aborta o resto
            console.warn(`⚠️  Skipping guild ${guildId}: ${error.code === 50001 ? 'Missing Access' : error.message}`);
        }
    }

    console.log('Done.');
})();
