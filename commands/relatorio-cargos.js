const {
  SlashCommandBuilder,
  AttachmentBuilder,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const {
  ActionReports,
  PrisonReports,
  ApreensaoReports,
  PromotionRecords,
  PatrolSession,
  Warning,
} = require('../database')
const config = require('../config')
const moment = require('moment-timezone')
const { Sequelize, Op } = require('sequelize')
const Excel = require('exceljs')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('relatorio-cargos')
    .setDescription('Gera relatório XLSX com o progresso de promoção de todos os membros.'),

  async execute(interaction, client) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      const guild = client.guilds.cache.get(config.guilds.main)
      if (!guild) {
        return interaction.editReply({ content: '❌ Guild principal não encontrada.' })
      }

      // Buscar todos os membros
      await guild.members.fetch()

      const weekStart = moment().tz('America/Sao_Paulo').startOf('week').toDate()
      const rows = []

      for (const [, member] of guild.members.cache) {
        if (member.user.bot) continue

        // Identifica patente atual
        let currentRankKey = null
        for (const key of config.rankOrder) {
          if (member.roles.cache.has(config.ranks[key].roleId)) {
            currentRankKey = key
            break
          }
        }

        if (!currentRankKey) continue

        const reqs = config.promotionRequirements[currentRankKey]
        if (!reqs) continue // COR+ sem requisitos automáticos

        const rank = config.ranks[currentRankKey]
        const nextRankTag = config.ranks[reqs.nextRank] ? config.ranks[reqs.nextRank].tag : reqs.nextRank

        // Última promoção
        const promotionRecord = await PromotionRecords.findOne({
          where: { userId: member.id },
        })
        const lastPromotionDate = promotionRecord && promotionRecord.lastPromotionDate
          ? new Date(promotionRecord.lastPromotionDate)
          : member.joinedAt || new Date(0)

        const diasNoCargo = Math.floor((Date.now() - lastPromotionDate.getTime()) / (1000 * 60 * 60 * 24))

        // Relatórios de ação (cmd + part)
        const [actionCmd, actionPart] = await Promise.all([
          ActionReports.count({ where: { commanderId: member.id } }),
          ActionReports.count({ where: { participants: { [Op.like]: `%${member.id}%` } } }),
        ])

        // Relatórios de apreensão (cmd + part)
        const [apreensaoCmd, apreensaoPart] = await Promise.all([
          ApreensaoReports.count({ where: { commanderId: member.id } }),
          ApreensaoReports.count({ where: { participants: { [Op.like]: `%${member.id}%` } } }),
        ])

        const totalAcaoApreensao = actionCmd + actionPart + apreensaoCmd + apreensaoPart

        // Relatórios de prisão (cmd + part)
        const [prisonCmd, prisonPart] = await Promise.all([
          PrisonReports.count({ where: { commanderId: member.id } }),
          PrisonReports.count({ where: { participants: { [Op.like]: `%${member.id}%` } } }),
        ])
        const totalPrisao = prisonCmd + prisonPart

        // Horas semanais
        const weeklyData = await PatrolSession.findOne({
          attributes: [
            [Sequelize.fn('COALESCE', Sequelize.fn('SUM', Sequelize.col('duration')), 0), 'totalHours']
          ],
          where: {
            discordId: member.id,
            weekStart,
            exitTime: { [Op.ne]: null },
          },
          raw: true,
        })
        const horasSemanais = weeklyData ? parseFloat(weeklyData.totalHours) : 0

        // Horas acumuladas desde promoção
        const accData = await PatrolSession.findOne({
          attributes: [
            [Sequelize.fn('COALESCE', Sequelize.fn('SUM', Sequelize.col('duration')), 0), 'totalHours']
          ],
          where: {
            discordId: member.id,
            exitTime: { [Op.ne]: null },
            entryTime: { [Op.gte]: lastPromotionDate },
          },
          raw: true,
        })
        const horasAcumuladas = accData ? parseFloat(accData.totalHours) : 0

        // Cursos de ação
        const cursosAcao = config.actionCourseRoles.filter(roleId =>
          member.roles.cache.has(roleId)
        ).length

        // Curso MAA
        const hasMaa = member.roles.cache.has(config.cursoMAA.roleAprovado) ? 'Sim' : 'Não'

        // Advertências
        const advCount = await Warning.count({ where: { userId: member.id } })

        // Redução de dias da loja
        let dayReduction = 0
        for (const [roleId, days] of Object.entries(config.promotionDayReductions)) {
          if (member.roles.cache.has(roleId)) dayReduction += days
        }

        // Status
        let apto = true
        if (!reqs.indicacao) {
          const diasReq = Math.max(reqs.dias - dayReduction, 0)
          if (reqs.cursoMAA && !member.roles.cache.has(config.cursoMAA.roleAprovado)) apto = false
          if (totalAcaoApreensao < reqs.apreensaoAcao) apto = false
          if (totalPrisao < reqs.prisao) apto = false
          if (reqs.horasPatrulha > 0 && horasAcumuladas < reqs.horasPatrulha) apto = false
          if (reqs.cursosAcao > 0 && cursosAcao < reqs.cursosAcao) apto = false
          if (reqs.semAdvertencia && advCount > 0) apto = false
          if (diasNoCargo < diasReq) apto = false
        } else {
          // Para indicação, só verifica dias
          const diasReq = Math.max(reqs.dias - dayReduction, 0)
          if (diasNoCargo < diasReq) apto = false
        }

        rows.push({
          nome: member.displayName,
          patente: rank.tag,
          proxima: nextRankTag,
          acaoApreensao: reqs.indicacao ? 'N/A' : `${totalAcaoApreensao}/${reqs.apreensaoAcao}`,
          prisoes: reqs.indicacao ? 'N/A' : `${totalPrisao}/${reqs.prisao}`,
          horasSemanais: horasSemanais.toFixed(1),
          horasAcumuladas: horasAcumuladas.toFixed(1),
          horasReq: reqs.indicacao ? 'N/A' : `${reqs.horasPatrulha || 0}`,
          cursosAcao: reqs.indicacao ? 'N/A' : `${cursosAcao}/${reqs.cursosAcao}`,
          maa: hasMaa,
          advertencias: advCount,
          diasNoCargo: diasNoCargo,
          diasReq: Math.max(reqs.dias - dayReduction, 0),
          reducaoLoja: dayReduction > 0 ? `-${dayReduction} dias` : '-',
          status: apto ? 'Apto' : 'Não Apto',
          _apto: apto,
          _advReq: reqs.semAdvertencia || false,
          _advCount: advCount,
        })
      }

      // Ordenar por rank order
      const rankOrderMap = {}
      config.rankOrder.forEach((key, i) => { rankOrderMap[config.ranks[key].tag] = i })
      rows.sort((a, b) => (rankOrderMap[a.patente] || 99) - (rankOrderMap[b.patente] || 99))

      // Gerar Excel
      const workbook = new Excel.Workbook()
      const worksheet = workbook.addWorksheet('Relatório de Cargos')
      worksheet.columns = [
        { header: 'Nome', key: 'nome', width: 30 },
        { header: 'Patente', key: 'patente', width: 12 },
        { header: 'Próxima', key: 'proxima', width: 12 },
        { header: 'Ações/Apreensões', key: 'acaoApreensao', width: 18 },
        { header: 'Prisões', key: 'prisoes', width: 12 },
        { header: 'Horas Semanais', key: 'horasSemanais', width: 16 },
        { header: 'Horas Acumuladas', key: 'horasAcumuladas', width: 18 },
        { header: 'Horas Req.', key: 'horasReq', width: 12 },
        { header: 'Cursos Ação', key: 'cursosAcao', width: 14 },
        { header: 'MAA', key: 'maa', width: 8 },
        { header: 'Advertências', key: 'advertencias', width: 14 },
        { header: 'Dias no Cargo', key: 'diasNoCargo', width: 14 },
        { header: 'Dias Req.', key: 'diasReq', width: 12 },
        { header: 'Redução Loja', key: 'reducaoLoja', width: 14 },
        { header: 'Status', key: 'status', width: 12 },
      ]

      // Estilizar cabeçalho
      const headerRow = worksheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E90FF' },
      }

      // Preencher linhas
      for (const data of rows) {
        const row = worksheet.addRow({
          nome: data.nome,
          patente: data.patente,
          proxima: data.proxima,
          acaoApreensao: data.acaoApreensao,
          prisoes: data.prisoes,
          horasSemanais: data.horasSemanais,
          horasAcumuladas: data.horasAcumuladas,
          horasReq: data.horasReq,
          cursosAcao: data.cursosAcao,
          maa: data.maa,
          advertencias: data.advertencias,
          diasNoCargo: data.diasNoCargo,
          diasReq: data.diasReq,
          reducaoLoja: data.reducaoLoja,
          status: data.status,
        })

        // Colorir status
        if (data._apto) {
          row.getCell('status').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2ECC71' },
          }
        }

        // Colorir advertências em vermelho se requer 0 e tem
        if (data._advReq && data._advCount > 0) {
          row.getCell('advertencias').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF0000' },
          }
          row.getCell('advertencias').font = { color: { argb: 'FFFFFFFF' } }
        }
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const attachment = new AttachmentBuilder(buffer, {
        name: `RelatorioCargos_${moment().format('DD-MM-YYYY')}.xlsx`,
      })

      await interaction.editReply({
        content: `✅ Relatório de cargos gerado com **${rows.length}** membros.`,
        files: [attachment],
      })
    } catch (error) {
      console.error('Erro ao gerar relatório de cargos:', error)
      await interaction.editReply({
        content: `❌ Erro ao gerar relatório.\n\`\`\`${error.message}\`\`\``,
      })
    }
  },
}
