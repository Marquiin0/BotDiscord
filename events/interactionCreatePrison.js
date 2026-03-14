const {
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
} = require('discord.js');
const config = require('../config');
const {
  PrisonReports,
  UserPontos,
  UserActions,
  UserMultiplicadores,
  Loja,
  MemberID,
} = require('../database.js');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const actionTypes = require('../utils/actionTypes.json');

// =====================
// Configurações
// =====================
const SOURCE_GUILD_ID = config.guilds.logs;
const SOURCE_CHANNEL_ID = config.logsChannels.prisao;
const REPORTS_CHANNEL_ID = config.channels.prisaoLog;

const cooldownMap = new Map();
const regex = /\[OFICIAL\]:\s*(\d+)\s*([^\n]+)\s*\[==============PRENDEU==============\]\s*\[RECEBEU\]:\s*\$?([\d.,]+)\s*\[PASSAPORTE\]:\s*(\d+)\s*([^\n]+)\s*\[Multa\]:\s*([\d.,]+)\s*\[TEMPO\]:\s*(\d+)\s*Meses\s*\[Data\]:\s*(\d{2}\/\d{2}\/\d{4})\s*\[Hora\]:\s*(\d{2}:\d{2}:\d{2})/i;

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Verifica se a mensagem é da guild e do canal corretos
    if (!message.guild || message.guild.id !== SOURCE_GUILD_ID) return;
    if (message.channel.id !== SOURCE_CHANNEL_ID) return;

    // Tenta casar a mensagem com o formato esperado
    const match = message.content.match(regex);
   if (!match) {
  console.log('[PRISÃO] Regex não bateu.');
  return;
} else {
  console.log('[PRISÃO] Regex bateu, processando relatório.');
}

    const [
      , oficialId, oficialNome, valorRecebido, passaporteId,
      suspeitoNome, valorMulta, tempoMeses, data, hora
    ] = match;

    const timestamp = moment(`${data} ${hora}`, 'DD/MM/YYYY HH:mm:ss').valueOf();
    const now = Date.now();

    // Aplica controle de cooldown para evitar spam: 1 minuto por oficial
    if (cooldownMap.has(oficialId) && now - cooldownMap.get(oficialId) < 60000) return;
    cooldownMap.set(oficialId, now);
    setTimeout(() => cooldownMap.delete(oficialId), 60000);

    // Converte o ID do oficial para o ID interno salvo em MemberID
    const userRecord = await MemberID.findOne({ where: { discordId: oficialId } });
    if (!userRecord) return;
    const memberId = userRecord.memberId;

    // Formatações de data para exibição e banco
    const dataDisplay = moment(timestamp).tz('America/Sao_Paulo').format('DD/MM/YYYY');
    const dataDB = moment(timestamp).tz('America/Sao_Paulo').format('YYYY-MM-DD HH:mm:ss');

    // Verifica boosts ativos
    let boostMultiplier = 1;
    try {
      const boostRecords = await Loja.findAll({
        where: {
          userId: memberId,
          item: { [Op.in]: ['Boost 2x Relatórios por 1 dia', 'Boost 4x Relatórios por 1 dia'] },
        },
      });
      boostRecords.forEach(record => {
        if (record.item.includes('2x')) boostMultiplier += 1;
        if (record.item.includes('4x')) boostMultiplier += 3;
      });
    } catch {
      /* ignora erros ao buscar boosts */
    }

    // Cria registro no banco
    const report = await PrisonReports.create({
      commanderId: memberId,
      commanderName: oficialNome,
      suspectId: passaporteId,
      suspectName: suspeitoNome,
      articles: `Multa: $${valorMulta} | Tempo: ${tempoMeses} meses`,
      participants: '',
      imageUrl: '',
      reportDate: dataDB,
      boostMultiplier,
    });

    // Monta embed
    const embed = new EmbedBuilder()
      .setColor('#ffffff')
      .setTitle(`🚔 Relatório de Prisão Nº${report.id} - ${dataDisplay}`)
      .addFields(
        { name: '📝 Suspeito', value: suspeitoNome, inline: true },
        { name: '📌 ID do Suspeito', value: passaporteId, inline: true },
        { name: '⚖️ Artigos', value: `Multa: $${valorMulta}\nTempo: ${tempoMeses} meses` },
        { name: '👮 Oficial', value: `<@${memberId}>` },
        { name: '👥 Participantes', value: 'Nenhum até o momento' }
      )
      .setFooter({ text: 'Relatório registrado automaticamente' });

    // Botão para adicionar participantes
    const addBtn = new ButtonBuilder()
      .setCustomId(`add_participant_${report.id}_${memberId}`)
      .setLabel('Adicionar participante')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(addBtn);

    // Envia embed no canal de relatórios
let reportGuild, canal;
try {
  reportGuild = await client.guilds.fetch(config.guilds.main);
  canal = await reportGuild.channels.fetch(REPORTS_CHANNEL_ID);

  if (!canal || !canal.isTextBased()) {
    console.error('❌ Canal de destino não encontrado ou não é de texto.');
    return;
  }
} catch (err) {
  console.error('❌ Erro ao buscar guilda ou canal de destino:', err);
  return;
}
const msg = await canal.send({ embeds: [embed], components: [row] });
    await report.update({ messageId: msg.id });

    // Remove botões após 1 hora
    setTimeout(async () => {
      const oldMsg = await canal.messages.fetch(msg.id).catch(() => null);
      if (oldMsg) await oldMsg.edit({ components: [] });
    }, 3600000);

    // Pontuação e estatísticas
    const action = actionTypes.find(a => a.id_tipo === 'relatorio_prisao');
    const multiplicador = (await UserMultiplicadores.findOne({ where: { userId: memberId } }))?.multiplicador || 1;
    const pontosFinal = action.pontos_base * multiplicador;

    const userPontos = await UserPontos.findOrCreate({
      where: { userId: memberId },
      defaults: { pontos: 0 },
    }).then(([record]) => record);

    userPontos.pontos += pontosFinal;
    await userPontos.save();

    await UserActions.create({
      userId: memberId,
      id_tipo: action.id_tipo,
      nome_tipo: action.nome_tipo,
      pontos: action.pontos_base,
      multiplicador,
      pontosRecebidos: pontosFinal,
    });
  },
};
