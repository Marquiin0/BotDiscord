const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js')
const config = require('../config')
const {
  ActionReports,
  PrisonReports,
  PromotionRecords,
  PatrolHours,
  PromotionRequests,
  Ausencia,
  ApreensaoReports,
  Loja,
} = require('../database.js')

const { Warning } = require('../database')
const { Op } = require('sequelize')
const moment = require('moment-timezone')
const { MessageFlags } = require('discord.js')

// Use config for promotion mapping
const promotionRoles = config.promotionMap

// Cargos adicionais
const CARGO_PRACA = '1342732701068820561' // Cargo para todos os praças
const CARGO_OFICIAL = '1342726154557198386' // Cargo para todos os oficiais
const CARGO_ALTO = '1342726677679177780' // Cargo para todos os oficiais

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    // --------------------------------------------------
    // Botão: Solicitar Promoção
    // --------------------------------------------------
    if (
      interaction.isButton() &&
      interaction.customId === 'solicitar_promocao'
    ) {
      const userId = interaction.user.id
      // Verifica se o usuário já tem uma solicitação pendente.
      const existingRequest = await PromotionRequests.findOne({
        where: { userId },
      })
      if (existingRequest) {
        return interaction.reply({
          content:
            '⚠️ Você já tem uma solicitação de promoção pendente. Aguarde a análise antes de solicitar novamente.',
          flags: MessageFlags.Ephemeral,
        })
      }
      const modal = new ModalBuilder()
        .setCustomId('modal_solicitar_promocao')
        .setTitle('Solicitação de Promoção')
      const detailsInput = new TextInputBuilder()
        .setCustomId('promocao_detalhes')
        .setLabel('Detalhes da Promoção (opcional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
      modal.addComponents(new ActionRowBuilder().addComponents(detailsInput))
      return interaction.showModal(modal)
    }

    // --------------------------------------------------
    // Modal Submit: Solicitação de Promoção
    // --------------------------------------------------
    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'modal_solicitar_promocao'
    ) {
      // Como o processamento pode demorar, deferimos a resposta
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const userId = interaction.user.id
      const details =
        interaction.fields.getTextInputValue('promocao_detalhes') ||
        'Sem detalhes'
      const reportChannelId = config.channels.pedidos

      let lastPromotion = await PromotionRecords.findOne({ where: { userId } })
      let lastPromotionDate = lastPromotion
        ? moment(lastPromotion.lastPromotionDate)
            .tz('America/Sao_Paulo')
            .format('DD/MM/YYYY')
        : 'Nunca'

      const patrolData = await PatrolHours.findOne({
        where: { memberId: userId },
      })
      const patrolHours = patrolData ? patrolData.hours : 0

      const totalActions = await ActionReports.count({
        where: {
          [Op.or]: [
            { commanderId: userId },
            { participants: { [Op.like]: `%${userId}%` } },
          ],
        },
      })

      const totalPrisons = await PrisonReports.count({
        where: {
          [Op.or]: [
            { commanderId: userId },
            { participants: { [Op.like]: `%${userId}%` } },
          ],
        },
      })

      const totalApreensoes = await ApreensaoReports.count({
        where: {
          [Op.or]: [
            { commanderId: userId },
            { participants: { [Op.like]: `%${userId}%` } },
          ],
        },
      })

      // Cálculo dos cursos
      const basicCourseRoles = [config.roles.maaAprovado]
      const externalCourseRoles = [] // A definir
      const actionCourseRoles = [] // A definir
      const basicCount = basicCourseRoles.filter(roleId =>
        interaction.member.roles.cache.has(roleId),
      ).length
      const externalCount = externalCourseRoles.filter(roleId =>
        interaction.member.roles.cache.has(roleId),
      ).length
      const actionCount = actionCourseRoles.filter(roleId =>
        interaction.member.roles.cache.has(roleId),
      ).length

      // Buscar Advertências Ativas do Usuário
      const warnings = await Warning.findAll({ where: { userId } })
      let warningList =
        warnings.length > 0
          ? warnings
              .map(
                w =>
                  `⚠️ <@&${w.roleId}>\n📌 Motivo: ${
                    w.reason
                  }\n📅 Expira em: <t:${Math.floor(
                    new Date(w.timestamp).getTime() / 1000,
                  )}:D>\n`,
              )
              .join('\n')
          : '✅ Nenhuma advertência'
      // Buscar Ausência Ativa do Usuário
      const absence = await Ausencia.findOne({
        where: { userId, status: 'Ativa' },
      })
      let absenceInfo = absence
        ? `📅 Início: <t:${Math.floor(
            new Date(absence.startDate).getTime() / 1000,
          )}:D>\n📅 Fim: <t:${Math.floor(
            new Date(absence.endDate).getTime() / 1000,
          )}:D>\n📌 Motivo: ${absence.motivo}`
        : '✅ Nenhuma ausência'

      // Criação do embed de solicitação de promoção
      const embed = new EmbedBuilder()
        .setColor(config.branding.color)
        .setTitle('📊 Relatório de Solicitação de Promoção')
        .setDescription(`📌 **Solicitante:** <@${userId}>`)
        .addFields(
          {
            name: '📢 Total de Ações',
            value: `${totalActions}`,
            inline: false,
          },
          {
            name: '🚔 Total de Prisões',
            value: `${totalPrisons}`,
            inline: false,
          },
          {
            name: '📦 Total de Apreensões',
            value: `${totalApreensoes}`,
            inline: false,
          },
          {
            name: '🕒 Horas de Patrulha',
            value: `${patrolHours.toFixed(1)}h`,
            inline: false,
          },
          {
            name: '📖 Total de Cursos',
            value: `\`${basicCount}/1\` curso maa, \`${externalCount}/5\` cursos externos e \`${actionCount}/17\` cursos de ação.`,
            inline: false,
          },
          {
            name: '📅 Última Promoção',
            value: `${lastPromotionDate}`,
            inline: false,
          },
          { name: '❗ Advertências Ativas', value: warningList, inline: false },
          { name: '⏳ Ausência Ativa', value: absenceInfo, inline: false },
          {
            name: '📋 Detalhes da Promoção',
            value: `\`\`\`${details}\`\`\``,
            inline: false,
          },
        )
        .setFooter({ text: 'Solicitação enviada para análise.' })

      // INÍCIO: Trecho adicionado para verificar cargos adicionais
      const additionalRoles = [
        '1349647432274804787',
        '1349646235015053374',
        '1333590154740367500',
        '1349647859720392715',
      ]
      let additionalRolesMentions = []
      additionalRoles.forEach(roleId => {
        if (interaction.member.roles.cache.has(roleId)) {
          additionalRolesMentions.push(`<@&${roleId}>`)
        }
      })
      if (additionalRolesMentions.length > 0) {
        embed.addFields({
          name: 'Adicionais de Promoção',
          value: additionalRolesMentions.join(', '),
          inline: false,
        })
      }

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aprovar_promocao_${userId}`)
          .setLabel('✅ Aprovar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`recusar_promocao_${userId}`)
          .setLabel('❌ Recusar')
          .setStyle(ButtonStyle.Danger),
      )

      const reportChannel =
        interaction.guild.channels.cache.get(reportChannelId)
      if (!reportChannel) {
        return interaction.editReply({
          content: '⚠️ Erro: Canal de análise de promoções não encontrado.',
        })
      }

      const message = await reportChannel.send({
        embeds: [embed],
        components: [buttons],
      })
      await PromotionRequests.create({ userId, messageId: message.id })
      return interaction.editReply({
        content:
          '✅ Solicitação enviada com sucesso! Aguarde a análise dos superiores.',
      })
    }

    // --------------------------------------------------
    // Botões: Aprovar ou Recusar Promoção
    // --------------------------------------------------
    if (
      interaction.isButton() &&
      (interaction.customId.startsWith('aprovar_promocao_') ||
        interaction.customId.startsWith('recusar_promocao_'))
    ) {
      const userId = interaction.customId.split('_')[2]
      const member = interaction.guild.members.cache.get(userId)
      if (!member) {
        return interaction.reply({
          content: '⚠️ Usuário não encontrado no servidor.',
          flags: MessageFlags.Ephemeral,
        })
      }

      // -----------------------------
      // Aprovar Promoção
      // -----------------------------
      if (interaction.customId.startsWith('aprovar_promocao_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        // Find current rank and next rank using config
        let oldRoleId = null
        let newRoleId = null
        let newTag = null

        for (const rankKey of config.rankOrder) {
          const rank = config.ranks[rankKey]
          if (member.roles.cache.has(rank.roleId)) {
            oldRoleId = rank.roleId
            // Find next rank
            const currentIndex = config.rankOrder.indexOf(rankKey)
            if (currentIndex > 0) {
              const nextRankKey = config.rankOrder[currentIndex - 1]
              const nextRank = config.ranks[nextRankKey]
              newRoleId = nextRank.roleId
              newTag = nextRank.tag
            }
            break
          }
        }

        if (!oldRoleId || !newRoleId || !newTag) {
          return interaction.editReply({
            content: '⚠️ O usuário não possui um cargo válido para promoção.',
          })
        }
        await member.roles.remove(oldRoleId).catch(console.error)
        await member.roles.add(newRoleId).catch(console.error)

        const currentNickname = member.displayName
        const updatedNickname = currentNickname.replace(/\[.*?\]/, newTag)
        await member.setNickname(updatedNickname).catch(console.error)

        await PromotionRecords.upsert({
          userId: userId,
          userName: updatedNickname,
          lastPromotionDate: new Date(),
        })

        await PrisonReports.update(
          { commanderId: 'NULL' },
          { where: { commanderId: member.id } },
        )
        await ActionReports.update(
          { commanderId: 'NULL' },
          { where: { commanderId: member.id } },
        )
        await ApreensaoReports.update(
          { commanderId: 'NULL' },
          { where: { commanderId: member.id } },
        )

        const updateParticipants = async (Model, columnName) => {
          const records = await Model.findAll({
            where: { [columnName]: { [Op.like]: `%${member.id}%` } },
          })
          for (const record of records) {
            const participantsArray = record[columnName]
              .split(',')
              .map(id => id.trim())
            const updatedParticipants = participantsArray.filter(
              id => id !== member.id,
            )
            if (updatedParticipants.length > 0) {
              await record.update({
                [columnName]: updatedParticipants.join(', '),
              })
            } else {
              await record.update({ [columnName]: '' })
            }
          }
        }
        // Atualiza os participantes nas ações, prisões e apreensões
        await updateParticipants(PrisonReports, 'participants')
        await updateParticipants(ActionReports, 'participants')
        await updateParticipants(ApreensaoReports, 'participants')

        // --- NOVO BLOCO: Remoção no banco de dados "loja" ---
        // Remove todos os registros para o usuário cujo item seja "5 Relatórios em seu nome 2x por patente"
        await Loja.destroy({
          where: { userId, item: '5 Relatórios em seu nome 2x por patente' },
        })

        // --- NOVO BLOCO: Remoção das tags adicionais ---
        // Define as tags adicionais que devem ser removidas, se existirem
        const tagsToRemove = [
          '1349647432274804787',
          '1349646235015053374',
          '1333590154740367500',
          '1349647859720392715',
        ]
        // Para cada tag, se o membro a possuir, remove-a
        for (const tag of tagsToRemove) {
          if (member.roles.cache.has(tag)) {
            await member.roles.remove(tag).catch(console.error)
          }
        }

        const today = new Date()
        const formattedDate = today.toLocaleDateString('pt-BR')
        const embed = new EmbedBuilder()
          .setColor('#FFFFFF')
          .setTitle(`🏅 ${config.branding.name} - Ordem de Mérito Policial`)
          .setDescription(
            `Em reconhecimento aos serviços de natureza extraordinária prestados à segurança pública e ao cumprimento irrepreensível do dever, é com elevado senso de honra que conferimos a presente condecoração:\n\n`,
          )
          .addFields(
            { name: '👤 Ao:', value: `<@${userId}>`, inline: true },
            { name: '📌 De:', value: `<@&${oldRoleId}>`, inline: true },
            { name: '📌 Para:', value: `<@&${newRoleId}>`, inline: true },
          )
          .setFooter({
            text: `Dado sob autoridade de ALTO COMANDO ${config.branding.name}, neste ${formattedDate}.`,
          })

        const notificationChannel = interaction.guild.channels.cache.get(
          config.channels.promocaoLog,
        )
        if (notificationChannel) {
          await notificationChannel.send({
            content: `<@${userId}>`, // menção fora do embed
            embeds: [embed],
          })
        }
        const membernick = await interaction.guild.members.fetch(
          interaction.user.id,
        )
        const origMessage = interaction.message
        const updatedEmbed = EmbedBuilder.from(origMessage.embeds[0])
          .setColor('#00FF00')
          .setFooter({ text: `✅ Aprovado por ${membernick.displayName}` })
        const updatedButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('aprovado')
            .setLabel('✅ Aprovado')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        )
        await origMessage.edit({
          embeds: [updatedEmbed],
          components: [updatedButtons],
        })
        await PromotionRequests.destroy({ where: { userId } })
        return interaction.editReply({
          content: `✅ <@${userId}> foi promovido com sucesso para **${newTag}**!`,
        })
      }

      // -----------------------------
      // Recusar Promoção
      // -----------------------------
      if (interaction.customId.startsWith('recusar_promocao_')) {
        // NÃO devemos deferir a resposta aqui: use showModal imediatamente
        const modal = new ModalBuilder()
          .setCustomId(`modal_recusar_promocao_${userId}`)
          .setTitle('Motivo da Recusa')
        const reasonInput = new TextInputBuilder()
          .setCustomId('motivo_recusa')
          .setLabel('Informe o motivo da recusa:')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
        const modalRow = new ActionRowBuilder().addComponents(reasonInput)
        modal.addComponents(modalRow)
        try {
          return await interaction.showModal(modal)
        } catch (err) {
          console.error('Erro ao mostrar o modal de recusa:', err)
          return
        }
      }
    }
    const membernick = await interaction.guild.members.fetch(
      interaction.user.id,
    )

    // --------------------------------------------------
    // Modal Submit: Recusar Promoção
    // --------------------------------------------------
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('modal_recusar_promocao_')
    ) {
      // Como o processamento pode demorar, deferimos a resposta
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const userId = interaction.customId.replace('modal_recusar_promocao_', '')
      const reason = interaction.fields.getTextInputValue('motivo_recusa')
      const dmEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Solicitação de Promoção Recusada')
        .setDescription(`Motivo da recusa:\n\`\`\`${reason}\`\`\``)
        .setFooter({ text: config.branding.footerText })
        .setTimestamp()
      try {
        const targetUser = await interaction.client.users.fetch(userId)
        await targetUser.send({ embeds: [dmEmbed] })
      } catch (error) {
        console.error(`Erro ao enviar DM para ${userId}:`, error)
      }
      const reportChannelId = config.channels.pedidos
      const reportChannel =
        interaction.guild.channels.cache.get(reportChannelId)
      if (reportChannel) {
        try {
          const requestRecord = await PromotionRequests.findOne({
            where: { userId },
          })
          if (requestRecord) {
            const originalMessage = await reportChannel.messages.fetch(
              requestRecord.messageId,
            )
            const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
              .setColor('#FF0000')
              .setFooter({ text: `❌ Recusado por ${membernick.displayName}` })
            const updatedButtons = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('recusado')
                .setLabel('❌ Recusado')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true),
            )
            await originalMessage.edit({
              embeds: [updatedEmbed],
              components: [updatedButtons],
            })
            await PromotionRequests.destroy({ where: { userId } })
          }
        } catch (err) {
          console.error('Erro ao atualizar o embed original:', err)
        }
      }
      return interaction.editReply({
        content:
          'Solicitação de promoção recusada, DM enviada ao usuário e embed atualizada.',
      })
    }
  },
}
