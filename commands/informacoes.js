const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
  AttachmentBuilder,
} = require('discord.js')
const {
  ActionReports,
  PrisonReports,
  PromotionRecords,
  PatrolHours,
  Ausencia,
  ApreensaoReports,
  Warning,
  Identificacao,
  QuizResult,
  MemberID,
} = require('../database.js')
const { Op } = require('sequelize')
const moment = require('moment-timezone')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('informacoes')
    .setDescription('Exibe as informações do oficial/policial selecionado.')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Selecione o usuário sobre o qual deseja informações')
        .setRequired(true),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('usuario')
    const userId = targetUser.id
    const targetMember = await interaction.guild.members.fetch(userId).catch(() => null)

    if (!targetMember) {
      return interaction.reply({
        content: '❌ Usuário não encontrado no servidor.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    // 1) Horas de patrulha
    const patrolData = await PatrolHours.findOne({ where: { userId } })
    const patrolHours = patrolData ? patrolData.hours : 0

    // 2) Contagem de Ações
    const totalActions = await ActionReports.count({
      where: {
        [Op.or]: [
          { commanderId: userId },
          { participants: { [Op.like]: `%${userId}%` } },
        ],
      },
    })

    // 3) Contagem de Prisões
    const totalPrisons = await PrisonReports.count({
      where: {
        [Op.or]: [
          { commanderId: userId },
          { participants: { [Op.like]: `%${userId}%` } },
        ],
      },
    })

    // 4) Contagem de Apreensões
    const totalApreensoes = await ApreensaoReports.count({
      where: {
        [Op.or]: [
          { commanderId: userId },
          { participants: { [Op.like]: `%${userId}%` } },
        ],
      },
    })

    // 5) Última Promoção
    const lastPromotion = await PromotionRecords.findOne({ where: { userId } })
    const lastPromotionDate = lastPromotion
      ? moment(lastPromotion.lastPromotionDate).tz('America/Sao_Paulo').format('DD/MM/YYYY')
      : 'Nunca'

    // 6) Advertências Ativas
    const warnings = await Warning.findAll({ where: { userId } })
    const warningList =
      warnings.length > 0
        ? warnings
            .map(
              w =>
                `⚠️ <@&${w.roleId}>\n📌 Motivo: ${w.reason}\n📅 Expira em: <t:${Math.floor(
                  new Date(w.timestamp).getTime() / 1000,
                )}:D>`,
            )
            .join('\n\n')
        : '✅ Nenhuma advertência'

    // 7) Ausência Ativa
    const absence = await Ausencia.findOne({ where: { userId, status: 'Ativa' } })
    let absenceInfo = '✅ Nenhuma ausência'
    if (absence) {
      const startDateTimestamp = Math.floor(new Date(absence.startDate).getTime() / 1000)
      const endDateTimestamp = Math.floor(new Date(absence.endDate).getTime() / 1000)
      absenceInfo = `📅 Início: <t:${startDateTimestamp}:D>\n📅 Fim: <t:${endDateTimestamp}:D>\n📌 Motivo: ${absence.motivo}`
    }

    // 8) Curso MAA
    const hasCursoMAA = targetMember.roles.cache.has(config.cursoMAA.roleAprovado)

    // 9) Medalhas
    const medals = []
    if (targetMember.roles.cache.has(config.medals.medal1)) medals.push(`<@&${config.medals.medal1}>`)
    if (targetMember.roles.cache.has(config.medals.medal2)) medals.push(`<@&${config.medals.medal2}>`)
    if (targetMember.roles.cache.has(config.medals.medal3)) medals.push(`<@&${config.medals.medal3}>`)
    if (targetMember.roles.cache.has(config.medals.medal4)) medals.push(`<@&${config.medals.medal4}>`)

    // 10) Patente atual
    let currentRank = 'Sem patente'
    for (const key of config.rankOrder) {
      const rank = config.ranks[key]
      if (targetMember.roles.cache.has(rank.roleId)) {
        currentRank = `${rank.tag} ${rank.name}`
        break
      }
    }

    // 11) ID do membro (memberId = Discord snowflake, discordId = ID no jogo)
    const memberIdRecord = await MemberID.findOne({ where: { memberId: userId } })

    // 12) Data de entrada
    const joinDate = targetMember.joinedAt
      ? targetMember.joinedAt.toLocaleDateString('pt-BR')
      : 'Desconhecido'

    // Monta o Embed
    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📊 Informações de ${targetUser.username}`)
      .setDescription(`📌 **Oficial:** <@${targetUser.id}>`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🎖️ Patente', value: currentRank, inline: true },
        { name: '🆔 ID', value: memberIdRecord ? memberIdRecord.discordId : 'N/A', inline: true },
        { name: '📅 Entrada', value: joinDate, inline: true },
        { name: '📈 Último Up', value: lastPromotionDate, inline: true },
        { name: '⏰ Horas Totais', value: `${patrolHours.toFixed(1)}h`, inline: true },
        { name: '📚 Curso MAA', value: hasCursoMAA ? '✅ Aprovado' : '❌ Não possui', inline: true },
        { name: '📢 Ações', value: `${totalActions}`, inline: true },
        { name: '🚔 Prisões', value: `${totalPrisons}`, inline: true },
        { name: '📦 Apreensões', value: `${totalApreensoes}`, inline: true },
        { name: '❗ Advertências', value: warningList, inline: false },
        { name: '⏳ Ausência', value: absenceInfo, inline: false },
        {
          name: '🏅 Medalhas',
          value: medals.length > 0 ? medals.join(', ') : 'Nenhuma',
          inline: false,
        },
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    // Identificação
    const identRecente = await Identificacao.findOne({
      where: { userId },
      order: [['dataRegistro', 'DESC']],
    })

    let files = []
    if (!identRecente) {
      embed.addFields({
        name: '🪪 Identificação',
        value: 'Nunca se identificou',
        inline: false,
      })
    } else {
      let expiraUnix = null
      if (
        identRecente.dataExpiracao &&
        !isNaN(new Date(identRecente.dataExpiracao).getTime())
      ) {
        expiraUnix = Math.floor(new Date(identRecente.dataExpiracao).getTime() / 1000)
      }

      try {
        const file = new AttachmentBuilder(identRecente.fotoUrl, {
          name: 'identificacao.png',
        })
        files.push(file)
        embed.setImage('attachment://identificacao.png')
      } catch (e) {
        // URL inválida, ignora imagem
      }

      if (!expiraUnix) {
        embed.addFields({
          name: '🪪 Identificação',
          value: '**🛑 Expirada** (data não configurada)',
          inline: false,
        })
      } else {
        const dataExpiracao = new Date(identRecente.dataExpiracao)
        const agora = moment().tz('America/Sao_Paulo').toDate()
        if (dataExpiracao > agora) {
          embed.addFields({
            name: '🪪 Identificação',
            value: `📅 Expira <t:${expiraUnix}:R>`,
            inline: false,
          })
        } else {
          embed.addFields({
            name: '🪪 Identificação',
            value: `**🛑 Expirada** em <t:${expiraUnix}:R>`,
            inline: false,
          })
        }
      }
    }

    await interaction.editReply({
      embeds: [embed],
      files,
    })
  },
}
