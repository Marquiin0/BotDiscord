const { PatrolSession, MemberID } = require('../database')
const config = require('../config')
const moment = require('moment-timezone')

/**
 * Calcula o domingo 00:00 (São Paulo) da semana atual.
 */
function getCurrentWeekStart() {
  return moment().tz('America/Sao_Paulo').startOf('week').toDate()
}

/**
 * Regex para o formato de log de toggle:
 * [TOGGLE]: policia
 * [MEMBRO]: 1000 Apollo Corno
 * [STATUS]: Entrou em serviço / Saiu de serviço
 * [DATA]: 01/01/2000 [HORA]: 01:01:01
 */
const toggleRegex = /\[TOGGLE\]:\s*policia\s*\n\[MEMBRO\]:\s*(\d+)\s+(.+?)\s*\n\[STATUS\]:\s*(Entrou em servi[çc]o|Saiu de servi[çc]o)\s*\n\[DATA\]:\s*(\d{2}\/\d{2}\/\d{4})\s+(?:\[HORA\]:\s*)?(\d{2}:\d{2}:\d{2})/i

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    // Só processa mensagens nos canais de toggle
    const toggleChannels = [
      config.logsChannels.ponto,
      config.logsChannels.pontoMerryWeather,
    ]

    if (!toggleChannels.includes(message.channel.id)) return

    const match = message.content.match(toggleRegex)
    if (!match) return

    const inGameId = match[1]
    const memberName = match[2].trim()
    const isEntry = match[3].toLowerCase().includes('entrou')
    const dateTimeStr = `${match[4]} ${match[5]}`
    const dateTime = moment(dateTimeStr, 'DD/MM/YYYY HH:mm:ss').toDate()

    const source = message.channel.id === config.logsChannels.ponto
      ? 'genesis'
      : 'merryweather'

    // Buscar Discord ID via MemberID (discordId = in-game ID no banco)
    let discordUserId = null
    try {
      const memberRecord = await MemberID.findOne({ where: { discordId: inGameId } })
      if (memberRecord) {
        discordUserId = memberRecord.memberId
      } else {
        // Fallback: buscar membro na guild pelo in-game ID no nickname (formato: | ID)
        const guild = message.client.guilds.cache.get(config.guilds.main)
        if (guild) {
          try {
            const allMembers = await guild.members.fetch()
            const found = allMembers.find(m => {
              const idMatch = m.displayName.match(/\|\s*(\d+)/)
              return idMatch && idMatch[1] === inGameId
            })
            if (found) {
              discordUserId = found.user.id
              // Criar MemberID para futuras buscas
              await MemberID.upsert({
                memberName,
                discordId: inGameId,
                memberId: found.user.id,
              })
              console.log(`[PatrolMonitor] MemberID criado via fallback: ${memberName} (${inGameId}) -> ${found.user.id}`)
            } else {
              console.log(`[PatrolMonitor] Nenhum membro encontrado com ID ${inGameId} no nickname`)
            }
          } catch (fetchErr) {
            console.error('[PatrolMonitor] Erro no fallback de busca:', fetchErr.message)
          }
        }
      }
    } catch (err) {
      console.error('[PatrolMonitor] Erro ao buscar MemberID:', err)
    }

    const weekStart = getCurrentWeekStart()

    try {
      if (isEntry) {
        // Fechar sessões abertas anteriores (edge case: entrada sem saída)
        const openSessions = await PatrolSession.findAll({
          where: { inGameId, source, exitTime: null },
        })

        for (const session of openSessions) {
          const duration = moment(dateTime).diff(moment(session.entryTime), 'hours', true)
          await session.update({
            exitTime: dateTime,
            duration: duration > 0 ? duration : 0,
          })
        }

        // Criar nova sessão
        await PatrolSession.create({
          inGameId,
          discordId: discordUserId,
          memberName,
          entryTime: dateTime,
          exitTime: null,
          duration: null,
          source,
          weekStart,
          nextCheckAt: moment(dateTime).add(3, 'hours').toDate(),
        })

        console.log(`[PatrolMonitor] ${memberName} (${inGameId}) entrou em serviço [${source}]`)
      } else {
        // Saiu de serviço - fechar sessão aberta
        const openSession = await PatrolSession.findOne({
          where: { inGameId, source, exitTime: null },
          order: [['entryTime', 'DESC']],
        })

        if (openSession) {
          const duration = moment(dateTime).diff(moment(openSession.entryTime), 'hours', true)
          await openSession.update({
            exitTime: dateTime,
            duration: duration > 0 ? duration : 0,
          })
          console.log(`[PatrolMonitor] ${memberName} (${inGameId}) saiu de serviço [${source}] - ${duration.toFixed(2)}h`)
        } else {
          console.log(`[PatrolMonitor] ${memberName} (${inGameId}) saiu sem sessão aberta [${source}]`)
        }
      }
    } catch (err) {
      console.error('[PatrolMonitor] Erro ao processar toggle:', err)
    }
  },
}
