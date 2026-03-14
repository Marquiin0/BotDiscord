const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const {
  UserPontos,
  UserMultiplicadores,
  DonationRecords,
  UserActions,
} = require('../database.js');
const { MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('donater')
    .setDescription(
      'Processa doações para atualizar pontos, multiplicadores, expiração e cargos.'
    )
    .addUserOption((option) =>
      option
        .setName('usuario')
        .setDescription('Usuário a receber a doação.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('tipo')
        .setDescription('Tipo de doação: mensal ou wipe.')
        .setRequired(true)
        .addChoices(
          { name: 'Mensal', value: 'mensal' },
          { name: 'Wipe', value: 'wipe' }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('multiplicador')
        .setDescription(
          'Multiplicador a ser aplicado (será salvo na tabela de multiplicadores).'
        )
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('salario')
        .setDescription('Salário da doação.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('pontos')
        .setDescription('Pontos a incrementar no total do usuário.')
        .setRequired(true)
    ),

  async execute(interaction) {
    // Apenas administradores podem usar este comando
    const hasAdmin = interaction.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    );
    const canUseCommands = interaction.memberPermissions.has(
      PermissionsBitField.Flags.UseApplicationCommands
    );

    if (!hasAdmin && !canUseCommands) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Obtém as opções do comando
    const targetUser = interaction.options.getUser('usuario');
    const tipo = interaction.options.getString('tipo');
    const multiplicador = interaction.options.getInteger('multiplicador');
    const salario = interaction.options.getInteger('salario');
    const pontos = interaction.options.getInteger('pontos');

    /**
     * Define a expiração conforme o tipo:
     *  - Mensal: 30 dias
     *  - Wipe : sem data definida (null)
     */
    let expiracao = null;
    if (tipo === 'mensal') {
      expiracao = new Date();
      expiracao.setDate(expiracao.getDate() + 30);
    }

    // Atualiza ou cria o registro de multiplicador para o usuário
    const userMult = await UserMultiplicadores.findOne({
      where: { userId: targetUser.id },
    });

    if (userMult) {
      userMult.multiplicador = multiplicador;
      await userMult.save();
    } else {
      await UserMultiplicadores.create({
        userId: targetUser.id,
        multiplicador,
      });
    }

    // Atualiza ou cria o registro da doação
    const donationRecord = await DonationRecords.findOne({
      where: { userId: targetUser.id },
    });

    if (donationRecord) {
      donationRecord.tipo = tipo;
      donationRecord.salario = salario;
      donationRecord.pontos = pontos;
      donationRecord.expiracao = expiracao;
      donationRecord.timestamp = new Date();
      await donationRecord.save();
    } else {
      await DonationRecords.create({
        userId: targetUser.id,
        tipo,
        salario,
        pontos,
        expiracao,
        timestamp: new Date(),
      });
    }

    // Atualiza ou cria o registro dos pontos totais
    const userPoints = await UserPontos.findOne({
      where: { userId: targetUser.id },
    });

    if (userPoints) {
      userPoints.pontos += pontos;
      await userPoints.save();
    } else {
      await UserPontos.create({
        userId: targetUser.id,
        pontos,
      });
    }

    // Registra a ação da doação
    await UserActions.create({
      userId: targetUser.id,
      id_tipo: 'donater',
      nome_tipo: tipo === 'mensal' ? 'Doação Mensal' : 'Doação Wipe',
      pontos,
      multiplicador,
      pontosRecebidos: pontos,
    });

    // Define o cargo conforme o tipo de doação
    let roleId = null;
    let roleMention = 'N/A';

    if (tipo === 'wipe') {
      roleId = '1341839007964729494';
      roleMention = '<@&1341839007964729494>';
    } else if (tipo === 'mensal') {
      roleId = '1341838952549847100';
      roleMention = '<@&1341838952549847100>';
    }

    // Atribui o cargo ao usuário, se definido
    if (roleId) {
      const member = await interaction.guild.members.fetch(targetUser.id);
      if (member) {
        await member.roles.add(roleId).catch(console.error);
      }
    }

    // Formatação de expiração para exibição
    const expiracaoDisplay =
      tipo === 'mensal' && expiracao
        ? `\`${expiracao.toLocaleDateString('pt-BR')}\``
        : tipo === 'wipe'
        ? '(até o wipe)'
        : 'N/A';

    // Embed público (canal onde o comando foi usado)
    const publicEmbed = new EmbedBuilder()
      .setTitle('🎉 Doação Processada!')
      .setDescription(
        `Obrigado, <@${targetUser.id}>! Sua doação foi processada com sucesso.\n\n*Todos os pontos foram adicionados e o cargo referente à doação foi atribuído.*`
      )
      .addFields(
        { name: 'Tipo', value: roleMention, inline: true },
        { name: 'Multiplicador', value: `\`${multiplicador}\``, inline: true },
        { name: 'Salário', value: `\`${salario}\``, inline: true },
        { name: 'Pontos Incrementados', value: `\`${pontos}\``, inline: true },
        { name: 'Expiração', value: expiracaoDisplay, inline: true }
      )
      .setColor('#FFFFFF')
      .setTimestamp()
      .setFooter({
        text: 'Doação registrada',
        iconURL: interaction.client.user.displayAvatarURL(),
      });

    // Embed privado (DM)
    const dmEmbed = new EmbedBuilder()
      .setTitle('🎉 Doação Processada!')
      .setDescription(
        `Olá <@${targetUser.id}>, sua doação foi processada com sucesso!`
      )
      .addFields(
        { name: 'Tipo', value: tipo === 'mensal' ? 'Mensal' : 'Wipe', inline: true },
        { name: 'Multiplicador', value: `\`${multiplicador}\``, inline: true },
        { name: 'Salário', value: `\`${salario}\``, inline: true },
        { name: 'Pontos Incrementados', value: `\`${pontos}\``, inline: true },
        { name: 'Expiração', value: expiracaoDisplay, inline: true }
      )
      .setColor('#00FF00')
      .setTimestamp()
      .setFooter({
        text: 'Doação registrada',
        iconURL: interaction.client.user.displayAvatarURL(),
      });

    // Responde no canal e envia DM
    await interaction.reply({ embeds: [publicEmbed] });
    await targetUser.send({ embeds: [dmEmbed] }).catch(console.error);
  },
};
