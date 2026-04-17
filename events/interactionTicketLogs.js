const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js')
const fs = require('fs')
const path = require('path')
const config = require('../config')

const counterFilePath = path.join(__dirname, 'ticketFtoCounter.json')

function loadCounter() {
  try {
    if (!fs.existsSync(counterFilePath)) {
      fs.writeFileSync(counterFilePath, JSON.stringify({ counter: 1 }, null, 2))
      return 1
    }
    return JSON.parse(fs.readFileSync(counterFilePath, 'utf8')).counter
  } catch { return 1 }
}

function getNextNumber() {
  const current = loadCounter()
  try { fs.writeFileSync(counterFilePath, JSON.stringify({ counter: current + 1 }, null, 2)) } catch {}
  return current
}

function canManageTicket(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true
  return config.permissions.rhPlus.some(r => member.roles.cache.has(r))
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (interaction.guild?.id !== config.guilds.logs) return

    // ==================== BOTÃO ABRIR TICKET FTO ====================
    if (interaction.isButton() && interaction.customId === 'ticket_fto_abrir') {
      const modal = new ModalBuilder()
        .setCustomId('modal_ticket_fto')
        .setTitle('Abrir Ticket')

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_ticket_fto')
        .setLabel('Descreva o motivo')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Por que está abrindo este ticket?')
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(motivoInput))
      return interaction.showModal(modal)
    }

    // ==================== MODAL TICKET FTO ====================
    if (interaction.isModalSubmit() && interaction.customId === 'modal_ticket_fto') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const reason = interaction.fields.getTextInputValue('motivo_ticket_fto')
      const userId = interaction.user.id
      const ticketNumber = getNextNumber()
      const sufix = ticketNumber.toString().padStart(3, '0')
      const channelName = `🎟・ticket-${interaction.user.username}-${sufix}`

      const overwrites = [
        { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ]
      for (const roleId of config.permissions.rhPlus) {
        overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })
      }

      let ticketChannel
      try {
        ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: config.categories.ticketsLogs,
          permissionOverwrites: overwrites,
        })
      } catch (err) {
        console.error('Erro ao criar canal de ticket FTO:', err)
        return interaction.editReply({ content: '❌ Erro ao criar o ticket.' })
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎟 Ticket Aberto - #${sufix}`)
        .setDescription(
          `Olá, <@${userId}>!\n\n` +
          `**Motivo:**\n\`\`\`\n${reason}\n\`\`\`\n` +
          `👮 **Assumido por:** *(ninguém)*`,
        )
        .setColor(config.branding.color)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Ticket #${sufix}` })
        .setTimestamp()

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fto_assumir_${ticketChannel.id}`).setLabel('👮 Assumir').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fto_finalizar_${ticketChannel.id}`).setLabel('❌ Finalizar').setStyle(ButtonStyle.Danger),
      )

      const ticketMsg = await ticketChannel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] })
      await ticketChannel.setTopic(`${userId}|${ticketMsg.id}`)

      return interaction.editReply({ content: `✅ Ticket criado: ${ticketChannel}` })
    }

    // ==================== ASSUMIR TICKET FTO ====================
    if (interaction.isButton() && interaction.customId.startsWith('fto_assumir_')) {
      if (!canManageTicket(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', flags: MessageFlags.Ephemeral })
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const [ownerId, msgId] = interaction.channel.topic?.split('|') || []
      try {
        const ticketMsg = msgId ? await interaction.channel.messages.fetch(msgId) : null
        if (ticketMsg && ticketMsg.embeds[0]) {
          let desc = ticketMsg.embeds[0].description || ''
          if (desc.includes('*(ninguém)*')) {
            desc = desc.replace('*(ninguém)*', `<@${interaction.user.id}>`)
          }
          const newEmbed = EmbedBuilder.from(ticketMsg.embeds[0]).setDescription(desc)
          const oldBtns = ticketMsg.components[0]?.components || []
          const newBtns = oldBtns.map(btn => {
            if (btn.customId?.startsWith('fto_assumir_')) return ButtonBuilder.from(btn).setDisabled(true).setLabel('Assumido')
            return btn
          })
          await ticketMsg.edit({ embeds: [newEmbed], components: [new ActionRowBuilder().addComponents(newBtns)] })
        }
      } catch (err) { console.error('Erro ao assumir ticket FTO:', err) }

      return interaction.editReply({ content: '✅ Ticket assumido!' })
    }

    // ==================== FINALIZAR TICKET FTO ====================
    if (interaction.isButton() && interaction.customId.startsWith('fto_finalizar_')) {
      if (!canManageTicket(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', flags: MessageFlags.Ephemeral })
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_finalizar_fto_${interaction.channel.id}`)
        .setTitle('Finalizar Ticket')

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_finalizar_fto')
        .setLabel('Motivo da finalização')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(motivoInput))
      return interaction.showModal(modal)
    }

    // ==================== MODAL FINALIZAR TICKET FTO ====================
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_finalizar_fto_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const motivo = interaction.fields.getTextInputValue('motivo_finalizar_fto')

      await interaction.editReply({ content: '✅ Ticket finalizado. Canal será fechado em 2 segundos...' })
      setTimeout(() => interaction.channel.delete().catch(() => {}), 2000)
    }
  },
}
