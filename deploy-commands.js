const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data instanceof SlashCommandBuilder) {
        commands.push(command.data.toJSON());
    }
}

const rest = new REST({ version: '9' }).setToken(process.env.TOKEN);

const FTO_GUILD_ID = '1477473906863505582';

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );
        console.log(`Commands deployed to main guild (${process.env.GUILD_ID}).`);

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, FTO_GUILD_ID),
            { body: commands },
        );
        console.log(`Commands deployed to FTO guild (${FTO_GUILD_ID}).`);

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
