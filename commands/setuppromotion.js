const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js')
const { ActionReports, PrisonReports } = require('../database.js')
const { Op } = require('sequelize')
const { PermissionsBitField } = require('discord.js')
const { MessageFlags } = require('discord.js')
const path = require('path')
const config = require('../config')
const { attachImage } = require('../utils/attachImage')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setuppromotion')
    .setDescription('Cria um painel para solicitação de promoções.'),

  async execute(interaction) {
    // Verifica se o membro tem a permissão de Administrador ou o cargo permitido
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      ) &&
      !interaction.memberPermissions.has(
        PermissionsBitField.Flags.UseApplicationCommands,
      )
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }
    const promotionChannelId = config.channels.promocaoLog

    // Criando embed fixo
    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle('📄 Solicitação de Promoção')
      .setDescription(
        '> Para solicitar uma promoção, clique no botão abaixo.\n\n' +
          '📈 **Seu desempenho será analisado com base em sua atividade de patrulha, suas ações, apreensões e prisões registradas.**\n\n' +
          '*Aguarde a análise do alto comando após solicitar.*',
      )
      .setFooter({ text: `${config.branding.footerText} - Sistema de Promoções` })

    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    // Criando botão de solicitação
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('solicitar_promocao')
        .setLabel('⤴️ Solicitar Promoção')
        .setStyle(ButtonStyle.Secondary),
    )

    // Enviar embed fixo no canal específico
    const promotionChannel =
      interaction.guild.channels.cache.get(promotionChannelId)
    if (!promotionChannel) {
      return interaction.reply({
        content: '⚠️ Erro: Canal de promoções não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await promotionChannel.send({ embeds: [embed], components: [actionRow], files: [banner.attachment] })

    await interaction.reply({
      content: '✅ Painel de solicitação de promoção criado com sucesso!',
      flags: MessageFlags.Ephemeral,
    })
  },
}
