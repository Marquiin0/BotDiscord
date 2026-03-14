const {
  Events,
  EmbedBuilder,
} = require('discord.js');
const config = require('../config');
const {
  ApreensaoReports,
  UserPontos,
  UserActions,
  UserMultiplicadores,
  Loja,
} = require('../database.js');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { MemberID } = require('../database.js');
// Armazena timestamp da última ação por discordId (ID do jogo)
const cooldownMap = new Map();

// Regex para extrair dados do relatório
const regex = /\[ID\]:\s*(\d+)\s*-\s*([^\n]+)\s*\[ID APRENDIDO\]:\s*(\d+)\s*-\s*([^\n]+)\s*\[ITEMS\]:\s*(.+?)\s*\[VALOR\]:\s*([\s\S]+?)\s*\[Data\]:\s*([\d/]+)\s*\[Hora\]:\s*([\d:]+)/i;

// Tipos de ações (pontos)
const actionTypes = require('../utils/actionTypes.json');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
  // IDs das guilds e canais
    const guildLogsId = config.guilds.logs;
    const canalLogsId = config.logsChannels.apreensao;

    const guildDestinoId = config.guilds.main;
    const canalDestinoId = config.channels.apreensaoLog;

    // Verifica se a mensagem é do canal de logs monitorado
    if (
      message.guild?.id !== guildLogsId ||
      message.channel.id !== canalLogsId
    ) return;
console.log(`[DEBUG] Nova mensagem em: ${message.channel.id} | Conteúdo: ${message.content}`);

    const match = message.content.match(regex);
if (!match) {
  console.log('❌ Regex não bateu!');
  console.log('Mensagem:', message.content);
  return;
}

console.log('✅ Regex OK!');

const discordId = match[1];
const nomeExecutor = match[2];
const idApreendido = match[3];
const nomeApreendido = match[4];
const items = match[5];
const valor = match[6];
const data = match[7];
const hora = match[8];


    const timestamp = moment(`${data} ${hora}`, 'DD/MM/YYYY HH:mm:ss').valueOf();
    const now = Date.now();

    // Evita duplicidade no intervalo de 1 minuto
    if (cooldownMap.has(discordId)) {
      const last = cooldownMap.get(discordId);
      if (now - last < 60000) return;
    }
cooldownMap.set(discordId, now);
setTimeout(() => cooldownMap.delete(discordId), 60000);
    // Busca usuário do Discord pelo ID do jogo
const userRecord = await MemberID.findOne({ where: { discordId: discordId } });
   if (!userRecord) {
  console.log(`❌ Nenhum usuário encontrado com discordId: ${discordId}`);
  return;
}
    const memberId = userRecord.memberId;

    const dataDisplay = moment(timestamp).tz('America/Sao_Paulo').format('DD/MM/YYYY');
    const dataDB = moment(timestamp).tz('America/Sao_Paulo').toDate();

    // Boosts ativos (de Loja)
    const boostItems = [
      'Boost 2x Relatórios por 1 dia',
      'Boost 4x Relatórios por 1 dia',
    ];
    let boostMultiplier = 1;
    try {
      const boostRecords = await Loja.findAll({
        where: {
          userId: memberId,
          item: { [Op.in]: boostItems },
        },
      });
      let boostSum = 0;
      for (const record of boostRecords) {
        if (record.item === 'Boost 2x Relatórios por 1 dia') boostSum += 2;
        if (record.item === 'Boost 4x Relatórios por 1 dia') boostSum += 4;
      }
      if (boostSum > 0) boostMultiplier = boostSum;
    } catch (err) {}

    // Registrar múltiplos relatórios (1 com participantes, demais vazios)
    const relatorios = [];
    for (let i = 0; i < boostMultiplier; i++) {
      relatorios.push({
        commanderId: memberId,
        commanderName: nomeExecutor,
        participants: i === 0 ? idApreendido : '',
        imageUrl: '',
        reportDate: dataDB,
        boostMultiplier,
      });
    }

    let novosRelatorios;
    try {
      novosRelatorios = await ApreensaoReports.bulkCreate(relatorios);
    } catch (err) {
      console.error('Erro ao salvar relatórios:', err);
      return;
    }

    const relatorioPrincipal = novosRelatorios[0];
    const numeroRelatorio = relatorioPrincipal.id;

    // Embed com informações
    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle(`📦 Relatório de Apreensão Nº${numeroRelatorio} - ${dataDisplay}`)
      .addFields(
        {
          name: '👮 Enviado por',
          value: `<@${memberId}>`,
          inline: true,
        },
        {
          name: '👤 Apreendido',
          value: `${nomeApreendido} (ID ${idApreendido})`,
          inline: true,
        },
        {
          name: '📦 Itens',
          value: items.trim(),
          inline: false,
        },
        {
          name: '💰 Valor',
          value: valor.trim(),
          inline: true,
        },
        {
          name: '🕒 Data e Hora',
          value: `${data} às ${hora}`,
          inline: true,
        }
      )
      .setFooter({ text: 'Relatório registrado automaticamente.' });

   let canalEnvio;
try {
  const guildDestino = await message.client.guilds.fetch(guildDestinoId);
  canalEnvio = await guildDestino.channels.fetch(canalDestinoId);
  if (!canalEnvio || !canalEnvio.isTextBased()) {
    console.error('❌ Canal de destino não encontrado ou não é de texto.');
    return;
  }
} catch (err) {
  console.error('❌ Erro ao buscar guild ou canal de destino:', err);
  return;
}

    let mensagemEnviada;
    try {
      mensagemEnviada = await canalEnvio.send({ embeds: [embed] });
      await relatorioPrincipal.update({ messageId: mensagemEnviada.id });
    } catch (err) {
      console.error('Erro ao enviar embed:', err);
    }

    // Sistema de pontos
    const actionId = 'relatorio_apreensao';
    const action = actionTypes.find((a) => a.id_tipo === actionId);
    if (!action) return;

    const basePoints = action.pontos_base;

    // Multiplicador
    let multiplicador = 1;
    const multReg = await UserMultiplicadores.findOne({ where: { userId: memberId } });
    if (multReg) multiplicador = multReg.multiplicador;

    // Atualiza pontos
    let userPontos = await UserPontos.findOne({ where: { userId: memberId } });
    if (userPontos) {
      userPontos.pontos += basePoints * multiplicador;
      await userPontos.save();
    } else {
      await UserPontos.create({
        userId: memberId,
        pontos: basePoints * multiplicador,
      });
    }

    // Registro da ação
    await UserActions.create({
      userId: memberId,
      id_tipo: action.id_tipo,
      nome_tipo: action.nome_tipo,
      pontos: basePoints,
      multiplicador: multiplicador,
      pontosRecebidos: basePoints * multiplicador,
    });
  },
};
