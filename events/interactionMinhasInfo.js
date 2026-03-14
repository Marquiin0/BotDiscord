const {
  EmbedBuilder,
  MessageFlags,
} = require('discord.js')
const {
  ActionReports,
  PrisonReports,
  ApreensaoReports,
  PromotionRecords,
  PatrolHours,
  Identificacao,
  QuizResult,
  MemberID,
} = require('../database')
const config = require('../config')

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
      PatrolHours.findOne({ where: { userId: targetUserId } }),
      Identificacao.findOne({
        where: { userId: targetUserId, status: 'ativo' },
        order: [['dataRegistro', 'DESC']],
      }),
      QuizResult.findOne({
        where: { userId: targetUserId, passed: true },
        order: [['attemptDate', 'DESC']],
      }),
      MemberID.findOne({ where: { discordId: targetUserId } }),
    ])

    // Contagem de participações em ações
    const { Op } = require('sequelize')
    const actionParticipations = await ActionReports.count({
      where: {
        participants: { [Op.like]: `%${targetUserId}%` },
      },
    })

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

    // Horas totais
    const totalHours = patrolData ? patrolData.hours.toFixed(1) : '0.0'

    // Identifica patente atual
    let currentRank = 'Sem patente'
    for (const key of config.rankOrder) {
      const rank = config.ranks[key]
      if (member.roles.cache.has(rank.roleId)) {
        currentRank = `${rank.tag} ${rank.name}`
        break
      }
    }

    const totalRelatorios = actionCount + prisonCount + apreensaoCount

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📊 Informações de ${member.displayName}`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👤 Nome', value: member.displayName, inline: true },
        { name: '🎖️ Patente', value: currentRank, inline: true },
        { name: '🆔 ID', value: memberIdRecord ? memberIdRecord.memberId : 'N/A', inline: true },
        { name: '📅 Data de Entrada', value: joinDate, inline: true },
        { name: '📈 Último Up', value: lastPromotion, inline: true },
        { name: '⏰ Horas Totais', value: `${totalHours}h`, inline: true },
        {
          name: '📋 Relatórios',
          value: `Total: **${totalRelatorios}**\nAções (cmd): **${actionCount}**\nAções (part): **${actionParticipations}**\nPrisões: **${prisonCount}**\nApreensões: **${apreensaoCount}**`,
          inline: true,
        },
        {
          name: '📚 Curso MAA',
          value: hasCursoMAA ? '✅ Aprovado' : '❌ Não possui',
          inline: true,
        },
        {
          name: '🏅 Medalhas',
          value: medals.length > 0 ? medals.join('\n') : 'Nenhuma',
          inline: true,
        },
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    // Adiciona foto de identificação se existir
    if (identification && identification.fotoUrl) {
      embed.setImage(identification.fotoUrl)
      embed.addFields({
        name: '📸 Identificação',
        value: `Válida até: ${new Date(identification.dataExpiracao).toLocaleDateString('pt-BR')}`,
        inline: true,
      })
    }

    await interaction.editReply({ embeds: [embed] })
  } catch (error) {
    console.error('Erro ao mostrar informações:', error)
    await interaction.editReply({ content: '❌ Erro ao buscar informações.' })
  }
}

async function handleCadastrarPonto(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const member = interaction.member
    const { MemberID } = require('../database')

    // Verifica se já está cadastrado
    const existing = await MemberID.findOne({
      where: { discordId: member.id },
    })

    if (existing) {
      return await interaction.editReply({
        content: `✅ Você já está cadastrado!\n🆔 ID: **${existing.memberId}**\n👤 Nome: **${existing.memberName}**`,
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

    const memberId = idMatch[1]
    const memberName = nameMatch ? nameMatch[1].trim() : nickname

    await MemberID.create({
      memberName,
      discordId: member.id,
      memberId,
    })

    await interaction.editReply({
      content: `✅ Cadastro realizado com sucesso!\n🆔 ID: **${memberId}**\n👤 Nome: **${memberName}**`,
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
