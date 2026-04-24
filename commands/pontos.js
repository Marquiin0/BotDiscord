const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { UserPontos } = require('../database.js');
const config = require('../config.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pontos')
    .setDescription('Atualiza os pontos de um usuário.')
    .addUserOption(option =>
      option.setName('usuario')
            .setDescription('Selecione o usuário alvo.')
            .setRequired(true))
    .addIntegerOption(option =>
      option.setName('quantidade')
            .setDescription('Quantidade de pontos a adicionar.')
            .setRequired(true)),
  async execute(interaction) {
    // IDs autorizados para uso
    const allowedUserIds = ['334697727659081728', '670897303787405325', '870741609828991007', '1075964560542015548'];
    
    // Verifica se o usuário que executou o comando é administrador e está na lista autorizada
    if (!allowedUserIds.includes(interaction.user.id)) {
      return interaction.reply({ content: 'Você não tem permissão para executar este comando.', flags: MessageFlags.Ephemeral });
    }

    // Obtém os parâmetros do comando
    const targetUser = interaction.options.getUser('usuario');
    const quantidade = interaction.options.getInteger('quantidade');

    try {
      // Buscar o registro do usuário na tabela UserPontos
      let userRecord = await UserPontos.findOne({ where: { userId: targetUser.id } });
      let oldPoints = 0;
      if (userRecord) {
        oldPoints = userRecord.pontos;
        userRecord.pontos += quantidade;
        await userRecord.save();
      } else {
        userRecord = await UserPontos.create({ userId: targetUser.id, pontos: quantidade });
      }
      const newPoints = userRecord.pontos;

      // Cria o embed para resposta
      const embed = new EmbedBuilder()
        .setTitle('✅ Pontos Atualizados')
        .setDescription(`Os pontos do usuário <@${targetUser.id}> foram atualizados com sucesso.`)
        .addFields(
          { name: 'Antes', value: `\`${oldPoints}\` pontos`, inline: true },
          { name: 'Adicionado', value: `\`${quantidade}\` pontos`, inline: true },
          { name: 'Depois', value: `\`${newPoints}\` pontos`, inline: true }
        )
        .setColor('#00FF00')
        .setTimestamp();

      // Enviar log para o servidor de logs
      try {
        const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs);
        if (logsGuild) {
          const logChannel = logsGuild.channels.cache.get(config.logsChannels.pontos);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle('💰 Log de Adição de Pontos')
              .addFields(
                { name: 'Oficial', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Pontos Adicionados', value: `\`${quantidade}\``, inline: true },
                { name: 'Pontos Totais', value: `\`${newPoints}\``, inline: true },
                { name: 'Adicionado por', value: `<@${interaction.user.id}>`, inline: true },
              )
              .setColor(config.branding.color)
              .setFooter({ text: config.branding.footerText })
              .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] });
          }
        }
      } catch (logErr) {
        console.error('[Pontos] Erro ao enviar log de pontos:', logErr.message);
      }

      // Responde de forma efêmera
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('Erro ao atualizar pontos:', error);
      return interaction.reply({ content: 'Ocorreu um erro ao atualizar os pontos.', flags: MessageFlags.Ephemeral });
    }
  },
};
