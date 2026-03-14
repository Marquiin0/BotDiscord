module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (!message.content.startsWith('/') || message.author.bot) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName);

        if (!command) return;

        try {
            await command.execute(message, args, client);
        } catch (error) {
            console.error(`Erro ao executar o comando ${commandName}:`, error);
        }
    },
};






