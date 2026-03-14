const { SlashCommandBuilder } = require('discord.js');
const { Sequelize } = require('sequelize');
const fs = require('fs');

// Configuração do banco SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite', // Certifique-se de que o caminho está correto
    logging: false,
});

// Seu ID do Discord para validar permissão (Owner)
const OWNER_ID = '233987539264995328';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sql')
        .setDescription('Executa uma query SQL no SQLite (Somente para o dono e administrador do bot)')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('A consulta SQL a ser executada')
                .setRequired(true)
        ),
    async execute(interaction) {
        // Verifica se o comando foi usado em um servidor (guild)
        if (!interaction.guild) {
            return interaction.reply({ content: 'Esse comando só pode ser usado em um servidor!', ephemeral: true });
        }
        
        // Verifica se o usuário é o dono e tem permissão de administrador
        if (interaction.user.id !== OWNER_ID || !interaction.member.permissions.has('ADMINISTRATOR')) {
            return interaction.reply({ 
                content: '🚫 Apenas o dono do bot que também seja administrador pode usar este comando!', 
                ephemeral: true 
            });
        }

        // Pega a query enviada pelo usuário
        const query = interaction.options.getString('query');

        try {
            // Executa a consulta no banco de dados SQLite
            const [results] = await sequelize.query(query);

            // Registra a query executada (opcional)
            fs.appendFileSync('sql-logs.txt', `${new Date().toISOString()} - Query executada por ${interaction.user.tag} (${interaction.user.id}): ${query}\n`);

            // Formata os resultados para exibição
            let response = JSON.stringify(results, null, 2);
            if (!response || response === '[]') response = '✅ Query executada com sucesso, mas nenhum dado foi retornado!';
            if (response.length > 1900) response = response.slice(0, 1900) + '...';

            await interaction.reply(`📊 **Resultado da Query:**\n\`\`\`json\n${response}\n\`\`\``);
        } catch (error) {
            console.error(error);
            // Registra o erro (opcional)
            fs.appendFileSync('sql-errors.txt', `${new Date().toISOString()} - Erro executando query por ${interaction.user.tag} (${interaction.user.id}): ${query}\nErro: ${error.message}\n\n`);
            await interaction.reply({ content: `❌ Erro ao executar query:\n\`\`\`${error.message}\`\`\``, ephemeral: true });
        }
    }
};
