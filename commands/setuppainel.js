const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const path = require('path')
const config = require('../config')
const { attachImage } = require('../utils/attachImage')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setuppainel')
    .setDescription('Configura o painel principal de informações.'),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const channel = interaction.guild.channels.cache.get(config.channels.painelInfo)
    if (!channel) {
      return interaction.reply({
        content: '❌ Canal do painel não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📋 ${config.branding.name} - Painel Principal`)
      .setDescription(
        `Bem-vindo ao painel de informações!\n\n` +
        `Utilize os botões abaixo para acessar as funcionalidades disponíveis.\n\n` +
        `📊 **Minhas Informações** - Veja seus dados completos\n` +
        `⏰ **Ponto** - Consulte suas horas\n` +
        `🏅 **Pedir Promoção** - Solicite promoção\n` +
        `❌ **Pedir Exoneração** - Solicite exoneração\n` +
        `🏖️ **Pedir Aposentadoria** - Solicite aposentadoria\n` +
        `📝 **Cadastrar Ponto** - Cadastre-se no sistema\n` +
        `📸 **Fazer Identificação** - Envie sua foto de identificação`,
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('minhas_informacoes')
        .setLabel('📊 Minhas Informações')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('check_hours')
        .setLabel('⏰ Ponto')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('solicitar_promocao')
        .setLabel('🏅 Pedir Promoção')
        .setStyle(ButtonStyle.Success),
    )

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('solicitar_exoneracao')
        .setLabel('❌ Pedir Exoneração')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('solicitar_aposentadoria')
        .setLabel('🏖️ Pedir Aposentadoria')
        .setStyle(ButtonStyle.Secondary),
    )

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cadastrar_ponto')
        .setLabel('📝 Cadastrar Ponto')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('identificar_se')
        .setLabel('📸 Fazer Identificação')
        .setStyle(ButtonStyle.Secondary),
    )

    await channel.send({ embeds: [embed], components: [row1, row2, row3], files: [banner.attachment] })

    await interaction.reply({
      content: `✅ Painel principal criado no canal <#${config.channels.painelInfo}>!`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
