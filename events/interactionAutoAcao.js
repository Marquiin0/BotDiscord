const {
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js')
const config = require('../config')
const {
  ActionReports,
  ActionReportsAll,
  UserPontos,
  UserActions,
  UserMultiplicadores,
  MemberID,
  VictoryDefeat,
} = require('../database.js')
const moment = require('moment-timezone')
const actionTypes = require('../utils/actionTypes.json')

// Cooldown para evitar duplicidade
const cooldownMap = new Map()

// ═══════════════════════════════════════════════════════════════
// REGEX PLACEHOLDER — Ajustar quando as logs do FiveM chegarem
// ═══════════════════════════════════════════════════════════════
// Exemplo de formato esperado (ajustar conforme o real):
// [AÇÃO]: Banco Central [RESULTADO]: Vitória [POLICIAIS]: 1000-Marcos,1001-João,1002-Pedro [BANDIDOS]: 2000-Zé,2001-Carlos [Data]: 01/01/2024 [Hora]: 15:30:45
//
// O regex abaixo é um PLACEHOLDER. Quando as logs reais chegarem,
// o formato será analisado e o regex será ajustado.
const regex = /\[AÇÃO\]:\s*(.+?)\s*\[RESULTADO\]:\s*(.+?)\s*\[POLICIAIS\]:\s*(.+?)\s*\[BANDIDOS\]:\s*(.+?)\s*\[Data\]:\s*([\d/]+)\s*\[Hora\]:\s*([\d:]+)/i

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Verifica se a mensagem é do canal de logs de ação
    if (!message.guild || message.guild.id !== config.guilds.logs) return
    if (message.channel.id !== config.logsChannels.acao) return

    const match = message.content.match(regex)
    if (!match) {
      console.log('[AÇÃO AUTO] Regex não bateu. Mensagem:', message.content.substring(0, 100))
      return
    }

    console.log('[AÇÃO AUTO] Regex bateu, processando relatório de ação.')

    // ═══════════════════════════════════════════════════════════
    // Extrair dados — AJUSTAR conforme o formato real das logs
    // ═══════════════════════════════════════════════════════════
    const nomeAcao = match[1].trim()
    const resultado = match[2].trim()
    const policiaisRaw = match[3].trim()
    const bandidosRaw = match[4].trim()
    const data = match[5]
    const hora = match[6]

    const timestamp = moment(`${data} ${hora}`, 'DD/MM/YYYY HH:mm:ss').valueOf()
    const now = Date.now()

    // Cooldown por ação (evitar duplicidade)
    const cooldownKey = `${nomeAcao}_${data}_${hora}`
    if (cooldownMap.has(cooldownKey) && now - cooldownMap.get(cooldownKey) < 120000) return
    cooldownMap.set(cooldownKey, now)
    setTimeout(() => cooldownMap.delete(cooldownKey), 120000)

    // ═══════════════════════════════════════════════════════════
    // Parsear policiais — AJUSTAR formato conforme log real
    // Formato esperado: "1000-Marcos,1001-João,1002-Pedro"
    // ═══════════════════════════════════════════════════════════
    const policiaisEntries = policiaisRaw.split(',').map(p => p.trim()).filter(p => p)

    // Mapear IDs do jogo para Discord IDs
    const policiaisDiscord = []
    let comandanteDiscordId = null
    let comandanteNome = ''

    for (const entry of policiaisEntries) {
      // Tenta extrair ID e nome — ajustar regex conforme formato real
      const idMatch = entry.match(/(\d+)/)
      if (!idMatch) continue

      const gameId = idMatch[1]
      const userRecord = await MemberID.findOne({ where: { discordId: gameId } })

      if (userRecord) {
        policiaisDiscord.push(userRecord.memberId)
        // O primeiro policial é considerado o comandante
        if (!comandanteDiscordId) {
          comandanteDiscordId = userRecord.memberId
          comandanteNome = entry.replace(/^\d+\s*-?\s*/, '').trim() || userRecord.memberName
        }
      }
    }

    if (!comandanteDiscordId) {
      console.log('[AÇÃO AUTO] Nenhum policial encontrado no banco de dados.')
      return
    }

    // Participantes = todos exceto o comandante
    const participantes = policiaisDiscord.filter(id => id !== comandanteDiscordId)

    // ═══════════════════════════════════════════════════════════
    // Determinar vitória/derrota
    // AJUSTAR conforme o formato real (pode ser por texto ou por
    // quem sobreviveu/morreu)
    // ═══════════════════════════════════════════════════════════
    const isVitoria = resultado.toLowerCase().includes('vitória') ||
      resultado.toLowerCase().includes('vitoria') ||
      resultado.toLowerCase().includes('win') ||
      resultado.toLowerCase().includes('venceu')

    const resultadoTexto = isVitoria ? '✅ Vitória' : '❌ Derrota'

    // Horário formatado
    const horaFormatada = `${data} às ${hora}`

    // Criar registro no banco
    const report = await ActionReports.create({
      actionName: nomeAcao,
      actionTime: horaFormatada,
      commanderId: comandanteDiscordId,
      commanderName: comandanteNome,
      messageId: 'pending',
      participants: participantes.join(', '),
      opponent: bandidosRaw,
      result: resultadoTexto,
    })

    // Registro histórico
    await ActionReportsAll.create({
      actionName: nomeAcao,
      actionTime: horaFormatada,
      commanderId: comandanteDiscordId,
      commanderName: comandanteNome,
      messageId: 'pending',
      participants: participantes.join(', '),
      opponent: bandidosRaw,
      result: resultadoTexto,
    })

    // Montar embed
    const participantesDisplay = participantes.length > 0
      ? participantes.map(id => `<@${id}>`).join(', ')
      : 'Nenhum'

    // Estatísticas do comandante
    const cmdVitorias = await ActionReportsAll.count({
      where: { commanderId: comandanteDiscordId, result: '✅ Vitória' },
    })
    const cmdDerrotas = await ActionReportsAll.count({
      where: { commanderId: comandanteDiscordId, result: '❌ Derrota' },
    })

    const embed = new EmbedBuilder()
      .setColor(isVitoria ? '#2ECC71' : '#FF0000')
      .setTitle(`⚔️ Relatório de Ação - ${nomeAcao}`)
      .addFields(
        { name: '📢 Nome da Ação', value: nomeAcao, inline: true },
        { name: '⏳ Horário', value: horaFormatada, inline: true },
        { name: '🏅 Resultado', value: resultadoTexto, inline: true },
        { name: '👮 Comandado por', value: `<@${comandanteDiscordId}>`, inline: true },
        { name: '🎯 Contra', value: bandidosRaw, inline: true },
        { name: '👥 Participantes', value: participantesDisplay, inline: false },
        { name: '📊 Estatísticas do Comandante', value: `🏆 Vitórias: ${cmdVitorias} | ❌ Derrotas: ${cmdDerrotas}`, inline: false },
      )
      .setFooter({ text: 'Relatório registrado automaticamente' })
      .setTimestamp()

    // Enviar no canal de relatórios do server principal
    let reportGuild, canal
    try {
      reportGuild = await client.guilds.fetch(config.guilds.main)
      canal = await reportGuild.channels.fetch(config.channels.acoesLog)
      if (!canal || !canal.isTextBased()) {
        console.error('[AÇÃO AUTO] Canal de destino não encontrado.')
        return
      }
    } catch (err) {
      console.error('[AÇÃO AUTO] Erro ao buscar guild/canal:', err)
      return
    }

    const msg = await canal.send({ embeds: [embed] })
    await report.update({ messageId: msg.id })

    // ═══════════════════════════════════════════════════════════
    // Pontuação
    // ═══════════════════════════════════════════════════════════
    // Comandante
    const cmdAction = isVitoria
      ? actionTypes.find(a => a.id_tipo === 'relatorio_acao_cmd_vitoria')
      : actionTypes.find(a => a.id_tipo === 'relatorio_acao_cmd_derrota')

    if (cmdAction) {
      const multiplicador = (await UserMultiplicadores.findOne({ where: { userId: comandanteDiscordId } }))?.multiplicador || 1
      const pontosFinal = cmdAction.pontos_base * multiplicador

      const userPontos = await UserPontos.findOrCreate({
        where: { userId: comandanteDiscordId },
        defaults: { pontos: 0 },
      }).then(([record]) => record)

      userPontos.pontos += pontosFinal
      await userPontos.save()

      await UserActions.create({
        userId: comandanteDiscordId,
        id_tipo: cmdAction.id_tipo,
        nome_tipo: cmdAction.nome_tipo,
        pontos: cmdAction.pontos_base,
        multiplicador,
        pontosRecebidos: pontosFinal,
      })
    }

    // Participantes
    const partAction = isVitoria
      ? actionTypes.find(a => a.id_tipo === 'relatorio_acao_part_vitoria')
      : actionTypes.find(a => a.id_tipo === 'relatorio_acao_part_derrota')

    if (partAction) {
      for (const partId of participantes) {
        const partMult = (await UserMultiplicadores.findOne({ where: { userId: partId } }))?.multiplicador || 1
        const partPontos = partAction.pontos_base * partMult

        const partUserPontos = await UserPontos.findOrCreate({
          where: { userId: partId },
          defaults: { pontos: 0 },
        }).then(([record]) => record)

        partUserPontos.pontos += partPontos
        await partUserPontos.save()

        await UserActions.create({
          userId: partId,
          id_tipo: partAction.id_tipo,
          nome_tipo: partAction.nome_tipo,
          pontos: partAction.pontos_base,
          multiplicador: partMult,
          pontosRecebidos: partPontos,
        })
      }
    }

    console.log(`[AÇÃO AUTO] Relatório criado: ${nomeAcao} - ${resultadoTexto} - Comandante: ${comandanteNome} - ${participantes.length} participantes`)
  },
}
