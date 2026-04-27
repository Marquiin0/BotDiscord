const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  StringSelectMenuBuilder,
} = require('discord.js')
const { Warning, PromotionRecords, ActionReports, PrisonReports, ApreensaoReports } = require('../database')
const config = require('../config')

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.deferred || interaction.replied) return
    // ==================== BOTÕES DA CORREGEDORIA ====================
    if (interaction.isButton()) {
      // ADV Verbal
      if (interaction.customId.startsWith('corr_advv_')) {
        return handleAdvModal(interaction, 'verbal')
      }
      // ADV 1
      if (interaction.customId.startsWith('corr_adv1_')) {
        return handleAdvModal(interaction, 1)
      }
      // ADV 2
      if (interaction.customId.startsWith('corr_adv2_')) {
        return handleAdvModal(interaction, 2)
      }
      // Exonerar (segunda confirmação) — deve vir ANTES do check genérico
      if (interaction.customId.startsWith('corr_exonerar_confirm_')) {
        return handleExonerarSecondCheck(interaction)
      }
      // Cancelar exoneração
      if (interaction.customId.startsWith('corr_exonerar_cancel_')) {
        return interaction.update({
          content: '❌ Exoneração cancelada.',
          embeds: [],
          components: [],
        })
      }
      // Exonerar (abre modal de motivo)
      if (interaction.customId.startsWith('corr_exonerar_')) {
        return handleExonerarModal(interaction)
      }
      // Promover (via corregedoria)
      if (interaction.customId.startsWith('corr_promover_')) {
        return handlePromoverSelect(interaction)
      }
      // Rebaixar (via corregedoria)
      if (interaction.customId.startsWith('corr_rebaixar_')) {
        return handleRebaixarSelect(interaction)
      }
      // Select de promoção/rebaixamento
      if (interaction.customId.startsWith('corr_rank_select_')) {
        return // Handled by select menu below
      }
      // Alterar punição (remover ADV)
      if (interaction.customId.startsWith('corr_remover_adv_')) {
        return handleRemoverAdv(interaction)
      }
      // Recorrer (abre ticket)
      if (interaction.customId === 'corr_recorrer') {
        return handleRecorrer(interaction)
      }
    }

    // ==================== SELECT MENUS ====================
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('corr_promover_select_')) {
        return handleRankChange(interaction, 'promover')
      }
      if (interaction.customId.startsWith('corr_rebaixar_select_')) {
        return handleRankChange(interaction, 'rebaixar')
      }
    }

    // ==================== MODALS ====================
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('modal_adv_')) {
        return handleAdvSubmit(interaction)
      }
      if (interaction.customId.startsWith('modal_exonerar_')) {
        return handleExonerarConfirm(interaction)
      }
    }
  },
}

// ==================== ADV HANDLERS ====================

// Mapping centralizado de tipo -> roleId / dias / cor / label
const ADV_CONFIG = {
  verbal: { roleId: () => config.roles.advVerbal, days: 5,  color: '#FFD700', label: 'Verbal' },
  1:      { roleId: () => config.roles.adv1,      days: 10, color: '#FFA500', label: '1' },
  2:      { roleId: () => config.roles.adv2,      days: 15, color: '#FF4500', label: '2' },
}

async function handleAdvModal(interaction, advLevel) {
  const targetId = interaction.customId.split('_').pop()
  const meta = ADV_CONFIG[advLevel]
  if (!meta) return

  const modal = new ModalBuilder()
    .setCustomId(`modal_adv_${advLevel}_${targetId}`)
    .setTitle(`Advertência ${meta.label}`)

  const motivoInput = new TextInputBuilder()
    .setCustomId('adv_motivo')
    .setLabel('Motivo da advertência')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)

  modal.addComponents(new ActionRowBuilder().addComponents(motivoInput))
  await interaction.showModal(modal)
}

const processedAdvInteractions = new Set()

async function handleAdvSubmit(interaction) {
  if (interaction.deferred || interaction.replied) return
  if (processedAdvInteractions.has(interaction.id)) return
  processedAdvInteractions.add(interaction.id)
  setTimeout(() => processedAdvInteractions.delete(interaction.id), 30000)

  const parts = interaction.customId.split('_')
  // customId: modal_adv_<level>_<targetId>  — level pode ser 'verbal' | '1' | '2'
  const rawLevel = parts[2]
  const advLevel = rawLevel === 'verbal' ? 'verbal' : parseInt(rawLevel)
  const targetId = parts[3]
  const motivo = interaction.fields.getTextInputValue('adv_motivo')

  const meta = ADV_CONFIG[advLevel]
  if (!meta) {
    return interaction.reply({ content: '❌ Tipo de ADV inválido.', flags: MessageFlags.Ephemeral })
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const guild = interaction.guild
  const member = await guild.members.fetch(targetId).catch(() => null)
  if (!member) {
    return interaction.editReply({ content: '❌ Membro não encontrado.' })
  }

  const roleId = meta.roleId()
  const duration = meta.days

  await member.roles.add(roleId).catch(console.error)

  const expirationDate = new Date()
  expirationDate.setDate(expirationDate.getDate() + duration)

  await Warning.create({
    userId: targetId,
    roleId,
    reason: motivo,
    timestamp: expirationDate,
    appliedBy: interaction.user.id,
  })

  const logChannel = guild.channels.cache.get(config.channels.exoneracaoLog)
  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`⚠️ ${config.branding.name} - Advertência ${meta.label}`)
      .addFields(
        { name: '👤 Membro', value: `<@${targetId}>`, inline: true },
        { name: '📝 Motivo', value: motivo, inline: false },
        { name: '👮 Aplicado por', value: `<@${interaction.user.id}>`, inline: true },
        { name: '⏰ Duração', value: `${duration} dias`, inline: true },
        { name: '📊 Situação', value: 'Ativa', inline: true },
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const removeButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`corr_remover_adv_${targetId}_${roleId}`)
        .setLabel('🔄 Alterar Punição')
        .setStyle(ButtonStyle.Secondary),
    )

    await logChannel.send({ embeds: [logEmbed], components: [removeButton] })
  }

  // Log no servidor de logs (se configurado)
  try {
    const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
    if (logsGuild) {
      const logsChannel = logsGuild.channels.cache.get(config.logsChannels.corregedoria)
        || await logsGuild.channels.fetch(config.logsChannels.corregedoria).catch(() => null)
      if (logsChannel) {
        const logsEmbed = new EmbedBuilder()
          .setColor(meta.color)
          .setTitle(`⚠️ ${config.branding.name} - Advertência ${meta.label}`)
          .addFields(
            { name: '👤 Membro', value: `<@${targetId}>`, inline: true },
            { name: '📝 Motivo', value: motivo, inline: false },
            { name: '👮 Aplicado por', value: `<@${interaction.user.id}>`, inline: true },
            { name: '⏰ Duração', value: `${duration} dias`, inline: true },
            { name: '📊 Situação', value: 'Ativa', inline: true },
          )
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()
        await logsChannel.send({ embeds: [logsEmbed] })
      }
    }
  } catch (err) {
    console.error('Erro ao enviar log de advertência para servidor de logs:', err)
  }

  // DM para a pessoa
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`⚠️ ${config.branding.name} - Advertência ${meta.label}`)
      .setDescription(
        `Você recebeu uma **Advertência ${meta.label}** por:\n\n` +
        `> ${motivo}\n\n` +
        `Duração: **${duration} dias**\n` +
        `Aplicado por: <@${interaction.user.id}>`,
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const recorrerButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('corr_recorrer')
        .setLabel('📋 Recorrer')
        .setStyle(ButtonStyle.Primary),
    )

    await member.send({ embeds: [dmEmbed], components: [recorrerButton] }).catch(() => {})
  } catch (e) { /* DM fechada */ }

  await interaction.editReply({
    content: `✅ ADV ${meta.label} aplicada em <@${targetId}> por ${duration} dias.`,
  })
}

// ==================== EXONERAR HANDLERS ====================

// Armazena motivos pendentes de exoneração
const pendingExonerationReasons = new Map()

async function handleExonerarModal(interaction) {
  const targetId = interaction.customId.split('_').pop()

  const modal = new ModalBuilder()
    .setCustomId(`modal_exonerar_${targetId}`)
    .setTitle('Exoneração - Motivo')

  const motivoInput = new TextInputBuilder()
    .setCustomId('exonerar_motivo')
    .setLabel('Motivo da exoneração')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)

  modal.addComponents(new ActionRowBuilder().addComponents(motivoInput))
  await interaction.showModal(modal)
}

async function handleExonerarConfirm(interaction) {
  const targetId = interaction.customId.split('_').pop()
  const motivo = interaction.fields.getTextInputValue('exonerar_motivo')

  // Salva o motivo para usar na confirmação final
  pendingExonerationReasons.set(`${interaction.user.id}_${targetId}`, motivo)

  const confirmEmbed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('⚠️ Confirmação de Exoneração')
    .setDescription(
      `Você está prestes a exonerar <@${targetId}>.\n\n` +
      `**Motivo:** ${motivo}\n\n` +
      `**Esta ação é irreversível!** Todos os cargos serão removidos.\n\n` +
      `Clique em **Confirmar** para prosseguir.`,
    )

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`corr_exonerar_confirm_${targetId}`)
      .setLabel('✅ Confirmar Exoneração')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`corr_exonerar_cancel_${targetId}`)
      .setLabel('❌ Cancelar')
      .setStyle(ButtonStyle.Secondary),
  )

  await interaction.reply({
    embeds: [confirmEmbed],
    components: [buttons],
    flags: MessageFlags.Ephemeral,
  })
}

async function handleExonerarSecondCheck(interaction) {
  const targetId = interaction.customId.split('_').pop()

  // Buscar motivo salvo
  const motivo = pendingExonerationReasons.get(`${interaction.user.id}_${targetId}`) || 'Não especificado'
  pendingExonerationReasons.delete(`${interaction.user.id}_${targetId}`)

  await interaction.deferUpdate()

  const guild = interaction.guild
  const member = await guild.members.fetch(targetId).catch(() => null)
  if (!member) {
    return interaction.editReply({ content: '❌ Membro não encontrado.', embeds: [], components: [] })
  }

  // Remove TODOS os cargos gerenciáveis
  const rolesToRemove = member.roles.cache.filter(
    role => role.id !== guild.id && role.managed === false,
  )
  for (const [, role] of rolesToRemove) {
    await member.roles.remove(role).catch(console.error)
  }

  // Limpa o nickname
  await member.setNickname(null).catch(console.error)

  // Log no canal de exoneração
  const logChannel = guild.channels.cache.get(config.channels.exoneracaoLog)
  if (logChannel) {
    const today = new Date().toLocaleDateString('pt-BR')
    const logEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle(`${config.branding.name} - Ordem de Exoneração - ${today}`)
      .setDescription('É com profundo pesar que concedemos a seguinte ordem de exoneração:')
      .addFields(
        { name: '❌ Oficial Exonerado', value: `<@${targetId}>`, inline: false },
        { name: '📝 Motivo', value: motivo, inline: false },
        { name: '👮 Exonerado por', value: `<@${interaction.user.id}>`, inline: false },
      )
      .addFields({
        name: '\u200b',
        value: 'Embora esta seja uma despedida dolorosa, esperamos que possa ser encarada como uma oportunidade para reflexão pessoal e crescimento.',
      })
      .setFooter({ text: `Sofra a dor da disciplina ou sofra a dor do arrependimento. | ${config.branding.footerText}` })
      .setTimestamp()

    await logChannel.send({
      content: `<@${targetId}>`,
      embeds: [logEmbed],
    })

    // Enviar log para o servidor de logs
    try {
      const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
      if (logsGuild) {
        const logsChannel = logsGuild.channels.cache.get(config.logsChannels.corregedoria)
          || await logsGuild.channels.fetch(config.logsChannels.corregedoria).catch(() => null)
        if (logsChannel) await logsChannel.send({ embeds: [logEmbed] })
        else console.error('Canal de corregedoria não encontrado no servidor de logs')
      } else {
        console.error('Guild de logs não encontrada')
      }
    } catch (err) {
      console.error('Erro ao enviar log de exoneração para servidor de logs:', err)
    }
  }

  // DM para a pessoa
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle(`❌ ${config.branding.name} - Exoneração`)
      .setDescription(
        `Você foi exonerado(a) da ${config.branding.name}.\n\n` +
        `**Motivo:** ${motivo}\n\n` +
        `Exonerado por: <@${interaction.user.id}>\n\n` +
        `Se você acredita que houve um erro, pode recorrer clicando no botão abaixo.`,
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const recorrerButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('corr_recorrer')
        .setLabel('📋 Recorrer')
        .setStyle(ButtonStyle.Primary),
    )

    await member.send({ embeds: [dmEmbed], components: [recorrerButton] }).catch(() => {})
  } catch (e) { /* DM fechada */ }

  await interaction.editReply({
    content: `✅ <@${targetId}> foi exonerado com sucesso.`,
    embeds: [],
    components: [],
  })
}

// ==================== PROMOVER/REBAIXAR VIA CORREGEDORIA ====================

function buildRankOptions(targetId) {
  const options = []
  for (const key of config.rankOrder) {
    options.push({
      label: `${config.ranks[key].tag} ${config.ranks[key].name}`,
      value: `${config.ranks[key].roleId}_${targetId}`,
    })
    // Insere R.H entre IC e COR
    if (key === 'IC') {
      options.push({
        label: '[R.H] Recursos Humanos',
        value: `${config.roles.rh}_${targetId}`,
      })
    }
  }
  return options.slice(0, 25)
}

async function handlePromoverSelect(interaction) {
  const targetId = interaction.customId.split('_').pop()

  const select = new StringSelectMenuBuilder()
    .setCustomId(`corr_promover_select_${targetId}`)
    .setPlaceholder('Selecione o cargo de destino...')
    .addOptions(buildRankOptions(targetId))

  const row = new ActionRowBuilder().addComponents(select)

  await interaction.update({
    content: `Selecione o novo cargo para <@${targetId}>:`,
    embeds: [],
    components: [row],
  })
}

async function handleRebaixarSelect(interaction) {
  const targetId = interaction.customId.split('_').pop()

  const select = new StringSelectMenuBuilder()
    .setCustomId(`corr_rebaixar_select_${targetId}`)
    .setPlaceholder('Selecione o cargo de destino...')
    .addOptions(buildRankOptions(targetId))

  const row = new ActionRowBuilder().addComponents(select)

  await interaction.update({
    content: `Selecione o novo cargo para <@${targetId}>:`,
    embeds: [],
    components: [row],
  })
}

async function handleRankChange(interaction, action) {
  const selectedValue = interaction.values[0]
  const [newRoleId, targetId] = selectedValue.split('_')

  await interaction.deferUpdate()

  const guild = interaction.guild
  const member = await guild.members.fetch(targetId).catch(() => null)
  if (!member) {
    return interaction.editReply({ content: '❌ Membro não encontrado.', components: [] })
  }

  const promotionTags = config.promotionTags
  const rhRoleId = config.roles.rh
  const isRH = newRoleId === rhRoleId
  const hadRH = member.roles.cache.has(rhRoleId)

  // Encontra cargo de patente atual (ignora R.H)
  let oldRoleId = null
  for (const roleId of Object.keys(promotionTags)) {
    if (member.roles.cache.has(roleId)) {
      oldRoleId = roleId
      break
    }
  }

  const oldTag = hadRH ? '[R.H]' : promotionTags[oldRoleId]
  let newTag
  let updatedNickname

  if (isRH) {
    // Atribuir R.H: adiciona cargo R.H, muda tag para [R.H]
    newTag = '[R.H]'

    // Se a patente atual é acima de R.H (IC, AE, HC, SCMD, CMD), rebaixa para MAJ
    const rhPosition = 5 // posição do R.H (entre IC e COR)
    const currentRankIndex = oldRoleId
      ? config.rankOrder.findIndex(key => config.ranks[key].roleId === oldRoleId)
      : -1
    if (currentRankIndex !== -1 && currentRankIndex < rhPosition) {
      // Patente acima de R.H — remove e dá MAJ como base
      await member.roles.remove(oldRoleId).catch(console.error)
      await member.roles.add(config.ranks.MAJ.roleId).catch(console.error)
    }

    await member.roles.add(rhRoleId).catch(console.error)
    updatedNickname = member.displayName.replace(/\[.*?\]/, newTag)
    await member.setNickname(updatedNickname).catch(console.error)
  } else {
    // Mudança de patente normal
    newTag = promotionTags[newRoleId]
    if (!newTag) {
      return interaction.editReply({ content: '❌ Cargo inválido.', components: [] })
    }

    // Se tinha R.H, remove o cargo funcional
    if (hadRH) await member.roles.remove(rhRoleId).catch(console.error)

    // Remove cargo de patente antigo e adiciona novo
    if (oldRoleId) await member.roles.remove(oldRoleId).catch(console.error)
    await member.roles.add(newRoleId).catch(console.error)

    updatedNickname = member.displayName.replace(/\[.*?\]/, newTag)
    await member.setNickname(updatedNickname).catch(console.error)
  }

  // Atualiza registro
  await PromotionRecords.upsert({
    userId: targetId,
    userName: updatedNickname,
    lastPromotionDate: new Date(),
  })

  // Log no canal de promoções
  const logChannel = guild.channels.cache.get(config.channels.promocaoLog)
  if (logChannel) {
    const today = new Date().toLocaleDateString('pt-BR')
    const isPromotion = action === 'promover'

    const logEmbed = new EmbedBuilder()
      .setColor(isPromotion ? '#00FF00' : '#FF0000')
      .setTitle(`${isPromotion ? '🏅' : '🔻'} ${config.branding.name} - ${isPromotion ? 'Promoção' : 'Rebaixamento'}`)
      .setDescription(
        isPromotion
          ? 'Em reconhecimento aos serviços prestados:'
          : 'Em virtude da análise dos serviços prestados:',
      )
      .addFields(
        { name: '👤 Oficial', value: `<@${targetId}>`, inline: true },
        { name: '📌 De', value: oldTag ? `${oldTag}` : 'N/A', inline: true },
        { name: '📌 Para', value: newTag, inline: true },
        { name: '👮 Por', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setFooter({ text: `${config.branding.footerText} | ${today}` })
      .setTimestamp()

    await logChannel.send({
      content: `<@${targetId}>`,
      embeds: [logEmbed],
    })
  }

  // Log para servidor de logs
  try {
    const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
    if (logsGuild) {
      const logsChannelId = action === 'promover' ? config.logsChannels.promocao : config.logsChannels.rebaixamento
      const logsChannel = logsGuild.channels.cache.get(logsChannelId)
        || await logsGuild.channels.fetch(logsChannelId).catch(() => null)
      if (logsChannel) {
        await logsChannel.send({
          content: `<@${targetId}>`,
          embeds: [logEmbed],
        })
      }
    }
  } catch (err) {
    console.error('Erro ao enviar log de promoção/rebaixamento para servidor de logs:', err)
  }

  // DM
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(action === 'promover' ? '#00FF00' : '#FF0000')
      .setTitle(`${action === 'promover' ? '🏅 Promoção' : '🔻 Rebaixamento'} - ${config.branding.name}`)
      .setDescription(
        action === 'promover'
          ? `Parabéns! Você foi promovido(a) de **${oldTag || 'N/A'}** para **${newTag}**!`
          : `Você foi rebaixado(a) de **${oldTag || 'N/A'}** para **${newTag}**.`,
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()
    await member.send({ embeds: [dmEmbed] }).catch(() => {})
  } catch (e) { /* DM fechada */ }

  await interaction.editReply({
    content: `✅ <@${targetId}> foi ${action === 'promover' ? 'promovido' : 'rebaixado'} para ${newTag}!`,
    components: [],
  })
}

// ==================== REMOVER ADV ====================

async function handleRemoverAdv(interaction) {
  const hasPermission =
    interaction.member.permissions.has('Administrator') ||
    interaction.member.roles.cache.hasAny(...config.permissions.corregedoria)

  if (!hasPermission) {
    return interaction.reply({
      content: '❌ Sem permissão para alterar punições.',
      flags: MessageFlags.Ephemeral,
    })
  }

  const parts = interaction.customId.split('_')
  const targetId = parts[3]
  const roleId = parts[4]

  const guild = interaction.guild
  const member = await guild.members.fetch(targetId).catch(() => null)

  if (member) {
    await member.roles.remove(roleId).catch(console.error)
  }

  // Remove do BD
  await Warning.destroy({ where: { userId: targetId, roleId } })

  // Atualiza a mensagem
  await interaction.update({
    components: [],
  })

  await interaction.followUp({
    content: `✅ Punição removida de <@${targetId}>.`,
    flags: MessageFlags.Ephemeral,
  })

  // Log de remoção no canal de punições (servidor principal)
  const logEmbed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('📋 Log de Remoção de Advertência')
    .setDescription('Uma advertência foi removida.')
    .addFields(
      { name: 'Removido por', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Oficial', value: `<@${targetId}>`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `${config.branding.footerText} CORREGEDORIA` })

  // Log no servidor de logs (apenas)
  try {
    const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
    if (logsGuild) {
      const logsChannel = logsGuild.channels.cache.get(config.logsChannels.corregedoria)
        || await logsGuild.channels.fetch(config.logsChannels.corregedoria).catch(() => null)
      if (logsChannel) await logsChannel.send({ embeds: [logEmbed] })
    }
  } catch (err) {
    console.error('Erro ao enviar log de remoção para servidor de logs:', err)
  }
}

// ==================== RECORRER ====================

async function handleRecorrer(interaction) {
  // Redireciona para abrir um ticket de corregedoria
  // O interactionTicket.js deve lidar com isso
  await interaction.reply({
    content: `Para recorrer, abra um ticket em <#${config.channels.tickets}>.`,
    flags: MessageFlags.Ephemeral,
  })
}
