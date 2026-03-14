const {
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js')
const {
  PatrolHours,
  UserPoints,
  Ausencia,
  ActionReports,
  PrisonReports,
  ApreensaoReports,
  MemberID,
  Identificacao,
  PromotionRecords,
} = require('../database')
const { Op } = require('sequelize')
const moment = require('moment')
const { Warning } = require('../database')
const config = require('../config')

// Mapa para rastrear cooldowns dos usuários (tempo de espera de 1 minuto)
const cooldowns = new Map()

// ─────────────────────────────────────────────
// Handler de Sair de Serviço
// ─────────────────────────────────────────────
async function handleSairServicoInteraction(interaction) {
  const serviceGuildId = config.guilds.logs
  const logGuildId = config.guilds.main
  const targetChannelId = config.logsChannels.ponto
  const logChannelId = config.channels.exoneracaoLog
  const cooldownTime = 60000

  try {
    if (cooldowns.has(interaction.user.id)) {
      const remainingTime =
        (cooldowns.get(interaction.user.id) - Date.now()) / 1000
      if (remainingTime > 0) {
        return await interaction.reply({
          content: `⏳ Você já registrou uma saída. Em **${remainingTime.toFixed(
            1,
          )} segundos** você poderá solicitar uma saída novamente.`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }

    cooldowns.set(interaction.user.id, Date.now() + cooldownTime)
    setTimeout(() => cooldowns.delete(interaction.user.id), cooldownTime)

    const memberRecord = await MemberID.findOne({
      where: { memberId: interaction.user.id },
    })

    if (!memberRecord) {
      return await interaction.reply({
        content: '⚠️ Você não possui um registro na tabela de permissões.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const discordId = memberRecord.discordId

    const patrolRecord = await PatrolHours.findOne({
      where: { memberId: interaction.user.id },
    })

    if (!patrolRecord || !patrolRecord.lastEntry) {
      return await interaction.reply({
        content: '⚠️ Você não possui um registro válido de entrada em serviço.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const lastEntryTime = moment(patrolRecord.lastEntry).tz('America/Sao_Paulo')
    const currentTime = moment().tz('America/Sao_Paulo')
    const hoursSinceEntry = currentTime.diff(lastEntryTime, 'hours', true)

    if (hoursSinceEntry > 1) {
      return await interaction.reply({
        content: `❌ Você não pode sair de serviço após **${hoursSinceEntry.toFixed(
          2,
        )} horas** desde a última entrada. O limite máximo é 1 hora. **Grande amigo(a), lembre de sair ingame**`,
        flags: MessageFlags.Ephemeral,
      })
    }

    const serviceGuild = interaction.client.guilds.cache.get(serviceGuildId)
    const serviceChannel = serviceGuild?.channels.cache.get(targetChannelId)
    const logGuild = interaction.client.guilds.cache.get(logGuildId)
    const logChannel = logGuild?.channels.cache.get(logChannelId)

    if (!serviceGuild || !serviceChannel || !logGuild || !logChannel) {
      return await interaction.reply({
        content: '❌ Erro ao encontrar canais de registro.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const now = moment().tz('America/Sao_Paulo')
    const formattedDate = now.format('DD/MM/YYYY')
    const formattedTime = now.format('HH:mm:ss')

    const serviceMessage = `\`\`\`prolog
[${config.branding.shortName}.permissao]: ${discordId} BOT
[===========SAIU DE SERVICO==========]
[Data]: ${formattedDate} [Hora]: ${formattedTime}
\`\`\``

    await serviceChannel.send(serviceMessage)
    await logChannel.send({
      content: `✅ **Registro de saída efetuado**
📌 **Usuário:** <@${interaction.user.id}>
🆔 **Discord ID:** ${interaction.user.id}
📅 **Data:** ${formattedDate}
⏰ **Horário:** ${formattedTime}
📂 **Registro enviado para o canal:** <#${targetChannelId}>`,
    })

    await interaction.reply({
      content: `✅ Seu registro foi enviado para o canal de logs: <#${logChannelId}>.`,
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error('❌ Erro ao executar "Sair de Serviço":', error)
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao tentar registrar sua saída de serviço.',
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}

// ─────────────────────────────────────────────
// Handler de Check Hours (Verificar Informações)
// ─────────────────────────────────────────────
async function handleCheckHoursInteraction(interaction) {
  try {
    const discordId = interaction.user.id
    const patrolData = await PatrolHours.findOne({
      where: { memberId: discordId },
    })

    if (!patrolData) {
      return interaction.reply({
        content:
          '❌ Nenhum registro de horas de patrulha encontrado para este usuário.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const updatedAt = patrolData.updatedAt.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    })

    const totalActions =
      (await ActionReports.count({
        where: {
          [Op.or]: [
            { commanderId: discordId },
            { participants: { [Op.like]: `%${discordId}%` } },
          ],
        },
        distinct: true,
        col: 'id',
      })) || 0

    const totalPrisons =
      (await PrisonReports.count({
        where: {
          [Op.or]: [
            { commanderId: discordId },
            { participants: { [Op.like]: `%${discordId}%` } },
          ],
        },
        distinct: true,
        col: 'id',
      })) || 0

    const totalApreensoes =
      (await ApreensaoReports.count({
        where: {
          [Op.or]: [
            { commanderId: discordId },
            { participants: { [Op.like]: `%${discordId}%` } },
          ],
        },
        distinct: true,
        col: 'id',
      })) || 0

    const warnings = await Warning.findAll({ where: { userId: discordId } })
    const warningList =
      warnings.length > 0
        ? warnings
            .map(
              w =>
                `⚠️ <@&${w.roleId}>\n📌 Motivo: ${
                  w.reason
                }\n📅 Expira em: <t:${Math.floor(
                  new Date(w.timestamp).getTime() / 1000,
                )}:D>`,
            )
            .join('\n')
        : '✅ Nenhuma advertência'

    const absence = await Ausencia.findOne({
      where: { userId: discordId, status: 'Ativa' },
    })
    const absenceInfo = absence
      ? `📅 Início: <t:${Math.floor(
          new Date(absence.startDate).getTime() / 1000,
        )}:D>\n` +
        `📅 Fim: <t:${Math.floor(
          new Date(absence.endDate).getTime() / 1000,
        )}:D>\n` +
        `📌 Motivo: ${absence.motivo}`
      : '✅ Nenhuma ausência'

    const identRecente = await Identificacao.findOne({
      where: { userId: discordId },
      order: [['dataRegistro', 'DESC']],
    })
    let identificationField = '👮 Ainda não se identificou'
    let identificationImage = null
    const agora = moment().tz('America/Sao_Paulo').toDate()

    if (identRecente) {
      const expiraUnix = Math.floor(identRecente.dataExpiracao.getTime() / 1000)
      if (identRecente.dataExpiracao > agora) {
        identificationField = `📅 Expira em <t:${expiraUnix}:R>`
      } else {
        identificationField = `**🛑 Expirada** em <t:${expiraUnix}:R>`
      }
      identificationImage = identRecente.fotoUrl
    }

    let lastPromotion = await PromotionRecords.findOne({
      where: { userId: discordId },
    })
    let lastPromotionDate = lastPromotion
      ? moment(lastPromotion.lastPromotionDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY')
      : 'Nunca'

    const hoursEmbed = new EmbedBuilder()
      .setTitle('📊 Estatísticas de Patrulha, Ações, Prisões e Apreensões')
      .setDescription(
        `👤 **Usuário**: ${interaction.member.displayName}\n\n` +
        `⏰ **Horas de Patrulha**: \`${patrolData.hours}\`\n\n`,
      )
      .addFields(
        { name: '📌 Total de Ações', value: `\`\`\`${totalActions}\`\`\``, inline: false },
        { name: '🚔 Total de Prisões', value: `\`\`\`${totalPrisons}\`\`\``, inline: false },
        { name: '📦 Total de Apreensões', value: `\`\`\`${totalApreensoes}\`\`\``, inline: false },
        { name: '📅 Última Promoção', value: `${lastPromotionDate}`, inline: false },
        { name: '❗ Advertências Ativas', value: warningList, inline: false },
        { name: '⏳ Ausência Ativa', value: absenceInfo, inline: false },
        { name: '🪪 Identificação', value: identificationField, inline: false },
      )
      .setColor(config.branding.color)
      .setFooter({ text: `Última atualização: ${updatedAt}` })

    let files = []
    if (identificationImage) {
      const file = new AttachmentBuilder(identificationImage, {
        name: 'identificacao.png',
      })
      files.push(file)
      hoursEmbed.setImage('attachment://identificacao.png')
    }

    await interaction.reply({
      content: '📊 Suas informações foram atualizadas!',
      embeds: [hoursEmbed],
      files,
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error('Erro ao buscar horas de patrulha:', error)
    await interaction.reply({
      content: '⚠️ Houve um erro ao buscar as horas de patrulha.',
      flags: MessageFlags.Ephemeral,
    })
  }
}

module.exports = {
  handleCheckHoursInteraction,
  handleSairServicoInteraction,
}
