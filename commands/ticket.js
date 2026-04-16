// File: slashCriarTicket.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js')
const { PermissionsBitField } = require('discord.js')
const { MessageFlags } = require('discord.js')
const path = require('path')
const config = require('../config')
const { attachImage } = require('../utils/attachImage')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('criarticket')
    .setDescription('Cria um painel para abertura de tickets'),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      ) &&
      !interaction.member.roles.cache.hasAny(...config.permissions.hcPlus)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setTitle(`📩 Tickets ${config.branding.name}`)
      .setDescription(
        'Selecione abaixo o tipo de ticket que deseja abrir. \nCada ticket permite tratar um assunto específico:',
      )
      .addFields(
        {
          name: '🛂 Corregedoria',
          value:
            'Use este ticket para assuntos internos, denúncias e solicitação de exoneração',
        },
        {
          name: '🚨 Alto Comando',
          value:
            'Ticket reservado para assuntos voltados ao comando da polícia e, também, para a compra de ✨ Donater.',
        },
        {
          name: '📋 Recrutamento',
          value:
            'Abra aqui para processos de recrutamento, promoções ou transferências.',
        },
        {
          name: '❓ Dúvidas',
          value: 'Use este ticket para tirar dúvidas gerais.',
        },
        {
          name: '👑 Donater',
          value: 'Use este ticket para doações ou compras de ✨ Donater',
        },
        {
          name: '🎲 Item Misterioso',
          value: 'Ticket aberto automaticamente ao comprar o Item Misterioso na loja.',
        },
      )
      .setColor('#FFFFFF')
      .setFooter({
        text: 'Escolha o ticket que melhor se encaixa na sua necessidade.',
      })
      .setTimestamp()

    // Cria 5 botões: corregedoria, alto_comando, recrutamento, duvidas, porte_armas
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_corregedoria')
        .setLabel('🛂 Corregedoria')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId('ticket_alto_comando')
        .setLabel('🚨 Alto Comando')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('ticket_recrutamento')
        .setLabel('📋 Recrutamento')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('ticket_duvidas')
        .setLabel('❓ Dúvidas')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('ticket_donater')
        .setLabel('👑 Donater')
        .setStyle(ButtonStyle.Secondary),
    )

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_item_misterioso')
        .setLabel('🎲 Item Misterioso')
        .setStyle(ButtonStyle.Secondary),
    )

    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    // Envia o painel público (embed + botões)
    await interaction.channel.send({ embeds: [embed], components: [row, row2], files: [banner.attachment] })

    // Responde ao slash command de forma ephemeral
    await interaction.reply({
      content: '✅ Painel de tickets criado com sucesso!',
      flags: MessageFlags.Ephemeral,
    })
  },
}
