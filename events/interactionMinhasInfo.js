const {
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js')
const fs = require('fs')
const path = require('path')
const {
  ActionReports,
  PrisonReports,
  ApreensaoReports,
  PromotionRecords,
  PatrolHours,
  PatrolSession,
  Identificacao,
  QuizResult,
  MemberID,
  Warning,
} = require('../database')
const config = require('../config')
const moment = require('moment-timezone')
const { Sequelize, Op } = require('sequelize')

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (!interaction.isButton()) return

    // ==================== MINHAS INFORMAÇÕES ====================
    if (interaction.customId === 'minhas_informacoes') {
      await showUserInfo(interaction, interaction.user.id)
      return
    }

    // ==================== CADASTRAR PONTO ====================
    if (interaction.customId === 'cadastrar_ponto') {
      await handleCadastrarPonto(interaction)
      return
    }

    // ==================== SOLICITAR APOSENTADORIA ====================
    if (interaction.customId === 'solicitar_aposentadoria') {
      // Redireciona para o handler de aposentadoria existente
      // Este será tratado pelo interactionAposentadoria.js
      return
    }
  },
}

async function showUserInfo(interaction, targetUserId, ephemeral = true) {
  await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : 0 })

  try {
    const member = await interaction.guild.members.fetch(targetUserId).catch(() => null)
    if (!member) {
      return await interaction.editReply({ content: '❌ Usuário não encontrado.' })
    }

    // Busca dados do BD
    const [
      actionCount,
      prisonCount,
      apreensaoCount,
      promotionRecord,
      patrolData,
      identification,
      quizResult,
      memberIdRecord,
    ] = await Promise.all([
      ActionReports.count({ where: { commanderId: targetUserId } }),
      PrisonReports.count({ where: { commanderId: targetUserId } }),
      ApreensaoReports.count({ where: { commanderId: targetUserId } }),
      PromotionRecords.findOne({ where: { userId: targetUserId } }),
      PatrolSession.findOne({
        attributes: [
          [Sequelize.fn('COALESCE', Sequelize.fn('SUM', Sequelize.col('duration')), 0), 'totalHours']
        ],
        where: {
          discordId: targetUserId,
          weekStart: moment().tz('America/Sao_Paulo').startOf('week').toDate(),
          exitTime: { [Op.ne]: null },
        },
        raw: true,
      }),
      Identificacao.findOne({
        where: { userId: targetUserId, status: 'ativo' },
        order: [['dataRegistro', 'DESC']],
      }),
      QuizResult.findOne({
        where: { userId: targetUserId, passed: true },
        order: [['attemptDate', 'DESC']],
      }),
      MemberID.findOne({ where: { memberId: targetUserId } }),
    ])

    // Contagem de participações em ações
    const actionParticipations = await ActionReports.count({
      where: {
        participants: { [Op.like]: `%${targetUserId}%` },
      },
    })

    // Contagem de participações em apreensões
    const apreensaoParticipations = await ApreensaoReports.count({
      where: {
        participants: { [Op.like]: `%${targetUserId}%` },
      },
    })

    // Contagem de participações em prisões
    const prisonParticipations = await PrisonReports.count({
      where: {
        participants: { [Op.like]: `%${targetUserId}%` },
      },
    })

    // Horas acumuladas desde última promoção
    const lastPromotionDate = promotionRecord && promotionRecord.lastPromotionDate
      ? new Date(promotionRecord.lastPromotionDate)
      : member.joinedAt || new Date(0)

    const accumulatedData = await PatrolSession.findOne({
      attributes: [
        [Sequelize.fn('COALESCE', Sequelize.fn('SUM', Sequelize.col('duration')), 0), 'totalHours']
      ],
      where: {
        discordId: targetUserId,
        exitTime: { [Op.ne]: null },
        entryTime: { [Op.gte]: lastPromotionDate },
      },
      raw: true,
    })
    const accumulatedHours = accumulatedData ? parseFloat(accumulatedData.totalHours) : 0

    // Contagem de cursos de ação completados
    const actionCourseCount = config.actionCourseRoles.filter(roleId =>
      member.roles.cache.has(roleId)
    ).length

    // Advertências ativas
    const warningCount = await Warning.count({ where: { userId: targetUserId } })

    // Redução de dias da loja
    let dayReduction = 0
    for (const [roleId, days] of Object.entries(config.promotionDayReductions)) {
      if (member.roles.cache.has(roleId)) dayReduction += days
    }

    // Verifica se tem curso MAA
    const hasCursoMAA = member.roles.cache.has(config.cursoMAA.roleAprovado)

    // Verifica medalhas
    const medals = []
    if (member.roles.cache.has(config.medals.medal1)) medals.push('<@&' + config.medals.medal1 + '>')
    if (member.roles.cache.has(config.medals.medal2)) medals.push('<@&' + config.medals.medal2 + '>')
    if (member.roles.cache.has(config.medals.medal3)) medals.push('<@&' + config.medals.medal3 + '>')
    if (member.roles.cache.has(config.medals.medal4)) medals.push('<@&' + config.medals.medal4 + '>')

    // Data de entrada e último up
    const joinDate = member.joinedAt
      ? member.joinedAt.toLocaleDateString('pt-BR')
      : 'Desconhecido'
    const lastPromotion = promotionRecord && promotionRecord.lastPromotionDate
      ? new Date(promotionRecord.lastPromotionDate).toLocaleDateString('pt-BR')
      : 'Sem registro'

    // Horas semanais (PatrolSession) — só conta sessões fechadas (entrada + saída de toggle)
    const totalHours = patrolData ? parseFloat(patrolData.totalHours).toFixed(1) : '0.0'

    // Identifica patente atual
    let currentRank = 'Sem patente'
    let currentRankKey = null
    for (const key of config.rankOrder) {
      const rank = config.ranks[key]
      if (member.roles.cache.has(rank.roleId)) {
        currentRank = `${rank.tag} ${rank.name}`
        currentRankKey = key
        break
      }
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📊 Informações de ${member.displayName}`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👤 Nome', value: member.displayName, inline: true },
        { name: '🎖️ Patente', value: currentRank, inline: true },
        { name: '🆔 ID', value: memberIdRecord ? memberIdRecord.discordId : (member.displayName.match(/\|\s*(\d+)/) ? member.displayName.match(/\|\s*(\d+)/)[1] : 'N/A'), inline: true },
        { name: '📅 Data de Entrada', value: joinDate, inline: true },
        { name: '📈 Último Up', value: lastPromotion, inline: true },
        { name: '⏰ Horas Semanais', value: `${totalHours}h`, inline: true },
      )

    embed.setFooter({ text: config.branding.footerText })
      .setTimestamp()

    // Adiciona foto de identificação se existir
    const files = []
    if (identification && identification.fotoUrl) {
      const fotoPath = identification.fotoUrl
      // Se é um path local (salvo pelo sistema)
      if (!fotoPath.startsWith('http') && fs.existsSync(fotoPath)) {
        const file = new AttachmentBuilder(fotoPath, { name: 'identificacao.png' })
        files.push(file)
        embed.setImage('attachment://identificacao.png')
      } else if (fotoPath.startsWith('http')) {
        // URL antiga — tenta usar como attachment
        try {
          const file = new AttachmentBuilder(fotoPath, { name: 'identificacao.png' })
          files.push(file)
          embed.setImage('attachment://identificacao.png')
        } catch {
          embed.setImage(fotoPath)
        }
      }
      embed.addFields({
        name: '📸 Identificação',
        value: `Válida até: ${new Date(identification.dataExpiracao).toLocaleDateString('pt-BR')}`,
        inline: true,
      })
    }

    await interaction.editReply({ embeds: [embed], files })
  } catch (error) {
    console.error('Erro ao mostrar informações:', error)
    await interaction.editReply({ content: `❌ Erro ao buscar informações.\n\`\`\`${error.message}\`\`\`` })
  }
}

async function handleCadastrarPonto(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const member = interaction.member
    const { MemberID } = require('../database')

    // Verifica se já está cadastrado (memberId = Discord user ID, que é a PK)
    const existing = await MemberID.findOne({
      where: { memberId: member.id },
    })

    if (existing) {
      return await interaction.editReply({
        content: `✅ Você já está cadastrado!\n🆔 ID: **${existing.discordId}**\n👤 Nome: **${existing.memberName}**`,
      })
    }

    // Extrai ID do nickname (formato: [TAG] NOME | ID)
    const nickname = member.displayName
    const idMatch = nickname.match(/\|\s*(\d+)/)
    const nameMatch = nickname.match(/\]\s*(.+?)\s*\|/)

    if (!idMatch) {
      return await interaction.editReply({
        content: '⚠️ Não foi possível extrair seu ID do nickname. Certifique-se que seu nome está no formato: `[TAG] NOME | ID`',
      })
    }

    const inGameId = idMatch[1]
    const memberName = nameMatch ? nameMatch[1].trim() : nickname

    await MemberID.create({
      memberName,
      discordId: inGameId,      // in-game ID
      memberId: member.id,      // Discord user ID (PK)
    })

    await interaction.editReply({
      content: `✅ Cadastro realizado com sucesso!\n🆔 ID: **${inGameId}**\n👤 Nome: **${memberName}**`,
    })
  } catch (error) {
    console.error('Erro ao cadastrar ponto:', error)
    await interaction.editReply({
      content: '❌ Erro ao cadastrar. Tente novamente.',
    })
  }
}

// Exporta showUserInfo para ser usada pelo comando /informacoes
module.exports.showUserInfo = showUserInfo
