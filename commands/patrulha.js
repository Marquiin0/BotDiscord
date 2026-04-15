const {
  SlashCommandBuilder,
  AttachmentBuilder,
  PermissionsBitField,
} = require('discord.js')
const { MemberID, PatrolHours, Ausencia } = require('../database.js')
const {
  ActionReports,
  PrisonReports,
  PromotionRecords,
  ApreensaoReports,
  Warning,
} = require('../database.js')
const Excel = require('exceljs')
const moment = require('moment')
const { Op } = require('sequelize')
const { MessageFlags } = require('discord.js')
const config = require('../config')

/**
 * Extrai dados de serviço do conteúdo de mensagem (entrada/saída).
 */
const extractServiceData = messageContent => {
  // Formato antigo: [3°BPM/Eclipse Police]: ID Username \n[===== ENTROU/SAIU =====]\n[Data]: DD/MM/YYYY [Hora]: HH:MM:SS
  const oldPattern =
    /\[(?:3°BPM\.permissao|3°BPM|3°BPM|Eclipse Police\.permissao|Eclipse Police)\]:\s*(\d+)\s*(.*?)\s*\r?\n\[\=+\s*(ENTROU\s+(?:EM|DE)\s+SERVICO|SAIU\s+DE\s+SERVICO)\s*\=+\]\s*\r?\n\[Data\]:\s*(\d{2}\/\d{2}\/\d{4})\s*\[Hora\]:\s*(\d{2}:\d{2}:\d{2})/gi

  const oldMatches = [...messageContent.matchAll(oldPattern)].map(match => ({
    userId: match[1],
    userName: match[2].trim(),
    action: match[3].includes('ENTROU') ? 'ENTROU' : 'SAIU',
    date: `${match[4]} ${match[5]}`,
  }))

  // Formato novo: [TOGGLE]: policia \n[MEMBRO]: ID Nome \n[STATUS]: Entrou/Saiu em serviço \n[DATA]: DD/MM/YYYY [HORA]: HH:MM:SS
  const newPattern =
    /\[TOGGLE\]:\s*policia\s*\n\[MEMBRO\]:\s*(\d+)\s+(.+?)\s*\n\[STATUS\]:\s*(Entrou em servi[çc]o|Saiu de servi[çc]o)\s*\n\[DATA\]:\s*(\d{2}\/\d{2}\/\d{4})\s+(?:\[HORA\]:\s*)?(\d{2}:\d{2}:\d{2})/gi

  const newMatches = [...messageContent.matchAll(newPattern)].map(match => ({
    userId: match[1],
    userName: match[2].trim(),
    action: match[3].toLowerCase().includes('entrou') ? 'ENTROU' : 'SAIU',
    date: `${match[4]} ${match[5]}`,
  }))

  return [...oldMatches, ...newMatches]
}

/**
 * Busca todos os membros no banco e retorna um objeto { [discordId]: { memberId, memberName, createdAt } }
 */
const getMemberIds = async () => {
  try {
    const members = await MemberID.findAll({
      attributes: ['discordId', 'memberId', 'memberName', 'createdAt'],
    })
    return members.reduce((ids, member) => {
      ids[member.discordId] = {
        memberId: member.memberId,
        memberName: member.memberName,
        createdAt: member.createdAt,
      }
      return ids
    }, {})
  } catch (error) {
    console.error('Erro ao buscar os IDs dos membros:', error)
    return {}
  }
}

/**
 * Normaliza o valor das horas para algo como "X.YY" (ex: 2.30, 10.05).
 */
const normalizeTime = totalHours => {
  let hours = Math.floor(totalHours)
  let minutes = Math.round((totalHours - hours) * 60)
  if (minutes >= 60) {
    hours += Math.floor(minutes / 60)
    minutes = minutes % 60
  }
  return `${hours}.${minutes.toString().padStart(2, '0')}`
}

/**
 * Calcula as horas de cada usuário com base nos registros de entrada/saída.
 */
const calculateHours = (data, memberNames) => {
  const hoursByUser = {}

  // Ordenar os eventos por data/hora
  const sortedData = data.sort(
    (a, b) =>
      moment(a.date, 'DD/MM/YYYY HH:mm:ss').valueOf() -
      moment(b.date, 'DD/MM/YYYY HH:mm:ss').valueOf(),
  )

  sortedData.forEach(({ userId, userName, action, date }) => {
    const dateTime = moment(date, 'DD/MM/YYYY HH:mm:ss')

    if (!hoursByUser[userId]) {
      hoursByUser[userId] = {
        userId,
        // Pega o nome do banco (se existir), caso contrário pega o do log
        userName: memberNames[userId]?.memberName || userName,
        totalTime: 0,
        lastEntry: null,
        lastExit: null,
        dataRecrutamento: memberNames[userId]?.createdAt || null,
      }
    }

    if (action === 'ENTROU') {
      hoursByUser[userId].lastEntry = dateTime
    } else if (action === 'SAIU') {
      if (hoursByUser[userId].lastEntry) {
        const duration = moment.duration(
          dateTime.diff(hoursByUser[userId].lastEntry),
        )
        if (duration.asHours() > 0) {
          hoursByUser[userId].totalTime += duration.asHours()
        }
      }
      hoursByUser[userId].lastExit = dateTime
    }
  })

  return Object.values(hoursByUser)
}

/**
 * Retorna quantos dias se passaram desde a última saída.
 */
const calculateAbsence = lastExit => {
  if (!lastExit) return null
  const today = moment().startOf('day')
  const lastExitDate = moment(lastExit).startOf('day')
  return today.diff(lastExitDate, 'days')
}

/**
 * Gera uma lista completa com todos os membros do banco, mesmo que não tenham entrada/saída no período.
 */
const calculateAndIncludeAllMembers = async (patrolHours, memberNames) => {
  const allMembersData = []

  for (const [userId, memberInfo] of Object.entries(memberNames)) {
    const patrolRecord = patrolHours.find(record => record.userId === userId)
    const totalTime = patrolRecord ? patrolRecord.totalTime : 0

    allMembersData.push({
      userId,
      memberId: memberInfo.memberId,
      userName: memberInfo.memberName,
      totalTime,
      dataRecrutamento: moment(memberInfo.createdAt).toDate(),
      lastExit: patrolRecord ? patrolRecord.lastExit : null,
      lastEntry: patrolRecord ? patrolRecord.lastEntry : null,
    })
  }

  return allMembersData
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('patrulha')
    .setDescription('Calcula as horas de patrulha dos membros.'),

  async execute(interaction, client) {
    // Verifica permissões
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      ) &&
      !interaction.memberPermissions.has(
        PermissionsBitField.Flags.UseApplicationCommands,
      )
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    if (!interaction.guild) return

    await interaction.deferReply()
    try {
      /**
       * 1) Obter a guild de logs e garantir que ela exista
       */
      const guild = client.guilds.cache.get(config.guilds.logs)
      if (!guild) {
        await interaction.editReply(
          'Não foi possível encontrar a guilda especificada.',
        )
        return
      }

      /**
       * 2) Buscar o canal onde ficam registrados os logs de entrada/saída
       */
      const channel = guild.channels.cache.get(config.logsChannels.ponto)
      if (!channel) {
        await interaction.editReply(
          'Não foi possível encontrar o canal especificado na guilda alvo.',
        )
        return
      }

      /**
       * 3) Limpar a tabela PatrolHours antes de recalcular
       */
      await PatrolHours.destroy({ where: {}, truncate: true })

      /**
       * 4) Calcular a data do último domingo (considerando UTC-3)
       */
      const lastSunday = moment()
        .day(0)
        .subtract(moment().day() === 0 ? 1 : 0, 'week')
        .endOf('day')
        .toDate()

      let lastId = null
      let complete = false
      let allMessages = []

      // Paginação de 100 em 100 mensagens até terminar ou até que só haja mensagens antes do lastSunday
      while (!complete) {
        const options = { limit: 100 }
        if (lastId) options.before = lastId
        const messages = await channel.messages.fetch(options)
        const filteredMessages = messages.filter(
          m => m.createdTimestamp > lastSunday.getTime(),
        )
        allMessages = [...allMessages, ...filteredMessages.map(m => m.content)]
        lastId = messages.last()?.id
        complete = messages.size < 100 || filteredMessages.size === 0
      }

      /**
       * 5) Montar o dicionário de membros (discordId -> {memberId, memberName, createdAt})
       */
      const memberNames = await getMemberIds()

      /**
       * 6) Extrair entradas e saídas de serviço das mensagens
       */
      const serviceData = allMessages
        .flatMap(extractServiceData)
        // Filtra somente quem está no banco
        .filter(d => memberNames.hasOwnProperty(d.userId))

      /**
       * 7) Calcular horas de patrulha
       */
      const patrolHours = calculateHours(serviceData, memberNames)

      /**
       * 8) Combinar dados de todos os membros com as horas calculadas
       */
      const allMembersData = await calculateAndIncludeAllMembers(
        patrolHours,
        memberNames,
      )

      /**
       * 9) Salvar no banco (tabela PatrolHours)
       */
      for (const user of allMembersData) {
        await PatrolHours.create({
          userId: user.userId,
          memberId: user.memberId,
          memberName: user.userName,
          hours: normalizeTime(user.totalTime),
          dataRecrutamento: user.dataRecrutamento,
          lastExit: user.lastExit ? moment(user.lastExit).toDate() : null,
          lastEntry: user.lastEntry ? moment(user.lastEntry).toDate() : null,
        })
      }

      /**
       * 10) Gerar a planilha Excel
       */
      const workbook = new Excel.Workbook()
      const worksheet = workbook.addWorksheet('Relatório Geral 7 Dias')
      worksheet.columns = [
        { header: 'ID do Membro', key: 'userId', width: 20 },
        { header: 'Nome do Membro', key: 'userName', width: 30 },
        { header: 'Horas Totais', key: 'totalTime', width: 15 },
        { header: 'Data de Recrutamento', key: 'dataRecrutamento', width: 20 },
        { header: 'Última Entrada', key: 'lastEntry', width: 20 },
        { header: 'Última Saída', key: 'lastExit', width: 20 },
        { header: 'Ausência Ativa', key: 'ausenciaAtiva', width: 15 },
        { header: 'Última Promoção', key: 'lastPromotionDate', width: 15 },
        { header: 'Total de Ações', key: 'totalActions', width: 15 },
        { header: 'Total de Prisões', key: 'totalPrisons', width: 15 },
        { header: 'Total de Apreensões', key: 'totalApreensoes', width: 15 },
        { header: 'Advertências', key: 'warningsCount', width: 15 },
      ]

      // Preenche as linhas da planilha
      for (const user of allMembersData) {
        // Verificar Ausência Ativa
        const activeAbsence = await Ausencia.findOne({
          where: { userId: user.memberId, status: 'Ativa' },
        })
        const ausenciaAtiva = activeAbsence ? 'Sim' : 'Não'

        // Última promoção
        const lastPromotion = await PromotionRecords.findOne({
          where: { userId: user.memberId },
        })
        const lastPromotionDate = lastPromotion
          ? moment(lastPromotion.lastPromotionDate).format('DD/MM/YYYY')
          : 'Nunca'

        // Defina o filtro de data para considerar somente registros a partir do lastSunday
        const filterDate = { [Op.gte]: lastSunday }

        // Ações: unificação somente dos registros desde lastSunday
        const actionsCommanded = await ActionReports.count({
          where: {
            commanderId: user.memberId,
            createdAt: filterDate,
          },
        })
        const actionsParticipated = await ActionReports.count({
          where: {
            participants: { [Op.like]: `%${user.memberId}%` },
            createdAt: filterDate,
          },
        })
        const totalActions = actionsCommanded + actionsParticipated

        // Prisões:
        const prisonsConducted = await PrisonReports.count({
          where: {
            commanderId: user.memberId,
            createdAt: filterDate,
          },
        })
        const prisonsParticipated = await PrisonReports.count({
          where: {
            participants: { [Op.like]: `%${user.memberId}%` },
            createdAt: filterDate,
          },
        })
        const totalPrisons = prisonsConducted + prisonsParticipated

        // Apreensões:
        const apreensoesRealizadas = await ApreensaoReports.count({
          where: {
            commanderId: user.memberId,
            createdAt: filterDate,
          },
        })
        const apreensoesParticipadas = await ApreensaoReports.count({
          where: {
            participants: { [Op.like]: `%${user.memberId}%` },
            createdAt: filterDate,
          },
        })
        const totalApreensoes = apreensoesRealizadas + apreensoesParticipadas
        // Advertências (todas)
        const warningsCount = await Warning.count({
          where: { userId: user.memberId },
        })

        // Montar objeto pra planilha
        const formattedUser = {
          ...user,
          totalTime: normalizeTime(user.totalTime),
          lastEntry: user.lastEntry
            ? moment(user.lastEntry).format('DD/MM/YYYY HH:mm:ss')
            : 'Nunca',
          lastExit: user.lastExit
            ? moment(user.lastExit).format('DD/MM/YYYY HH:mm:ss')
            : 'Nunca',
          ausenciaAtiva,
          lastPromotionDate,
          totalActions, // total unificado de ações
          totalPrisons, // total unificado de prisões
          totalApreensoes, // total unificado de apreensões
          warningsCount,
        }
        const row = worksheet.addRow(formattedUser)

        // Colorir a célula 'Última Saída' se o usuário estiver ausente há X dias
        let daysSinceLastExit = calculateAbsence(user.lastExit)
        if (daysSinceLastExit !== null) {
          if (daysSinceLastExit > 5) {
            row.getCell('lastExit').fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFF0000' }, // Vermelho
            }
          } else if (daysSinceLastExit >= 3 && daysSinceLastExit <= 5) {
            row.getCell('lastExit').fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFFF00' }, // Amarelo
            }
          }
        }
      }

      /**
       * 11) Converter em buffer e enviar para o servidor principal
       */
      const buffer = await workbook.xlsx.writeBuffer()
      const attachment = new AttachmentBuilder(buffer, {
        name: 'RelatorioPatrulhamento.xlsx',
      })

      // IDs do servidor principal para envio
      const otherGuild = client.guilds.cache.get(config.guilds.main)
      if (!otherGuild) {
        await interaction.editReply(
          'Não foi possível encontrar o outro servidor especificado.',
        )
        return
      }
      const otherChannel = otherGuild.channels.cache.get(config.channels.relatorioPatrulha)
      if (!otherChannel) {
        await interaction.editReply(
          'Não foi possível encontrar o outro canal especificado.',
        )
        return
      }

      await otherChannel.send({ files: [attachment] })
      await interaction.editReply(
        'As horas de patrulha foram recalculadas, o banco (já atualizado) foi utilizado e a planilha enviada.',
      )
    } catch (error) {
      console.error(
        'Erro ao calcular as horas de patrulha, atualizar o banco de dados e enviar a planilha:',
        error,
      )
      await interaction.editReply(
        'Houve um erro ao realizar as operações solicitadas.',
      )
    }
  },

  // Função para execução direta sem slash command, se você quiser
  async executePatrolCommand(client) {
    const guild = client.guilds.cache.get(config.guilds.main)
    const interaction = {
      member: { permissions: { has: () => true }, roles: { cache: new Map() } },
      guild,
      reply: async msg => console.log(msg),
      deferReply: async () => {},
      editReply: async msg => console.log(msg),
    }
    await this.execute(interaction, client)
  },
}
