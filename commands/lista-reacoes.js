const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lista-reacoes')
    .setDescription('Lista todos os usuários que reagiram em uma mensagem.')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('Canal onde está a mensagem')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('idmensagem')
        .setDescription('ID da mensagem que você quer verificar')
        .setRequired(true)),

  async execute(interaction) {
    // PERMISSÕES
    const temPermissao = interaction.member.permissions.has(PermissionFlagsBits.UseApplicationCommands)
      || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!temPermissao) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        ephemeral: true,
      });
    }

    const canal = interaction.options.getChannel('canal');
    const idMensagem = interaction.options.getString('idmensagem');

    if (!canal || !canal.isTextBased()) {
      return interaction.reply({ content: 'Canal inválido ou não é um canal de texto.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const mensagem = await canal.messages.fetch(idMensagem);

      if (!mensagem.reactions.cache.size) {
        return interaction.editReply('Essa mensagem não possui reações.');
      }

      const todosUsuarios = new Set();

      for (const reaction of mensagem.reactions.cache.values()) {
        const usuarios = await reaction.users.fetch();

        for (const [id, user] of usuarios) {
          if (!user.bot) {
            todosUsuarios.add(`<@${id}>`);
          }
        }
      }

      if (!todosUsuarios.size) {
        return interaction.editReply('Nenhum usuário reagiu ou apenas bots reagiram.');
      }

      const listaFinal = [...todosUsuarios].join('\n');
      const blocos = listaFinal.match(/[\s\S]{1,1900}/g);

      await interaction.editReply(`👥 Usuários que reagiram:\n${blocos[0]}`);
      for (let i = 1; i < blocos.length; i++) {
        await interaction.followUp({ content: blocos[i], ephemeral: true });
      }

    } catch (err) {
      console.error('Erro no comando /lista-reacoes:', err);
      return interaction.editReply('❌ Erro ao buscar a mensagem. Verifique se o ID está correto e se o bot tem permissão de leitura no canal.');
    }
  }
};
