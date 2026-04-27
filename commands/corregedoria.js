const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js')
const fs = require('fs')
const { Warning, Identificacao, PromotionRecords, ActionReports, PrisonReports, ApreensaoReports, PatrolHours, QuizResult, MemberID } = require('../database')
const { Op } = require('sequelize')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('corregedoria')
    .setDescription('Gerencia as ações disciplinares de um usuário.')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('O usuário que você deseja gerenciar.')
        .setRequired(true),
    ),

  async execute(interaction) {
    // Verifica se tem um dos cargos de corregedoria
    const hasPermission =
      interaction.member.permissions.has('Administrator') ||
      interaction.member.roles.cache.hasAny(...config.permissions.corregedoria)

    if (!hasPermission) {
      return interaction.reply({
        content: '❌ Apenas Corregedor, Sub Commander e Commander podem usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const user = interaction.options.getUser('usuario')
    const member = interaction.guild.members.cache.get(user.id)
    if (!member) {
      return interaction.reply({
        content: '⚠️ Usuário não encontrado no servidor.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    // Buscar dados do usuário
    const [warnings, promotionRecord, patrolData, identification, memberIdRecord] = await Promise.all([
      Warning.findAll({ where: { userId: user.id } }),
      PromotionRecords.findOne({ where: { userId: user.id } }),
      PatrolHours.findOne({ where: { userId: user.id } }),
      Identificacao.findOne({ where: { userId: user.id, status: 'ativo' }, order: [['dataRegistro', 'DESC']] }),
      MemberID.findOne({ where: { discordId: user.id } }),
    ])

    const totalActions = await ActionReports.count({ where: { [Op.or]: [{ commanderId: user.id }, { participants: { [Op.like]: `%${user.id}%` } }] } })
    const totalPrisons = await PrisonReports.count({ where: { [Op.or]: [{ commanderId: user.id }, { participants: { [Op.like]: `%${user.id}%` } }] } })
    const totalApreensoes = await ApreensaoReports.count({ where: { [Op.or]: [{ commanderId: user.id }, { participants: { [Op.like]: `%${user.id}%` } }] } })

    const hasCursoMAA = member.roles.cache.has(config.cursoMAA.roleAprovado)
    const totalHours = patrolData ? patrolData.hours.toFixed(1) : '0.0'
    const lastPromotion = promotionRecord && promotionRecord.lastPromotionDate
      ? new Date(promotionRecord.lastPromotionDate).toLocaleDateString('pt-BR')
      : 'Sem registro'

    // Patente atual
    let currentRank = 'Sem patente'
    for (const key of config.rankOrder) {
      const rank = config.ranks[key]
      if (member.roles.cache.has(rank.roleId)) {
        currentRank = `${rank.tag} ${rank.name}`
        break
      }
    }

    const warningsText = warnings.length > 0
      ? warnings.map(w => `🔹 <@&${w.roleId}> - **Motivo:** ${w.reason}`).join('\n')
      : '✅ Nenhuma advertência ativa'

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle('🔧 Corregedoria - Gerenciamento')
      .setDescription(`Selecione uma ação para **${member.displayName}**`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👤 Usuário', value: `<@${member.id}>`, inline: true },
        { name: '🎖️ Patente', value: currentRank, inline: true },
        { name: '🆔 ID', value: memberIdRecord ? memberIdRecord.memberId : 'N/A', inline: true },
        { name: '⏰ Horas', value: `${totalHours}h`, inline: true },
        { name: '📈 Último Up', value: lastPromotion, inline: true },
        { name: '📚 MAA', value: hasCursoMAA ? '✅' : '❌', inline: true },
        { name: '📋 Relatórios', value: `Ações: ${totalActions} | Prisões: ${totalPrisons} | Apreensões: ${totalApreensoes}`, inline: false },
        { name: '⚠️ Advertências', value: warningsText, inline: false },
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const files = []
    if (identification && identification.fotoUrl) {
      const fotoPath = identification.fotoUrl
      if (!fotoPath.startsWith('http') && fs.existsSync(fotoPath)) {
        const file = new AttachmentBuilder(fotoPath, { name: 'identificacao.png' })
        files.push(file)
        embed.setImage('attachment://identificacao.png')
      } else if (fotoPath.startsWith('http')) {
        try {
          const file = new AttachmentBuilder(fotoPath, { name: 'identificacao.png' })
          files.push(file)
          embed.setImage('attachment://identificacao.png')
        } catch {
          embed.setImage(fotoPath)
        }
      }
    }

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`corr_exonerar_${member.id}`)
        .setLabel('❌ Exonerar')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`corr_promover_${member.id}`)
        .setLabel('⬆️ Promover')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`corr_rebaixar_${member.id}`)
        .setLabel('⬇️ Rebaixar')
        .setStyle(ButtonStyle.Primary),
    )

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`corr_advv_${member.id}`)
        .setLabel('⚠️ ADV Verbal')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`corr_adv1_${member.id}`)
        .setLabel('⚠️ ADV 1')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`corr_adv2_${member.id}`)
        .setLabel('⚠️ ADV 2')
        .setStyle(ButtonStyle.Secondary),
    )

    await interaction.editReply({
      embeds: [embed],
      components: [row1, row2],
      files,
    })
  },
}
