const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');
const { UserPontos, UserActions } = require('../database.js');
const { MessageFlags } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('finalizarcurso')
    .setDescription('Finaliza um curso, registra os FTO e conscreve os participantes.')
    .addRoleOption(option =>
      option
        .setName('cargo')
        .setDescription('Escolha o cargo que representa o curso finalizado (será atribuído aos participantes).')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('auxiliares')
        .setDescription('Menção dos FTO Auxiliares (separados por vírgula ou espaço; opcional).')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('participantes')
        .setDescription('Menção dos participantes conscritos (separados por vírgula ou espaço; opcional).')
        .setRequired(false)
    ),
  async execute(interaction) {
    // Permite o comando para administradores ou para usuários que possuam permissão
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
      !interaction.member.roles.cache.hasAny(...config.permissions.hcPlus)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Defer a resposta para ganhar mais tempo e evitar o timeout da interação
    await interaction.deferReply({ ephemeral: true });

    const cargo = interaction.options.getRole('cargo');
    const auxiliaresRaw = interaction.options.getString('auxiliares');
    const participantesRaw = interaction.options.getString('participantes');

    // Divide as strings por vírgula ou espaço e remove itens vazios
    let auxiliaresList = [];
    if (auxiliaresRaw) {
      auxiliaresList = auxiliaresRaw
        .split(/[\s,]+/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }
    let participantesList = [];
    if (participantesRaw) {
      participantesList = participantesRaw
        .split(/[\s,]+/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }

    const guild = interaction.guild;
    const executorId = interaction.user.id;
    const responsibleMention = `<@${executorId}>`;
    const cargoMention = `<@&${cargo.id}>`;

    // Função auxiliar para extrair apenas o ID de uma menção
    function extractId(mention) {
      return mention.replace(/[<@!>]/g, '');
    }

    // Adiciona o cargo para os participantes de forma concorrente
    const rolePromises = participantesList.map(async part => {
      const partId = extractId(part);
      try {
        const member = await guild.members.fetch(partId);
        if (member) {
          await member.roles.add(cargo.id);
        }
      } catch (error) {
        console.error(`Erro ao adicionar o cargo para o participante ${partId}:`, error);
      }
    });
    await Promise.all(rolePromises);

    // Função auxiliar para atualizar os pontos e registrar a ação no UserActions
    async function addPointsAndLog(userId, pts, id_tipo, nome_tipo) {
      let record = await UserPontos.findOne({ where: { userId } });
      if (record) {
        record.pontos += pts;
        await record.save();
      } else {
        await UserPontos.create({ userId, pontos: pts });
      }
      await UserActions.create({
        userId,
        id_tipo,
        nome_tipo,
        pontos: pts,
        multiplicador: 1,
        pontosRecebidos: pts,
      });
    }

    // Atualiza os pontos:
    // - FTO Responsável: 50 pontos
    // - Cada FTO Auxiliar: 40 pontos
    // - Cada Participante: 30 pontos
    await addPointsAndLog(
      executorId,
      50,
      'finalizarcurso_responsavel',
      'Finalização de Curso - FTO Responsável'
    );
    for (const aux of auxiliaresList) {
      const auxId = extractId(aux);
      await addPointsAndLog(
        auxId,
        40,
        'finalizarcurso_auxiliar',
        'Finalização de Curso - FTO Auxiliar'
      );
    }
    for (const part of participantesList) {
      const partId = extractId(part);
      await addPointsAndLog(
        partId,
        30,
        'finalizarcurso_participante',
        'Finalização de Curso - Participante'
      );
    }

    // Prepara as strings para exibição
    const auxiliaresDisplay = auxiliaresList.length > 0 ? auxiliaresList.join(', ') : 'Nenhum';
    const participantesDisplay = participantesList.length > 0 ? participantesList.join(', ') : 'Nenhum participante conscrito';

    // Cria o embed que será enviado na sala de finalização de curso
    const courseEmbed = new EmbedBuilder()
      .setTitle(`🎓 Curso Finalizado ${cargo.name}`)
      .setDescription(
        'O curso foi finalizado com sucesso. Parabéns aos conscritos!\n\n' +
        '*Todos os participantes receberam a tag referente ao curso finalizado.'
      )
      .addFields(
        { name: 'Curso', value: cargoMention, inline: true },
        { name: 'FTO Responsável', value: responsibleMention, inline: true },
        { name: 'FTO Auxiliares', value: auxiliaresDisplay, inline: false },
        { name: 'Participantes', value: participantesDisplay, inline: false }
      )
      .setColor(config.branding.color)
      .setTimestamp()
      .setFooter({
        text: 'Registro de Finalização de Curso',
        iconURL: interaction.client.user.displayAvatarURL(),
      });

    // Cria o embed de log para o canal de logs
    const logEmbed = new EmbedBuilder()
      .setTitle('📋 Log de Finalização de Curso')
      .setDescription(`Curso finalizado por ${responsibleMention}`)
      .addFields(
        { name: 'Curso', value: cargoMention, inline: true },
        { name: 'FTO Auxiliares', value: auxiliaresDisplay, inline: true },
        { name: 'Participantes', value: participantesDisplay, inline: false }
      )
      .setColor(config.branding.color)
      .setTimestamp()
      .setFooter({
        text: 'Log de Finalização de Curso',
        iconURL: interaction.client.user.displayAvatarURL(),
      });

    // Atualiza a resposta da interação após o processamento
    await interaction.editReply({
      content: 'Curso finalizado com sucesso!'
    });

    // Envia o embed no canal de aprovados de curso
    const approvedChannel = guild.channels.cache.get(config.channels.cursoAprovados);
    if (approvedChannel) {
      await approvedChannel.send({ embeds: [courseEmbed] });
    }
  },
};
