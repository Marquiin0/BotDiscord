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
  Warning,
  PromotionRequests,
  PromotionRecords,
  PrisonReports,
  Ausencia,
} = require('../database')
const {
  UserPontos,
  UserActions,
  UserMultiplicadores,
  DonationRecords,
  Identificacao,
} = require('../database.js')
const { MessageFlags } = require('discord.js')

const EXONERATION_ROLE = config.roles.recruta
const TARGET_CHANNEL_ID = config.channels.pedidos
const LOG_CHANNEL_ID = config.channels.exoneracaoLog
const EXONERATION_CHANNEL = config.channels.exoneracaoLog

// Previne processamento duplicado da mesma interação
const processedInteractions = new Set()

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return

    // Verifica se já processamos esta interação
    if (processedInteractions.has(interaction.id)) return
    processedInteractions.add(interaction.id)
    // Limpa após 30 segundos para não acumular memória
    setTimeout(() => processedInteractions.delete(interaction.id), 30000)

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'solicitar_exoneracao_manual') {
        const reason =
          interaction.fields.getTextInputValue('exoneration_reason')
        const requestEmbed = new EmbedBuilder()
          .setTitle('❌ Solicitação de Exoneração')
          .setDescription(
            `O oficial <@${interaction.user.id}> solicitou exoneração.\n\n` +
              `**Motivo:**\n\`\`\`${reason}\`\`\`\n` +
              `Clique em **Exonerar** para aprovar ou em **Recusar** para cancelar.`,
          )
          .setColor('#ff0000')
          .setTimestamp()

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`exoneracao_aprovar_${interaction.user.id}`)
            .setLabel('Exonerar')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`exoneracao_recusar_${interaction.user.id}`)
            .setLabel('Recusar')
            .setStyle(ButtonStyle.Danger),
        )

        const targetChannel =
          interaction.guild.channels.cache.get(TARGET_CHANNEL_ID) ||
          await interaction.guild.channels.fetch(TARGET_CHANNEL_ID).catch(() => null)
        if (!targetChannel) {
          return interaction.reply({
            content: '⚠️ Canal de pedidos não encontrado.',
            flags: MessageFlags.Ephemeral,
          })
        }

        await targetChannel.send({
          embeds: [requestEmbed],
          components: [row],
        })

        return interaction.reply({
          content:
            '✅ Exoneração solicitada, aguarde a aprovação.',
          flags: MessageFlags.Ephemeral,
        })
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'solicitar_exoneracao') {
        const modal = new ModalBuilder()
          .setCustomId('solicitar_exoneracao_manual')
          .setTitle('Solicitar Exoneração')

        const reasonInput = new TextInputBuilder()
          .setCustomId('exoneration_reason')
          .setLabel('Informe o motivo da exoneração:')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)

        const modalActionRow = new ActionRowBuilder().addComponents(reasonInput)

        modal.addComponents(modalActionRow)

        return interaction.showModal(modal)
      }

      if (interaction.customId.startsWith('exoneracao_aprovar_')) {
        // Se os botões já estão desativados, outra instância já processou
        const firstBtn = interaction.message.components?.[0]?.components?.[0]
        if (firstBtn?.disabled) return

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const targetUserId = interaction.customId.split('_')[2]

        const member = await interaction.guild.members
          .fetch(targetUserId)
          .catch(() => null)

        if (!member) {
          return interaction.editReply({
            content: '⚠️ Usuário não encontrado.',
          })
        }

        const reason = 'Exoneração solicitada e aprovada pelo alto comando.'

        const originalMessage = interaction.message

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('exoneracao_aprovado')
            .setLabel('Exonerado')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('exoneracao_recusado')
            .setLabel('Recusado')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`copiar_${targetUserId}`)
            .setLabel('📋 Copiar Menção')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false), // Mantém ativo
        )

        const updatedEmbed = EmbedBuilder.from(
          originalMessage.embeds[0],
        ).setFooter({ text: `Aprovado por ${interaction.user.tag}` })

        await originalMessage.edit({
          embeds: [updatedEmbed],
          components: [updatedRow],
        })

        await handleExoneration(interaction, member, reason)

        return
      }

      if (interaction.customId.startsWith('exoneracao_recusar_')) {
        const targetUserId = interaction.customId.split('_')[2]
        const originalMessage = interaction.message

        // Se os botões já estão desativados, outra instância já processou
        const firstButton = originalMessage.components?.[0]?.components?.[0]
        if (firstButton?.disabled) return

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('exoneracao_aprovado')
            .setLabel('Exonerado')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('exoneracao_recusado')
            .setLabel('Recusado')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
        )

        const updatedEmbed = EmbedBuilder.from(
          originalMessage.embeds[0],
        ).setFooter({ text: `Recusado por ${interaction.user.tag}` })

        await originalMessage.edit({
          embeds: [updatedEmbed],
          components: [updatedRow],
        })

        const targetMember = await interaction.guild.members
          .fetch(targetUserId)
          .catch(() => null)

        if (targetMember) {
          try {
            await targetMember.send({
              content: `❌ Sua solicitação de exoneração foi recusada pelo alto comando no servidor **${interaction.guild.name}**.`,
            })
          } catch (error) {
            console.log(
              `Não foi possível enviar mensagem para ${targetMember.user.tag}.`,
            )
          }
        }

        return interaction.reply({
          content: 'Solicitação de exoneração recusada.',
          flags: MessageFlags.Ephemeral,
        })
      }

      // 🔸 Copiar Menção
      if (interaction.customId.startsWith('copiar_')) {
        const userId = interaction.customId.split('_')[1]
        return interaction.reply({
          content: `\`\`\`
[DISCORD]: <@${userId}>
[REMOVER CARGO]: ${config.branding.name} POLICIAL
[TAG]: ${config.branding.shortName}
\`\`\``,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

/** 🔸 Função para executar a exoneração (processamento final) */
async function handleExoneration(interaction, member, reason) {
  try {
    await Warning.destroy({ where: { userId: member.id } })
    await PromotionRequests.destroy({ where: { userId: member.id } })
    await PromotionRecords.destroy({ where: { userId: member.id } })
    await PrisonReports.destroy({ where: { commanderId: member.id } })
    await Ausencia.destroy({ where: { userId: member.id } })

    // 🔹 Removendo registros adicionais nas tabelas UserPontos, UserActions, UserMultiplicadores e DonationRecords
    await UserPontos.destroy({ where: { userId: member.id } })
    await UserActions.destroy({ where: { userId: member.id } })
    await UserMultiplicadores.destroy({ where: { userId: member.id } })
    await DonationRecords.destroy({ where: { userId: member.id } })
    await Identificacao.destroy({ where: { userId: member.id } })

    const BOOSTER_ROLE = '1338699956692717659'
    const oldRoles = member.roles.cache
      .filter(role => role.id !== BOOSTER_ROLE)
      .map(role => role.id)

    await member.roles.remove(oldRoles)
    await member.roles.add(EXONERATION_ROLE)

    await member.setNickname('').catch(() => {})

    const today = new Date()
    const formattedDate = today.toLocaleDateString('pt-BR')

    const exonerationEmbed = new EmbedBuilder()
      .setTitle(`${config.branding.name} - Ordem de Exoneração - ${formattedDate}`)
      .setDescription(
        `É com profundo pesar que concedemos a seguinte ordem de exoneração:\n\n` +
          `❌ **Oficial Exonerado:** <@${member.id}>\n` +
          `📌 **Motivo:** \`\`\`${reason}\`\`\`\n\n` +
          `Embora esta seja uma despedida dolorosa, esperamos que possa ser encarada como uma oportunidade para reflexão pessoal e crescimento.\n\n` +
          `**Sofra a dor da disciplina ou sofra a dor do arrependimento.**`,
      )
      .setColor('#ff0000')
      .setTimestamp()

    const exoChannel = interaction.guild.channels.cache.get(EXONERATION_CHANNEL)
    if (exoChannel) await exoChannel.send({ embeds: [exonerationEmbed] })

    const logEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('📋 Log de Exoneração')
      .setDescription('Uma ordem de exoneração foi aplicada.')
      .addFields(
        { name: 'Aplicador', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Oficial Exonerado', value: `<@${member.id}>`, inline: true },
        { name: 'Motivo', value: reason, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `${config.branding.footerText} CORREGEDORIA` })

    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID)
    if (logChannel) await logChannel.send({ embeds: [logEmbed] })

    // Log para servidor de logs
    try {
      const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
      if (logsGuild) {
        const logsChannel = logsGuild.channels.cache.get(config.logsChannels.corregedoria)
          || await logsGuild.channels.fetch(config.logsChannels.corregedoria).catch(() => null)
        if (logsChannel) await logsChannel.send({ embeds: [logEmbed] })
      }
    } catch (err) {
      console.error('Erro ao enviar log de exoneração para servidor de logs:', err)
    }

    try {
      await member.send({
        content: `❌ Você foi exonerado do servidor **${interaction.guild.name}**.`,
        embeds: [exonerationEmbed],
      })
    } catch (error) {
      console.log(`Não foi possível enviar mensagem para ${member.user.tag}.`)
    }

    await interaction.editReply({
      content:
        '✅ Exoneração aplicada com sucesso. Todos os registros foram removidos.',
    })
  } catch (error) {
    console.error('Erro ao processar exoneração:', error)
    await interaction.editReply({
      content: '⚠️ Ocorreu um erro ao tentar exonerar o usuário.',
    })
  }
}
