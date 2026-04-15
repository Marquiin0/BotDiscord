const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  AttachmentBuilder,
} = require('discord.js')
const fs = require('fs')
const path = require('path')
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args))
const { MemberID, Identificacao, SetagemConfig } = require('../database')
const config = require('../config')

const ATTACHMENTS_DIR = path.join(__dirname, '..', 'attachments', 'identificacoes')
try { fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true }) } catch { /* ignore */ }

// Armazena dados pendentes de setagem
const pendingSetagens = new Map()

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.deferred || interaction.replied) return
    // ==================== BOTÃO SOLICITAR SETAGEM ====================
    if (interaction.isButton() && interaction.customId === 'solicitar_setagem') {
      await handleSolicitarSetagem(interaction, client)
      return
    }

    // ==================== BOTÕES ACEITAR/RECUSAR SETAGEM ====================
    if (interaction.isButton() && interaction.customId.startsWith('setagem_aceitar_')) {
      await handleAceitarSetagem(interaction)
      return
    }
    if (interaction.isButton() && interaction.customId.startsWith('setagem_recusar_')) {
      await handleRecusarSetagem(interaction)
      return
    }

    // ==================== MENSAGENS NO CANAL DE SETAGEM ====================
    if (interaction.isMessage && false) return // placeholder - handled by messageCreate
  },
}

async function handleSolicitarSetagem(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  // Enviar DM com fardamento de estagiário
  let dmEnviada = false
  try {
    const roupaEmbed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle('👔 Fardamento de Estagiário — Genesis Police')
      .setDescription(
        'Antes de continuar com a setagem, vista o **fardamento correto** no seu personagem!\n\n' +
        'No **Passo 4** do formulário você precisará enviar um **print** do seu personagem usando a roupa abaixo.\n\n' +
        '⚠️ **Atenção:** Sem o fardamento correto, sua setagem será **recusada**.',
      )
      .addFields(
        {
          name: '👩 Roupa Estagiário Feminina',
          value: '```\nJaqueta: 566 0\nCalça: 207 0\nSapatos: 2 10\n```',
          inline: true,
        },
        {
          name: '👨 Roupa Estagiário Masculino',
          value: '```\nJaqueta: 526\nCalça: 193\nSapatos: 1 1\n```',
          inline: true,
        },
      )
      .setFooter({ text: `${config.branding.footerText} • Vista a roupa antes de enviar a foto!` })
      .setTimestamp()

    await interaction.user.send({ embeds: [roupaEmbed] })
    dmEnviada = true
  } catch (err) {
    console.log(`[Setagem] Não foi possível enviar DM de fardamento para ${interaction.user.tag}`)
  }

  try {
    // Cria canal privado para setagem
    const setagemChannel = await interaction.guild.channels.create({
      name: `setagem-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: config.categories.tickets, // Categoria de tickets
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
          ],
        },
      ],
    })

    // Estado da setagem
    pendingSetagens.set(interaction.user.id, {
      channelId: setagemChannel.id,
      step: 1,
      data: {},
    })

    // Se DM falhou, enviar fardamento no canal privado
    if (!dmEnviada) {
      const roupaFallback = new EmbedBuilder()
        .setColor(config.branding.color)
        .setTitle('👔 Fardamento de Estagiário — Genesis Police')
        .setDescription(
          '⚠️ **Não conseguimos enviar no seu privado.** Confira o fardamento aqui!\n\n' +
          'No **Passo 4** você precisará enviar um **print** do seu personagem usando a roupa abaixo.',
        )
        .addFields(
          {
            name: '👩 Roupa Estagiário Feminina',
            value: '```\nJaqueta: 566 0\nCalça: 207 0\nSapatos: 2 10\n```',
            inline: true,
          },
          {
            name: '👨 Roupa Estagiário Masculino',
            value: '```\nJaqueta: 526\nCalça: 193\nSapatos: 1 1\n```',
            inline: true,
          },
        )
        .setFooter({ text: `${config.branding.footerText} • Vista a roupa antes de enviar a foto!` })
      await setagemChannel.send({ embeds: [roupaFallback] })
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📋 Setagem - ${config.branding.name}`)
      .setDescription(
        `Olá <@${interaction.user.id}>! Vamos iniciar sua setagem.\n\n` +
        `**Passo 1/4:** Mencione seu **recrutador** (quem te indicou).\n` +
        `Exemplo: @NomeDoRecrutador`,
      )
      .setFooter({ text: 'Responda neste canal para continuar.' })

    await setagemChannel.send({ embeds: [embed] })

    // Collector para mensagens neste canal
    const filter = m => m.author.id === interaction.user.id
    const collector = setagemChannel.createMessageCollector({
      filter,
      time: 600000, // 10 minutos
    })

    const setagemData = {
      userId: interaction.user.id,
      channelId: setagemChannel.id,
    }

    let step = 1

    collector.on('collect', async message => {
      try {
        if (step === 1) {
          // Recrutador
          setagemData.recrutador = message.content
          step = 2
          const embed2 = new EmbedBuilder()
            .setColor(config.branding.color)
            .setDescription('**Passo 2/4:** Qual é o **nome do seu personagem**?')
          await setagemChannel.send({ embeds: [embed2] })
        } else if (step === 2) {
          // Nome
          setagemData.nome = message.content
          step = 3
          const embed3 = new EmbedBuilder()
            .setColor(config.branding.color)
            .setDescription('**Passo 3/4:** Qual é o **ID do seu personagem**?')
          await setagemChannel.send({ embeds: [embed3] })
        } else if (step === 3) {
          // ID
          setagemData.id = message.content
          step = 4
          const embed4 = new EmbedBuilder()
            .setColor(config.branding.color)
            .setDescription(
              '**Passo 4/4:** Envie um **print do seu personagem** com o fardamento correto da patente.\n' +
              'Este print será considerado como sua identificação pelos próximos 7 dias.',
            )
          await setagemChannel.send({ embeds: [embed4] })
        } else if (step === 4) {
          // Foto
          const attachment = message.attachments.first()
          if (!attachment) {
            await setagemChannel.send('⚠️ Por favor, envie uma **imagem** do seu personagem.')
            return
          }

          // Baixa e salva a foto localmente
          let localFotoPath
          try {
            const response = await fetch(attachment.url)
            if (!response.ok) throw new Error('URL inacessível')
            const buffer = Buffer.from(await response.arrayBuffer())
            const ext = path.extname(attachment.name) || '.png'
            const fileName = `setagem_${setagemData.userId}_${Date.now()}${ext}`
            localFotoPath = path.join(ATTACHMENTS_DIR, fileName)
            await fs.promises.writeFile(localFotoPath, buffer)
          } catch (err) {
            console.error('Erro ao salvar foto da setagem:', err)
            await setagemChannel.send('⚠️ Erro ao salvar a imagem. Tente novamente.')
            return
          }

          setagemData.fotoPath = localFotoPath
          step = 5
          collector.stop('completed')

          // Envia para aprovação
          const approvalChannel = interaction.guild.channels.cache.get(config.channels.setagemAprovacao)
          if (!approvalChannel) {
            await setagemChannel.send('❌ Canal de aprovação não encontrado. Contate um administrador.')
            return
          }

          const fotoFile = new AttachmentBuilder(localFotoPath, { name: 'setagem.png' })

          const approvalEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('📋 Nova Solicitação de Setagem')
            .addFields(
              { name: '👤 Solicitante', value: `<@${setagemData.userId}>`, inline: true },
              { name: '🎯 Recrutador', value: setagemData.recrutador, inline: true },
              { name: '📝 Nome', value: setagemData.nome, inline: true },
              { name: '🆔 ID', value: setagemData.id, inline: true },
            )
            .setImage('attachment://setagem.png')
            .setFooter({ text: config.branding.footerText })
            .setTimestamp()

          const approvalButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`setagem_aceitar_${setagemData.userId}_${setagemData.nome}_${setagemData.id}`)
              .setLabel('✅ Aceitar')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`setagem_recusar_${setagemData.userId}`)
              .setLabel('❌ Recusar')
              .setStyle(ButtonStyle.Danger),
          )

          // Armazena path local para usar depois
          pendingSetagens.set(setagemData.userId, {
            ...setagemData,
            fotoPath: localFotoPath,
          })

          await approvalChannel.send({ embeds: [approvalEmbed], components: [approvalButtons], files: [fotoFile] })

          const confirmEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setDescription(
              '✅ Sua setagem foi enviada para aprovação!\n\n' +
              'Aguarde a análise do comando. Este canal será fechado em breve.',
            )
          await setagemChannel.send({ embeds: [confirmEmbed] })

          // Deleta canal após 2 segundos
          setTimeout(async () => {
            try { await setagemChannel.delete() } catch (e) { /* canal pode já ter sido deletado */ }
          }, 2000)
        }
      } catch (error) {
        console.error('Erro no collector de setagem:', error)
      }
    })

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        setagemChannel.send('⏱️ Tempo esgotado! A setagem foi cancelada.')
          .then(() => {
            setTimeout(() => setagemChannel.delete().catch(() => {}), 2000)
          })
          .catch(() => {})
        pendingSetagens.delete(interaction.user.id)
      }
    })

    await interaction.editReply({
      content: `✅ Canal de setagem criado! Acesse <#${setagemChannel.id}> para continuar.`,
    })
  } catch (error) {
    console.error('Erro ao criar setagem:', error)
    await interaction.editReply({
      content: '❌ Erro ao criar canal de setagem.',
    })
  }
}

async function handleAceitarSetagem(interaction) {
  const parts = interaction.customId.split('_')
  const targetUserId = parts[2]
  const nome = parts[3]
  const id = parts[4]

  await interaction.deferUpdate()

  const guild = interaction.guild
  const member = await guild.members.fetch(targetUserId).catch(() => null)
  if (!member) {
    return interaction.followUp({
      content: '❌ Membro não encontrado no servidor.',
      flags: MessageFlags.Ephemeral,
    })
  }

  // Muda nickname para [EST] NOME | ID
  const newNickname = `[EST] ${nome} | ${id}`
  await member.setNickname(newNickname).catch(console.error)

  // Adiciona cargos
  await member.roles.add(config.roles.recruta).catch(console.error)
  await member.roles.add(config.roles.membro).catch(console.error)

  // Cadastra no BD
  await MemberID.upsert({
    memberName: nome,
    discordId: targetUserId,
    memberId: id,
  })

  // Registra foto como identificação
  // Tenta pegar da memória; se não existir (bot reiniciou), pega do anexo da mensagem de aprovação
  const setagemInfo = pendingSetagens.get(targetUserId)
  let fotoSource = setagemInfo?.fotoPath || null
  const msgAttachment = interaction.message.attachments?.first()
  const fotoUrl = msgAttachment?.url || interaction.message.embeds[0]?.image?.url || null

  // Baixa a foto se não tiver caminho local
  if (!fotoSource && fotoUrl) {
    try {
      const response = await fetch(fotoUrl)
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        const fileName = `setagem_${targetUserId}_${Date.now()}.png`
        fotoSource = path.join(ATTACHMENTS_DIR, fileName)
        await fs.promises.writeFile(fotoSource, buffer)
      }
    } catch (err) {
      console.error('Erro ao baixar foto da mensagem de aprovação:', err)
    }
  }

  if (fotoSource) {
    const now = new Date()
    const expiration = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 dias

    const registro = await Identificacao.create({
      userId: targetUserId,
      userName: nome,
      fotoUrl: fotoSource,
      dataRegistro: now,
      dataExpiracao: expiration,
      status: 'ativo',
    })

    // Atribui cargos de identificação
    await member.roles.add(config.roles.identificado).catch(console.error)
    await member.roles.remove(config.roles.naoIdentificado).catch(console.error)

    // Envia foto para canal de identificação (formato padrão)
    const idChannel = guild.channels.cache.get(config.channels.identificacaoLog)
    if (idChannel) {
      const registroUnix = Math.floor(now.getTime() / 1000)
      const expiracaoUnix = Math.floor(expiration.getTime() / 1000)

      const fotoFile = new AttachmentBuilder(fotoSource, { name: 'identificacao.png' })

      const idEmbed = new EmbedBuilder()
        .setColor('#2f3136')
        .setTitle(`🪪 Identificação de ${nome}`)
        .addFields({
          name: '📅 Informações:',
          value:
            `**Data do Registro:** <t:${registroUnix}:F>\n` +
            `**Expira:** <t:${expiracaoUnix}:R>`,
        })
        .setImage('attachment://identificacao.png')
        .setFooter({ text: '🆔 Identificação concluída com sucesso (Setagem)' })

      const denyButton = new ButtonBuilder()
        .setCustomId(`negar_identificacao_${registro.id}`)
        .setLabel('❌')
        .setStyle(ButtonStyle.Secondary)

      const idRow = new ActionRowBuilder().addComponents(denyButton)

      const sentMessage = await idChannel.send({
        content: `🪪 O oficial <@${targetUserId}> **realizou** sua identificação! (Setagem)`,
        embeds: [idEmbed],
        components: [idRow],
        files: [fotoFile],
      })

      await registro.update({ messageId: sentMessage.id })
    }
  }

  // Busca mensagem de boas-vindas configurada
  let welcomeMessage = `Bem-vindo(a) à **${config.branding.name}**!\n\nVocê foi aceito(a) como Estagiário. Siga as regras e tenha uma boa estadia!\n\nRegras: ${config.cursoMAA.siteUrl}`

  const savedConfig = await SetagemConfig.findOne({ where: { key: 'welcomeMessage' } })
  if (savedConfig) {
    welcomeMessage = savedConfig.value
  }

  // DM para o novo membro
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`✅ ${config.branding.name} - Setagem Aprovada`)
      .setDescription(welcomeMessage)
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()
    await member.send({ embeds: [dmEmbed] }).catch(() => {})
  } catch (e) { /* DM fechada */ }

  // Atualiza embed de aprovação — recria do zero para evitar resíduos
  const oldEmbed = interaction.message.embeds[0]
  const updatedEmbed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('✅ Setagem Aprovada')
    .setFooter({ text: config.branding.footerText })
    .setTimestamp()

  // Copia os fields do embed original + adiciona "Aprovado por"
  if (oldEmbed.fields) {
    for (const f of oldEmbed.fields) {
      updatedEmbed.addFields({ name: f.name, value: f.value, inline: f.inline })
    }
  }
  updatedEmbed.addFields({ name: '✅ Aprovado por', value: `<@${interaction.user.id}>`, inline: true })

  // Imagem dentro do embed
  if (fotoSource) {
    updatedEmbed.setImage('attachment://setagem.png')
  }

  await interaction.editReply({
    embeds: [updatedEmbed],
    components: [],
    attachments: [],
    files: fotoSource ? [new AttachmentBuilder(fotoSource, { name: 'setagem.png' })] : [],
  })

  pendingSetagens.delete(targetUserId)
}

async function handleRecusarSetagem(interaction) {
  const targetUserId = interaction.customId.split('_').pop()

  pendingSetagens.delete(targetUserId)

  // DM para a pessoa recusada
  try {
    const guild = interaction.guild
    const member = await guild.members.fetch(targetUserId).catch(() => null)
    if (member) {
      const dmEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`❌ ${config.branding.name} - Setagem Recusada`)
        .setDescription(
          'Sua solicitação de setagem foi recusada.\n\n' +
          'Verifique se todos os requisitos foram atendidos e tente novamente.',
        )
        .setFooter({ text: config.branding.footerText })
        .setTimestamp()
      await member.send({ embeds: [dmEmbed] }).catch(() => {})
    }
  } catch (e) { /* DM fechada */ }

  // Atualiza embed
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor('#FF0000')
    .setTitle('❌ Setagem Recusada')
    .addFields({ name: '❌ Recusado por', value: `<@${interaction.user.id}>`, inline: true })

  await interaction.update({
    embeds: [updatedEmbed],
    components: [],
  })
}
