const {
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  AttachmentBuilder,
} = require('discord.js')
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { URL } = require('url')
const { Ticket, UserActions, UserPontos } = require('../database')
const config = require('../config')

function downloadAttachment(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const client = url.startsWith('https') ? https : http
    client
      .get(url, response => {
        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Falha ao baixar '${url}' (Status: ${response.statusCode})`,
            ),
          )
          return
        }
        response.pipe(file)
        file.on('finish', () => file.close(resolve))
      })
      .on('error', err => {
        fs.unlink(dest, () => {})
        reject(err)
      })
  })
}

// Todas as categorias de ticket usam a mesma categoria
const ticketCategoryId = config.categories.tickets

// Quem pode usar botões de ticket (assumir, finalizar, adicionar, remover, poke)
const staffRoles = config.permissions.rhPlus

const typeMap = {
  corregedoria: 'crg',
  alto_comando: 'alt',
  recrutamento: 'rec',
  duvidas: 'duv',
  donater: 'dnt',
  item_misterioso: 'mst',
}

const iconMap = {
  crg: '🔻',
  alt: '👑',
  rec: '🎫',
  duv: '📁',
  dnt: '✨',
  mst: '🎲',
}

function canUseTicketButtons(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true
  return staffRoles.some(roleId => member.roles.cache.has(roleId))
}

const counterFilePath = path.join(__dirname, 'ticketCounter.json')
function loadTicketCounter() {
  try {
    if (!fs.existsSync(counterFilePath)) {
      fs.writeFileSync(counterFilePath, JSON.stringify({ counter: 1 }, null, 2))
      return 1
    }
    const data = fs.readFileSync(counterFilePath, 'utf8')
    const json = JSON.parse(data)
    return json.counter
  } catch (err) {
    console.error('Erro ao carregar ticketCounter.json:', err)
    return 1
  }
}

function getNextTicketNumber() {
  const current = loadTicketCounter()
  const next = current + 1
  try {
    fs.writeFileSync(
      counterFilePath,
      JSON.stringify({ counter: next }, null, 2),
    )
  } catch (error) {
    console.error('Erro ao salvar ticketCounter.json:', error)
  }
  return current
}

function getCategoryIdForTipo() {
  return ticketCategoryId
}

function getExtraRolesForTipo(sigla) {
  // Dúvidas: RH+ (R.H, I.A, S.C, H.C, SCMD, CMD)
  if (sigla === 'duv') return config.permissions.rhPlus
  // Corregedoria: I.A+ (I.A, S.C, H.C, SCMD, CMD)
  if (sigla === 'crg') return config.permissions.iaPlus
  // Alto Comando: HC+ (H.C, SCMD, CMD)
  if (sigla === 'alt') return config.permissions.hcPlus
  // Recrutamento: FTO/RECS + RH+
  if (sigla === 'rec') return [...config.permissions.ftoRecs, ...config.permissions.rhPlus]
  // Donater: SCMD + CMD apenas
  if (sigla === 'dnt') return [config.ranks.SCMD.roleId, config.ranks.CMD.roleId]
  // Item Misterioso: SCMD + CMD apenas
  if (sigla === 'mst') return [config.ranks.SCMD.roleId, config.ranks.CMD.roleId]
  return []
}

function getTicketTypeFromName(channelName) {
  const parts = channelName.split('・')
  if (parts.length < 2) return 'Desconhecido'
  const ticketPart = parts[1]
  const sigla = (ticketPart.split('-')[0] || '').toLowerCase()
  if (sigla === 'crg') return 'Corregedoria'
  if (sigla === 'alt') return 'Alto Comando'
  if (sigla === 'rec') return 'Recrutamento'
  if (sigla === 'duv') return 'Dúvidas'
  if (sigla === 'dnt') return 'Donater'
  if (sigla === 'mst') return 'Item Misterioso'
  return 'Desconhecido'
}

async function replaceMentionsInContent(message) {
  let content = message.content
  if (message.mentions.users.size === 0) return content
  for (const [userId, user] of message.mentions.users) {
    const mentionRegex = new RegExp(`<@${userId}>`, 'g')
    const replacement = `<span class="mention">@${user.username}</span>`
    content = content.replace(mentionRegex, replacement)
  }
  return content
}

async function getReplyLine(message) {
  if (!message.reference?.messageId) return ''
  try {
    const repliedMsg = await message.channel.messages.fetch(
      message.reference.messageId,
    )
    if (!repliedMsg) return ''
    return `\n<span class="replyLine">↪️ Respondendo a <span class="mention">@${repliedMsg.author.username}</span></span>`
  } catch {
    return ''
  }
}

function getAttachmentHTML(attachment) {
  const ext = path.extname(attachment.url).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
    return `<br><span class="attachment"><img src="${attachment.url}" alt="imagem"></span>`
  }
  if (['.mp4', '.mov', '.webm'].includes(ext)) {
    return `<br><span class="attachment"><video src="${attachment.url}" controls></video></span>`
  }
  return `<br><span class="attachment"><a href="${attachment.url}" target="_blank">🔗 Baixar Anexo</a></span>`
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    const transcriptsPath = path.join(__dirname, '..', 'transcripts')
    if (!fs.existsSync(transcriptsPath)) {
      fs.mkdirSync(transcriptsPath, { recursive: true })
    }
    const createTicketButtons = [
      'ticket_corregedoria',
      'ticket_alto_comando',
      'ticket_recrutamento',
      'ticket_duvidas',
      'ticket_donater',
      'ticket_item_misterioso',
    ]
    if (
      interaction.isButton() &&
      createTicketButtons.includes(interaction.customId)
    ) {
      const tipo = interaction.customId.replace('ticket_', '')
      const modalId = `motivo_abertura_modal_${tipo}`
      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('Motivo da Abertura do Ticket')
      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_abertura')
        .setLabel('Descreva o motivo')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Por que está abrindo este ticket?')
        .setRequired(true)
      const row = new ActionRowBuilder().addComponents(motivoInput)
      modal.addComponents(row)
      await interaction.showModal(modal)
      return
    }
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('motivo_abertura_modal_')
    ) {
      // Adicionado defer para garantir resposta dentro do prazo
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const tipo = interaction.customId.replace('motivo_abertura_modal_', '')
      const reason = interaction.fields.getTextInputValue('motivo_abertura')
      const userId = interaction.user.id
      const existing = await Ticket.findOne({
        where: { userIdOpened: userId, status: 'aberto' },
      })
      if (existing) {
        return interaction.editReply({
          content:
            '❌ Você já possui um ticket em aberto. Finalize-o antes de abrir outro.',
          flags: MessageFlags.Ephemeral,
        })
      }
      const sigla = typeMap[tipo] || 'tck'
      const userName = interaction.user.username.toLowerCase()
      const ticketNumber = getNextTicketNumber()
      const sufix = ticketNumber.toString().padStart(3, '0')
      const shortTicketName = `${sigla}-${userName}-${sufix}`
      const icon = iconMap[sigla] || ''
      const channelName = `${icon}・${shortTicketName}`
      const categoryId = getCategoryIdForTipo()
      const overwrites = [
        {
          id: interaction.guild.roles.everyone,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
      ]
      const extraRoles = getExtraRolesForTipo(sigla)
      for (const r of extraRoles) {
        overwrites.push({
          id: r,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        })
      }
      const ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: 0,
        parent: categoryId,
        topic: `${userId}|`,
        permissionOverwrites: overwrites,
      })
      try {
        console.log('[Criar] Salvando no DB ticketIdentifier=', shortTicketName)
        await Ticket.create({
          ticketIdentifier: shortTicketName,
          userIdOpened: userId,
          status: 'aberto',
        })
      } catch (dbErr) {
        console.error('Erro ao criar ticket no DB:', dbErr)
      }
      const embed = new EmbedBuilder()
        .setTitle(`🎟 Novo Ticket Aberto - ${sigla.toUpperCase()}`)
        .setDescription(
          `Olá, <@${userId}>!\n\n` +
            `**Identificador:** \`${shortTicketName}\`\n\n` +
            `**Motivo da Abertura:**\n\`\`\`\n${reason}\n\`\`\`\n` +
            `👮 **Assumido por:** *(ninguém)*\n`,
        )
        .setColor(0x0099ff)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Ticket #${sufix}` })
        .setTimestamp()
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`assumir_${ticketChannel.id}`)
          .setLabel('👮 Assumir')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`adicionar_${ticketChannel.id}`)
          .setLabel('➕ Adicionar Usuário')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`remover_${ticketChannel.id}`)
          .setLabel('➖ Remover Usuário')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`finalizar_${ticketChannel.id}`)
          .setLabel('❌ Finalizar')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`poke_${ticketChannel.id}`)
          .setLabel('🔔 Poke Dono')
          .setStyle(ButtonStyle.Secondary),
      )
      const ticketMsg = await ticketChannel.send({
        content: `<@${userId}>`,
        embeds: [embed],
        components: [row],
      })
      await ticketChannel.setTopic(`${userId}|${ticketMsg.id}`)
      // Log de ticket aberto na guild de logs
      try {
        const logGuild = interaction.client.guilds.cache.get(config.guilds.logs) ||
          await interaction.client.guilds.fetch(config.guilds.logs).catch(() => null)
        if (logGuild) {
          const logChannel = logGuild.channels.cache.get(config.logsChannels.ticket) ||
            await logGuild.channels.fetch(config.logsChannels.ticket).catch(() => null)
          if (logChannel && logChannel.isTextBased()) {
            const embedOpenLog = new EmbedBuilder()
              .setColor(0x0099ff)
              .setTitle('🎟 Ticket Aberto')
              .addFields(
                { name: '👤 Usuário', value: `<@${userId}>`, inline: true },
                { name: '📁 Tipo', value: sigla.toUpperCase(), inline: true },
                { name: '📝 Motivo', value: `\`\`\`\n${reason}\n\`\`\``, inline: false },
                { name: '📌 Canal', value: `<#${ticketChannel.id}>`, inline: true },
              )
              .setFooter({ text: config.branding.footerText })
              .setTimestamp()
            await logChannel.send({ embeds: [embedOpenLog] })
          }
        }
      } catch (err) {
        console.error('Erro ao enviar log de ticket aberto:', err)
      }

      return interaction.editReply({
        content: `✅ Ticket criado com sucesso!\nCanal: ${ticketChannel}\nID: \`${shortTicketName}\``,
        flags: MessageFlags.Ephemeral,
      })
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('adicionar_usuario_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const { guild, member } = interaction
        const ticketChannel = interaction.channel
        const userId = interaction.fields.getTextInputValue('user_id').trim()
        if (!canUseTicketButtons(member)) {
          return interaction.editReply({
            content:
              '❌ Você não tem permissão para adicionar usuários neste ticket.',
            flags: MessageFlags.Ephemeral,
          })
        }
        try {
          const userToAdd = await guild.members.fetch(userId)
          await ticketChannel.permissionOverwrites.edit(userToAdd.id, {
            ViewChannel: true,
            SendMessages: true,
          })
          await userToAdd.send(
            `📩 Você foi adicionado(a) ao ticket **${ticketChannel.name}**!\nClique para acessar: <#${ticketChannel.id}>`,
          )
          const embedAdd = new EmbedBuilder()
            .setAuthor({
              name: userToAdd.user.tag,
              iconURL: userToAdd.user.displayAvatarURL(),
            })
            .setTitle('Usuário Adicionado')
            .setDescription(
              `**${userToAdd}** foi adicionado(a) a este ticket por **${member}**!`,
            )
            .setColor(0x00ff00)
            .setTimestamp()
          await ticketChannel.send({ embeds: [embedAdd] })
          return interaction.editReply({
            content: `✅ ${userToAdd} foi adicionado(a) ao ticket.`,
          })
        } catch (err) {
          console.error('Erro ao adicionar usuário:', err)
          return interaction.editReply({
            content: '❌ Usuário não encontrado ou erro ao adicioná-lo.',
            flags: MessageFlags.Ephemeral,
          })
        }
      }
      if (interaction.customId.startsWith('remover_usuario_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const { guild, member } = interaction
        const ticketChannel = interaction.channel
        const userId = interaction.fields.getTextInputValue('user_id').trim()
        if (!canUseTicketButtons(member)) {
          return interaction.editReply({
            content:
              '❌ Você não tem permissão para remover usuários neste ticket.',
            flags: MessageFlags.Ephemeral,
          })
        }
        try {
          const userToRemove = await guild.members.fetch(userId)
          await ticketChannel.permissionOverwrites.edit(userToRemove.id, {
            ViewChannel: false,
            SendMessages: false,
          })
          try {
            await userToRemove.send(
              `⚠️ Você foi removido(a) do ticket **${ticketChannel.name}** pelo(a) **${member.user.tag}**.`,
            )
          } catch (dmErr) {
            console.error(
              'Não foi possível enviar DM ao usuário removido:',
              dmErr,
            )
          }
          const embedRemove = new EmbedBuilder()
            .setAuthor({
              name: userToRemove.user.tag,
              iconURL: userToRemove.user.displayAvatarURL(),
            })
            .setTitle('Usuário Removido')
            .setDescription(
              `**${userToRemove}** foi removido(a) deste ticket por **${member}**!`,
            )
            .setColor(0xff0000)
            .setTimestamp()
          await ticketChannel.send({ embeds: [embedRemove] })
          return interaction.editReply({
            content: `✅ ${userToRemove} foi removido(a) do ticket.`,
          })
        } catch (err) {
          console.error('Erro ao remover usuário:', err)
          return interaction.editReply({
            content: '❌ Usuário não encontrado ou erro ao removê-lo.',
            flags: MessageFlags.Ephemeral,
          })
        }
      }
      if (interaction.customId.startsWith('motivo_finalizacao_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const channelId = interaction.customId.replace(
          'motivo_finalizacao_modal_',
          '',
        )
        const channel = interaction.guild.channels.cache.get(channelId)
        if (!channel) {
          return interaction.editReply({
            content: '❌ Canal do ticket não encontrado.',
            flags: MessageFlags.Ephemeral,
          })
        }
        if (!canUseTicketButtons(interaction.member)) {
          return interaction.editReply({
            content: '❌ Você não tem permissão para finalizar este ticket.',
            flags: MessageFlags.Ephemeral,
          })
        }
        const motivo =
          interaction.fields.getTextInputValue('motivo_finalizacao')
        const finalizadoPor = interaction.user
        const msgs = await channel.messages.fetch({ limit: 100 })
        const sorted = msgs.sort(
          (a, b) => a.createdTimestamp - b.createdTimestamp,
        )
        let transcriptHTML = `
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Transcript de ${channel.name}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #1e1e1e; color: #f1f1f1; margin: 0; padding: 20px; }
            h1 { text-align: center; margin-bottom: 20px; color: #4fc3f7; }
            .message { display: flex; padding: 15px; border-bottom: 1px solid #333; transition: background 0.3s; }
            .message:hover { background: rgba(255, 255, 255, 0.05); }
            .avatar { width: 50px; height: 50px; border-radius: 50%; margin-right: 15px; }
            .message-content { flex: 1; }
            .author { font-weight: bold; font-size: 1.1em; }
            .timeinfo { font-size: 0.85em; color: #aaa; margin-left: 10px; }
            .embeds { margin-top: 10px; }
            .embed { background-color: #2e2e2e; border-left: 5px solid #4fc3f7; padding: 10px; margin-bottom: 8px; border-radius: 4px; }
            .embed strong { color: #4fc3f7; }
            .embed em { color: #ccc; }
            .attachment img, .attachment video { max-width: 40%; margin-top: 5px; border-radius: 5px; }
            .btn { display: inline-block; padding: 8px 12px; margin-top: 10px; background-color: #4fc3f7; color: #1e1e1e; text-decoration: none; border-radius: 4px; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Transcript de ${channel.name}</h1>
      `
        for (const m of sorted.values()) {
          const avatarURL = m.author.displayAvatarURL()
          const msgDate = new Date(m.createdTimestamp).toLocaleString('pt-BR')
          const contentWithMentions = await replaceMentionsInContent(m)
          const replyLine = await getReplyLine(m)
          let messageHTML = `
            <div class="message">
              <img src="${avatarURL}" class="avatar"/>
              <div class="message-content">
                <div>
                  <span class="author">${m.author.tag}</span>
                  <span class="timeinfo">(${msgDate})</span>
                </div>
                <div>
                  ${contentWithMentions}
                  ${replyLine}
                </div>
          `
          function markdownToHTML(text) {
            if (!text) return text
            text = text.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>')
            text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
            text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            text = text.replace(/\*(.*?)\*/g, '<em>$1</em>')
            return text
          }
          async function replaceEmbedMentions(text, guild) {
            const regex = /<@!?(\d+)>/g
            let match
            while ((match = regex.exec(text)) !== null) {
              const userId = match[1]
              try {
                const member = await guild.members.fetch(userId)
                if (member) {
                  text = text.replace(
                    match[0],
                    `<span class="mention">${member.user.username}</span>`,
                  )
                }
              } catch (e) {}
            }
            return text
          }
          if (m.embeds.length > 0) {
            messageHTML += `<div class="embeds">`
            for (const embed of m.embeds) {
              messageHTML += `<div class="embed">`
              if (embed.title) {
                let titleHTML = markdownToHTML(embed.title)
                titleHTML = await replaceEmbedMentions(titleHTML, channel.guild)
                messageHTML += `<p class="embed-title"><strong>${titleHTML}</strong></p>`
              }
              if (embed.description) {
                let desc = markdownToHTML(embed.description)
                desc = await replaceEmbedMentions(desc, channel.guild)
                const lines = desc.split(/\n+/)
                lines.forEach(line => {
                  if (line.trim()) {
                    messageHTML += `<p>${line.trim()}</p>`
                  }
                })
              }
              if (embed.fields && embed.fields.length > 0) {
                for (const field of embed.fields) {
                  let fieldName = markdownToHTML(field.name)
                  fieldName = await replaceEmbedMentions(
                    fieldName,
                    channel.guild,
                  )
                  let fieldValue = markdownToHTML(field.value)
                  fieldValue = await replaceEmbedMentions(
                    fieldValue,
                    channel.guild,
                  )
                  messageHTML += `<p class="embed-field"><strong>${fieldName}:</strong> ${fieldValue}</p>`
                }
              }
              messageHTML += `</div>`
            }
            messageHTML += `</div>`
          }
          let attachHTML = ''
          if (m.attachments.size > 0) {
            for (const att of m.attachments.values()) {
              const parsedUrl = new URL(att.url)
              const ext = path.extname(parsedUrl.pathname).toLowerCase()
              const localAttachmentDir = path.join(
                transcriptsPath,
                'attachments',
              )
              if (!fs.existsSync(localAttachmentDir)) {
                fs.mkdirSync(localAttachmentDir, { recursive: true })
              }
              const localFilename = `${m.id}-${att.id}${ext}`
              const localFilePath = path.join(localAttachmentDir, localFilename)
              try {
                await downloadAttachment(att.url, localFilePath)
                if (['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
                  attachHTML += `<br><span class="attachment"><img src="./attachments/${localFilename}" alt="imagem"></span>`
                } else if (['.mp4', '.mov', '.webm'].includes(ext)) {
                  attachHTML += `<br><span class="attachment"><video src="./attachments/${localFilename}" controls></video></span>`
                } else {
                  attachHTML += `<br><span class="attachment"><a href="./attachments/${localFilename}" target="_blank">🔗 Baixar Anexo</a></span>`
                }
              } catch (err) {
                console.error('Erro ao baixar anexo:', err)
                if (['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
                  attachHTML += `<br><span class="attachment"><img src="${att.url}" alt="imagem"></span>`
                } else if (['.mp4', '.mov', '.webm'].includes(ext)) {
                  attachHTML += `<br><span class="attachment"><video src="${att.url}" controls></video></span>`
                } else {
                  attachHTML += `<br><span class="attachment"><a href="${att.url}" target="_blank">🔗 Baixar Anexo</a></span>`
                }
              }
            }
          }
          messageHTML += attachHTML
          messageHTML += `</div></div>`
          transcriptHTML += messageHTML
        }
        const targetGuildId = config.guilds.logs
        const transcriptsChannelId = config.logsChannels.ticket

        transcriptHTML += `</body></html>`

        const uniqueId = `${channel.id}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
        const transcriptFileName = `transcript-${channel.name.split('・')[1] || 'ticket'}.html`

        // Salvar arquivo localmente também
        const transcriptFilePath = path.join(transcriptsPath, `${uniqueId}.html`)
        fs.writeFileSync(transcriptFilePath, transcriptHTML)

        const transcriptEmbed = new EmbedBuilder()
          .setTitle('📜 Transcript do Ticket')
          .setDescription('O transcript está anexado como arquivo abaixo. Baixe e abra no navegador para visualizar.')
          .addFields(
            { name: 'Nome do Ticket', value: channel.name, inline: true },
            { name: 'Motivo', value: motivo, inline: true },
            {
              name: 'Finalizado por',
              value: `<@${finalizadoPor.id}>`,
              inline: true,
            },
            {
              name: 'Tipo',
              value: getTicketTypeFromName(channel.name),
              inline: true,
            },
          )
          .setColor(0x0099ff)
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()

        // Criar attachment direto do buffer para evitar problemas de path
        const transcriptBuffer = Buffer.from(transcriptHTML, 'utf-8')
        const transcriptAttachment = new AttachmentBuilder(transcriptBuffer, {
          name: transcriptFileName,
          description: `Transcript do ticket ${channel.name}`,
        })

        // busca a guild e o canal corretos, mesmo que o ticket esteja em outra guild
        const targetGuild = interaction.client.guilds.cache.get(targetGuildId)
        const transcriptsChannel =
          targetGuild?.channels.cache.get(transcriptsChannelId)

        if (transcriptsChannel) {
          await transcriptsChannel.send({
            embeds: [transcriptEmbed],
            files: [transcriptAttachment],
          })
        }
        const ticketId = channel.name.split('・')[1].toLowerCase()
        const [rowsFinal] = await Ticket.update(
          {
            userIdResolved: finalizadoPor.id,
            dateResolved: new Date(),
            status: 'resolvido',
          },
          {
            where: { ticketIdentifier: ticketId },
          },
        )
        console.log('[Finalizar] rows atualizados:', rowsFinal)
        const rewardPoints = 10
        let totalPoints = 0
        try {
          await UserActions.create({
            userId: finalizadoPor.id,
            id_tipo: 'ticket',
            nome_tipo: 'Ticket Finalizado',
            pontos: rewardPoints,
            multiplicador: 1,
            pontosRecebidos: rewardPoints,
          })
          const [userPontos, created] = await UserPontos.findOrCreate({
            where: { userId: finalizadoPor.id },
            defaults: { pontos: 0 },
          })
          userPontos.pontos += rewardPoints
          await userPontos.save()
          totalPoints = userPontos.pontos
        } catch (pointsError) {
          console.error('Erro ao atualizar pontos:', pointsError)
        }
        let finalizador
        try {
          finalizador = await interaction.guild.members.fetch(finalizadoPor.id)
        } catch {
          finalizador = null
        }
        if (finalizador) {
          const embedDm = new EmbedBuilder()
            .setTitle('Você finalizou um ticket!')
            .setDescription(
              `**Ticket:** ${channel.name}\n` +
                `**Motivo:** \`\`\`\n${motivo}\n\`\`\`\n`,
            )
            .setColor(0xff0000)
            .setTimestamp()
          try {
            await finalizador.send({ embeds: [embedDm] })
          } catch (e) {
            console.error('Não foi possível enviar DM ao finalizador:', e)
          }
        }
        await interaction.editReply({
          content:
            '✅ Ticket finalizado com sucesso. O canal será fechado em 2 segundos...',
        })
        setTimeout(() => channel.delete().catch(() => {}), 2000)
      }
      return
    }
    if (!interaction.isButton()) return
    const { guild, user, member, customId } = interaction
    if (customId.startsWith('adicionar_')) {
      if (!canUseTicketButtons(member)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para usar este botão.',
          flags: MessageFlags.Ephemeral,
        })
      }
      const uniqueModalId = `adicionar_usuario_modal_${interaction.channel.id}`
      const modal = new ModalBuilder()
        .setCustomId(uniqueModalId)
        .setTitle('Adicionar Usuário ao Ticket')
      const userIdInput = new TextInputBuilder()
        .setCustomId('user_id')
        .setLabel('ID do Usuário')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
      const rowModal = new ActionRowBuilder().addComponents(userIdInput)
      modal.addComponents(rowModal)
      return interaction.showModal(modal)
    }
    if (customId.startsWith('remover_')) {
      if (!canUseTicketButtons(member)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para usar este botão.',
          flags: MessageFlags.Ephemeral,
        })
      }
      const uniqueModalId = `remover_usuario_modal_${interaction.channel.id}`
      const modal = new ModalBuilder()
        .setCustomId(uniqueModalId)
        .setTitle('Remover Usuário do Ticket')
      const userIdInput = new TextInputBuilder()
        .setCustomId('user_id')
        .setLabel('ID do Usuário')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
      const rowModal = new ActionRowBuilder().addComponents(userIdInput)
      modal.addComponents(rowModal)
      return interaction.showModal(modal)
    }
    if (customId.startsWith('poke_')) {
      if (!canUseTicketButtons(member)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para usar este botão.',
          flags: MessageFlags.Ephemeral,
        })
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const ticketChannel = interaction.channel
      const [ownerId] = ticketChannel.topic?.split('|') || []
      if (!ownerId) {
        return interaction.editReply({
          content:
            '❌ Não foi possível identificar o dono do ticket (topic vazia).',
          flags: MessageFlags.Ephemeral,
        })
      }
      try {
        const dono = await guild.members.fetch(ownerId)
        await dono.send(
          `🔔 Você foi chamado(a) no ticket **${ticketChannel.name}**!\nClique para ver: <#${ticketChannel.id}>`,
        )
        return interaction.editReply({
          content: '✅ Dono do ticket notificado via DM!',
          flags: MessageFlags.Ephemeral,
        })
      } catch (err) {
        console.error('Erro ao pokar dono:', err)
        return interaction.editReply({
          content: '❌ Falha ao enviar DM ao dono.',
          flags: MessageFlags.Ephemeral,
        })
      }
    }
    if (customId.startsWith('assumir_')) {
      if (!canUseTicketButtons(member)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para usar este botão.',
          flags: MessageFlags.Ephemeral,
        })
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const channel = interaction.channel
      const [ownerId, msgId] = channel.topic?.split('|') || []
      try {
        const ticketMsg = msgId ? await channel.messages.fetch(msgId) : null
        if (ticketMsg) {
          const embed = ticketMsg.embeds[0]
          if (
            embed &&
            embed.description &&
            !embed.description.includes('*(ninguém)*')
          ) {
            const oldComponents = ticketMsg.components[0]?.components || []
            const newComponents = oldComponents.map(btn => {
              if (btn.customId === `assumir_${channel.id}`) {
                return ButtonBuilder.from(btn)
                  .setDisabled(true)
                  .setLabel('Assumido')
              }
              return btn
            })
            await ticketMsg.edit({
              components: [new ActionRowBuilder().addComponents(newComponents)],
            })
            return interaction.editReply({
              content: 'Este ticket já foi assumido por alguém.',
              flags: MessageFlags.Ephemeral,
            })
          }
        }
        if (ticketMsg && ticketMsg.embeds.length > 0) {
          const embed = ticketMsg.embeds[0]
          let desc = embed.description || ''
          if (desc.includes('*(ninguém)*')) {
            desc = desc.replace('*(ninguém)*', `<@${interaction.user.id}>`)
          }
          const newEmbed = EmbedBuilder.from(embed).setDescription(desc)
          const oldComponents = ticketMsg.components[0]?.components || []
          const newComponents = oldComponents.map(btn => {
            if (btn.customId === `assumir_${channel.id}`) {
              return ButtonBuilder.from(btn)
                .setDisabled(true)
                .setLabel('Assumido')
            }
            return btn
          })
          await ticketMsg.edit({
            embeds: [newEmbed],
            components: [new ActionRowBuilder().addComponents(newComponents)],
          })
        }
        const ticketId = channel.name.split('・')[1].toLowerCase()
        const [rowsAssumed] = await Ticket.update(
          { userIdAssumed: interaction.user.id },
          { where: { ticketIdentifier: ticketId } },
        )
        console.log('[Assumir] Rows assumidos:', rowsAssumed)

        // Log de ticket assumido na guild de logs
        try {
          const logGuild = interaction.client.guilds.cache.get(config.guilds.logs) ||
            await interaction.client.guilds.fetch(config.guilds.logs).catch(() => null)
          if (logGuild) {
            const logChannel = logGuild.channels.cache.get(config.logsChannels.ticket) ||
              await logGuild.channels.fetch(config.logsChannels.ticket).catch(() => null)
            if (logChannel && logChannel.isTextBased()) {
              const embedAssumeLog = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle('👮 Ticket Assumido')
                .addFields(
                  { name: '🎟 Ticket', value: channel.name, inline: true },
                  { name: '👮 Assumido por', value: `<@${interaction.user.id}>`, inline: true },
                )
                .setFooter({ text: config.branding.footerText })
                .setTimestamp()
              await logChannel.send({ embeds: [embedAssumeLog] })
            }
          }
        } catch (err) {
          console.error('Erro ao enviar log de ticket assumido:', err)
        }

        return interaction.editReply({
          content: '✅ Você assumiu este ticket!',
          flags: MessageFlags.Ephemeral,
        })
      } catch (err) {
        console.error('Erro ao assumir ticket:', err)
        return interaction.editReply({
          content: '❌ Não foi possível assumir o ticket.',
          flags: MessageFlags.Ephemeral,
        })
      }
    }
    if (customId.startsWith('finalizar_')) {
      if (!canUseTicketButtons(member)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para usar este botão.',
          flags: MessageFlags.Ephemeral,
        })
      }
      const channelId = interaction.channel.id
      const modal = new ModalBuilder()
        .setCustomId(`motivo_finalizacao_modal_${channelId}`)
        .setTitle('Finalizar Ticket - Motivo')
      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_finalizacao')
        .setLabel('Por qual motivo está finalizando este ticket?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Descreva aqui...')
      const rowModal = new ActionRowBuilder().addComponents(motivoInput)
      modal.addComponents(rowModal)
      return interaction.showModal(modal)
    }
  },
}
