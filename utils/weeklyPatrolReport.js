const { PatrolSession, MemberID } = require('../database')
const { Sequelize, Op } = require('sequelize')
const moment = require('moment-timezone')
const Excel = require('exceljs')
const { AttachmentBuilder } = require('discord.js')
const config = require('../config')

/**
 * Formata horas decimais para "H.MM" (ex: 2.5 -> "2.30")
 */
function formatHours(decimalHours) {
  const hours = Math.floor(decimalHours)
  let minutes = Math.round((decimalHours - hours) * 60)
  if (minutes >= 60) {
    return `${hours + 1}.00`
  }
  return `${hours}.${minutes.toString().padStart(2, '0')}`
}

/**
 * Gera e envia o relatório semanal de patrulha em XLSX.
 * Chamado todo domingo às 00:00 (São Paulo).
 */
async function generateWeeklyPatrolReport(client) {
  // Semana anterior: de domingo passado até sábado
  const currentWeekStart = moment().tz('America/Sao_Paulo').startOf('week').toDate()
  const previousWeekStart = moment().tz('America/Sao_Paulo').startOf('week').subtract(1, 'week').toDate()

  // Buscar todas as sessões da semana anterior (fechadas)
  const sessions = await PatrolSession.findAll({
    where: {
      weekStart: previousWeekStart,
      exitTime: { [Op.ne]: null },
    },
    order: [['entryTime', 'ASC']],
  })

  // Buscar todos os membros do banco
  const allMembers = await MemberID.findAll()
  const memberMap = {}
  for (const m of allMembers) {
    // m.discordId = in-game ID, m.memberId = Discord ID
    memberMap[m.discordId] = {
      discordId: m.discordId, // in-game ID
      memberId: m.memberId,   // Discord user ID
      memberName: m.memberName,
    }
  }

  // Agrupar sessões por in-game ID
  const hoursByUser = {}
  for (const session of sessions) {
    const key = session.inGameId
    if (!hoursByUser[key]) {
      hoursByUser[key] = {
        inGameId: session.inGameId,
        discordId: session.discordId,
        memberName: session.memberName,
        totalHours: 0,
        sessions: [],
      }
    }
    hoursByUser[key].totalHours += session.duration || 0
    hoursByUser[key].sessions.push({
      entry: moment(session.entryTime).format('DD/MM/YYYY HH:mm'),
      exit: moment(session.exitTime).format('DD/MM/YYYY HH:mm'),
      duration: session.duration ? session.duration.toFixed(2) : '0',
      source: session.source,
    })
  }

  // Incluir membros que não tiveram sessão na semana
  for (const [inGameId, memberInfo] of Object.entries(memberMap)) {
    if (!hoursByUser[inGameId]) {
      hoursByUser[inGameId] = {
        inGameId,
        discordId: memberInfo.memberId,
        memberName: memberInfo.memberName,
        totalHours: 0,
        sessions: [],
      }
    }
  }

  // Gerar Excel
  const workbook = new Excel.Workbook()
  const sheet = workbook.addWorksheet('Patrulha Semanal')

  // Cabeçalho
  sheet.columns = [
    { header: 'ID', key: 'inGameId', width: 10 },
    { header: 'Nome', key: 'memberName', width: 25 },
    { header: 'Horas Totais', key: 'totalHours', width: 15 },
    { header: 'Sessões', key: 'sessionCount', width: 12 },
    { header: 'Fonte', key: 'source', width: 15 },
  ]

  // Estilizar cabeçalho
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E90FF' },
  }

  // Ordenar por horas (maior primeiro)
  const sortedUsers = Object.values(hoursByUser).sort((a, b) => b.totalHours - a.totalHours)

  for (const user of sortedUsers) {
    const sources = [...new Set(user.sessions.map(s => s.source))].join(', ') || 'N/A'
    const row = sheet.addRow({
      inGameId: user.inGameId,
      memberName: user.memberName,
      totalHours: formatHours(user.totalHours),
      sessionCount: user.sessions.length,
      source: sources,
    })

    // Colorir vermelho quem tem 0 horas
    if (user.totalHours === 0) {
      row.eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF6B6B' },
        }
      })
    }
  }

  // Gerar buffer e enviar
  const buffer = await workbook.xlsx.writeBuffer()
  const weekLabel = moment(previousWeekStart).format('DD-MM-YYYY')
  const attachment = new AttachmentBuilder(buffer, {
    name: `patrulha-semanal-${weekLabel}.xlsx`,
  })

  // Enviar no canal de relatório
  const channel = client.channels.cache.get(config.channels.relatorioPatrulha)
  if (channel) {
    await channel.send({
      content: `📊 **Relatório Semanal de Patrulha** - Semana de ${weekLabel}`,
      files: [attachment],
    })
  } else {
    console.error('[WeeklyPatrol] Canal de relatório não encontrado.')
  }
}

module.exports = { generateWeeklyPatrolReport }
