const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js')
const { MemberID, SetagemConfig } = require('../database')
const config = require('../config')

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return

    if (interaction.isButton() && interaction.customId === 'solicitar_setagem') {
      return openSetagemModal(interaction)
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_setagem') {
      return handleModalSetagem(interaction)
    }

    if (interaction.isButton() && interaction.customId.startsWith('setagem_aceitar_')) {
      return handleAceitarSetagem(interaction)
    }

    if (interaction.isButton() && interaction.customId.startsWith('setagem_recusar_')) {
      return handleRecusarSetagem(interaction)
    }
  },
}

// ==================== MODAL ====================

async function openSetagemModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_setagem')
    .setTitle(`Solicitar Setagem — ${config.branding.shortName}`)

  const recrutadorInput = new TextInputBuilder()
    .setCustomId('recrutador')
    .setLabel('Recrutador (nome ou @menção)')
    .setPlaceholder('Ex: @Joao ou Joao Silva')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)

  const nomeInput = new TextInputBuilder()
    .setCustomId('nome')
    .setLabel('Nome do personagem')
    .setPlaceholder('Ex: Joao Silva')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50)

  const idInput = new TextInputBuilder()
    .setCustomId('id')
    .setLabel('ID do personagem')
    .setPlaceholder('Ex: 12345')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20)

  modal.addComponents(
    new ActionRowBuilder().addComponents(recrutadorInput),
    new ActionRowBuilder().addComponents(nomeInput),
    new ActionRowBuilder().addComponents(idInput),
  )

  await interaction.showModal(modal)
}

async function handleModalSetagem(interaction) {
  const recrutador = interaction.fields.getTextInputValue('recrutador').trim()
  const nome = interaction.fields.getTextInputValue('nome').trim()
  const id = interaction.fields.getTextInputValue('id').trim()

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const approvalChannel = interaction.guild.channels.cache.get(config.channels.setagemAprovacao)
  if (!approvalChannel) {
    return interaction.editReply({
      content: '❌ Canal de aprovação de setagens não configurado.',
    })
  }

  // Sanitiza nome/id para uso no customId (evita underscores que quebrariam o split)
  const safeNome = nome.replace(/_/g, ' ').slice(0, 50)
  const safeId = id.replace(/_/g, '').slice(0, 20)

  const approvalEmbed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('📋 Nova Solicitação de Setagem')
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '👤 Solicitante', value: `<@${interaction.user.id}>`, inline: true },
      { name: '🎯 Recrutador', value: recrutador, inline: true },
      { name: '​', value: '​', inline: true },
      { name: '📝 Nome', value: nome, inline: true },
      { name: '🆔 ID', value: id, inline: true },
    )
    .setFooter({ text: config.branding.footerText })
    .setTimestamp()

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`setagem_aceitar_${interaction.user.id}_${safeNome}_${safeId}`)
      .setLabel('✅ Aceitar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`setagem_recusar_${interaction.user.id}`)
      .setLabel('❌ Recusar')
      .setStyle(ButtonStyle.Danger),
  )

  await approvalChannel.send({ embeds: [approvalEmbed], components: [buttons] })

  await interaction.editReply({
    content: '✅ Sua solicitação de setagem foi enviada para análise. Aguarde a aprovação do comando.',
  })
}

// ==================== ACEITAR ====================

async function handleAceitarSetagem(interaction) {
  // Permissão: só Corregedor / SCMD / CMD podem aprovar
  const allowed =
    interaction.member.permissions.has('Administrator') ||
    interaction.member.roles.cache.hasAny(...config.permissions.corregedoria)
  if (!allowed) {
    return interaction.reply({
      content: '❌ Apenas Corregedor, Sub Commander e Commander podem aprovar setagens.',
      flags: MessageFlags.Ephemeral,
    })
  }

  const parts = interaction.customId.split('_')
  // setagem_aceitar_<userId>_<nome>_<id>
  const targetUserId = parts[2]
  const nome = parts.slice(3, parts.length - 1).join('_') // nome pode ter espaços convertidos para _ — recompõe
  const id = parts[parts.length - 1]

  await interaction.deferUpdate()

  const guild = interaction.guild
  const member = await guild.members.fetch(targetUserId).catch(() => null)
  if (!member) {
    return interaction.followUp({
      content: '❌ Membro não encontrado no servidor.',
      flags: MessageFlags.Ephemeral,
    })
  }

  const newNickname = `[SHADOW] ${nome} | ${id}`.slice(0, 32)
  await member.setNickname(newNickname).catch(console.error)

  await member.roles.add(config.roles.membro).catch(console.error)
  await member.roles.add(config.roles.shadow).catch(console.error)

  await MemberID.upsert({
    memberName: nome,
    discordId: targetUserId,
    memberId: id,
  })

  // Mensagem de boas-vindas (configurável via SetagemConfig)
  let welcomeMessage = `Bem-vindo(a) à **${config.branding.name}**!\n\nVocê foi aceito(a) como **Shadow** (estagiário). Siga as regras e tenha uma boa estadia!`
  const savedConfig = await SetagemConfig.findOne({ where: { key: 'welcomeMessage' } }).catch(() => null)
  if (savedConfig) welcomeMessage = savedConfig.value

  try {
    const dmEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`✅ ${config.branding.name} — Setagem Aprovada`)
      .setDescription(welcomeMessage)
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()
    await member.send({ embeds: [dmEmbed] }).catch(() => {})
  } catch { /* DM fechada */ }

  const oldEmbed = interaction.message.embeds[0]
  const updatedEmbed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('✅ Setagem Aprovada')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setFooter({ text: config.branding.footerText })
    .setTimestamp()

  if (oldEmbed?.fields) {
    for (const f of oldEmbed.fields) {
      if (f.name === '​') continue
      updatedEmbed.addFields({ name: f.name, value: f.value, inline: f.inline })
    }
  }
  updatedEmbed.addFields({ name: '✅ Aprovado por', value: `<@${interaction.user.id}>`, inline: false })

  await interaction.editReply({
    embeds: [updatedEmbed],
    components: [],
  })
}

// ==================== RECUSAR ====================

async function handleRecusarSetagem(interaction) {
  const allowed =
    interaction.member.permissions.has('Administrator') ||
    interaction.member.roles.cache.hasAny(...config.permissions.corregedoria)
  if (!allowed) {
    return interaction.reply({
      content: '❌ Apenas Corregedor, Sub Commander e Commander podem recusar setagens.',
      flags: MessageFlags.Ephemeral,
    })
  }

  const targetUserId = interaction.customId.split('_').pop()

  try {
    const member = await interaction.guild.members.fetch(targetUserId).catch(() => null)
    if (member) {
      const dmEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`❌ ${config.branding.name} — Setagem Recusada`)
        .setDescription(
          'Sua solicitação de setagem foi recusada.\n\n' +
          'Verifique se preencheu corretamente os dados e tente novamente.',
        )
        .setFooter({ text: config.branding.footerText })
        .setTimestamp()
      await member.send({ embeds: [dmEmbed] }).catch(() => {})
    }
  } catch { /* DM fechada */ }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor('#FF0000')
    .setTitle('❌ Setagem Recusada')
    .addFields({ name: '❌ Recusado por', value: `<@${interaction.user.id}>`, inline: false })

  await interaction.update({
    embeds: [updatedEmbed],
    components: [],
  })
}
