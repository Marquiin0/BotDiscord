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
    .setName('setupcursomaa')
    .setDescription('Configura o embed do Curso MAA no canal.'),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const channel = interaction.guild.channels.cache.get(config.cursoMAA.channelId)
    if (!channel) {
      return interaction.reply({
        content: '❌ Canal do curso MAA não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📚 Central de Cursos ${config.branding.name}`)
      .setDescription(
        `Bem-vindo à central de cursos.\n\n` +
        `Você tem a opção de escolher o curso necessário por meio dos botões disponíveis abaixo.\n\n` +
        `⚠️ **Atenção:** Tentar contornar o sistema e pular as perguntas resultará em sérias penalidades registradas na corregedoria.\n\n` +
        `**CURSO MAA - Modulação, Abordagem e Acompanhamento**\n` +
        `• ${config.cursoMAA.totalPerguntas} perguntas de múltipla escolha\n` +
        `• Necessário acertar ${config.cursoMAA.acertosNecessarios}/${config.cursoMAA.totalPerguntas}\n` +
        `• Tempo limite: 30 minutos\n` +
        `• Ao ser aprovado, você receberá o cargo de Curso MAA`,
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('📖 Material de Estudo')
        .setStyle(ButtonStyle.Link)
        .setURL(config.cursoMAA.siteUrl),
      new ButtonBuilder()
        .setCustomId('iniciar_quiz_maa')
        .setLabel('📝 Iniciar Questionário')
        .setStyle(ButtonStyle.Primary),
    )

    await channel.send({ embeds: [embed], components: [buttons], files: [banner.attachment] })

    await interaction.reply({
      content: `✅ Embed do Curso MAA criado no canal <#${config.cursoMAA.channelId}>!`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
