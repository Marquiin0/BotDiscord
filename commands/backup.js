const { GuildEmoji, PermissionFlagsBits } = require('discord.js');

// Patch para corrigir a depreciação: quando acessar Emoji#url, utilizar Emoji#imageURL() em seu lugar.
Object.defineProperty(GuildEmoji.prototype, 'url', {
    get() {
        return this.imageURL();
    }
});

const { SlashCommandBuilder } = require('@discordjs/builders');
const backup = require('discord-backup');

// Define a pasta onde os backups serão salvos (ajuste conforme sua estrutura)
backup.setStorageFolder(__dirname + '/../backups/');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Gerencie os backups do servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Cria um backup completo do servidor'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('load')
                .setDescription('Restaura um backup existente')
                .addStringOption(option =>
                    option.setName('backupid')
                        .setDescription('Informe o ID do backup')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Exibe detalhes de um backup')
                .addStringOption(option =>
                    option.setName('backupid')
                        .setDescription('Informe o ID do backup')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove um backup existente')
                .addStringOption(option =>
                    option.setName('backupid')
                        .setDescription('Informe o ID do backup a ser removido')
                        .setRequired(true))),
    async execute(interaction) {
        // Verifica se o membro possui permissão de Administrador
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Você não tem permissão.',
                ephemeral: true,
            });
        }
        
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            try {
                // Defer a resposta de forma efêmera para evitar timeout
                await interaction.deferReply({ ephemeral: true });
                let progress = 0;
                await interaction.editReply(`🔄 Criando backup... ${progress}%`);

                // Atualiza a mensagem de progresso a cada 1 segundo (simulação)
                const progressInterval = setInterval(async () => {
                    progress += 10;
                    if (progress > 99) progress = 99;
                    try {
                        await interaction.editReply(`🔄 Criando backup... ${progress}%`);
                    } catch (error) {
                        console.error('Erro ao atualizar o progresso:', error);
                    }
                }, 1000);

                // Cria o backup do servidor
                const backupData = await backup.create(interaction.guild, {
                    maxMessages: 10,   // ajuste conforme necessário
                    jsonBeautify: true // facilita a leitura do JSON gerado
                });

                // Quando o backup for concluído, para a simulação e atualiza a mensagem final
                clearInterval(progressInterval);
                await interaction.editReply(`✅ Backup criado com sucesso!\n**ID do Backup:** \`${backupData.id}\``);
            } catch (error) {
                console.error("Erro ao criar backup:", error);
                await interaction.editReply('❌ Ocorreu um erro ao criar o backup.');
            }
        } else if (subcommand === 'load') {
            const backupID = interaction.options.getString('backupid');
            try {
                await interaction.deferReply({ ephemeral: true });
                await backup.fetch(backupID);
                await interaction.editReply('🔄 Iniciando a restauração do backup...\n**Atenção:** O servidor será resetado!');
                await backup.load(backupID, interaction.guild, { clearGuildBeforeRestore: true });
            } catch (error) {
                console.error("Erro ao restaurar backup:", error);
                await interaction.editReply('❌ Backup não encontrado ou ocorreu um erro durante a restauração.');
            }
        } else if (subcommand === 'info') {
            const backupID = interaction.options.getString('backupid');
            try {
                const backupInfos = await backup.fetch(backupID);
                const embed = {
                    color: 0x0099ff,
                    title: 'Detalhes do Backup',
                    fields: [
                        { name: 'ID do Backup', value: backupInfos.id, inline: true },
                        { name: 'Servidor', value: backupInfos.data.name, inline: true },
                        { name: 'Criado em', value: new Date(backupInfos.data.createdTimestamp).toLocaleString(), inline: true },
                        { name: 'Tamanho', value: backupInfos.size.toString(), inline: true }
                    ],
                    footer: { text: 'Informações geradas pelo sistema de backup' }
                };
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } catch (error) {
                console.error("Erro ao obter informações do backup:", error);
                await interaction.reply({ content: '❌ Backup não encontrado.', ephemeral: true });
            }
        } else if (subcommand === 'remove') {
            const backupID = interaction.options.getString('backupid');
            try {
                await backup.remove(backupID);
                await interaction.reply({ content: `✅ Backup \`${backupID}\` removido com sucesso!`, ephemeral: true });
            } catch (error) {
                console.error("Erro ao remover backup:", error);
                await interaction.reply({ content: '❌ Backup não encontrado ou ocorreu um erro ao removê-lo.', ephemeral: true });
            }
        }
    }
};
