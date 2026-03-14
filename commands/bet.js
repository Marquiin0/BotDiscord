const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupbet')
    .setDescription('Cria o embed de apostas no canal configurado.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.guild.channels.cache.get(config.channels.bet)
    if (!channel) {
      return interaction.reply({
        content: '❌ Canal de apostas não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setTitle('🎲 Bet Mafiosa')
      .setDescription(
        `**Bem-vindo a Bet Mafiosa!**\n\n` +
        `Aqui você pode criar e participar de apostas usando seus **Pontos**.\n\n` +
        `**Como funciona:**\n` +
        `• Clique no botão abaixo para **criar uma nova aposta**\n` +
        `• Preencha a descrição, as duas opções e o horário de encerramento\n` +
        `• Outros membros poderão apostar nos botões da sua aposta\n` +
        `• Quando o horário chegar, a aposta fecha automaticamente\n` +
        `• Um administrador finaliza escolhendo o vencedor\n\n` +
        `**Aposte com responsabilidade!** 🎰`,
      )
      .setColor(config.branding.color)
      .setImage(config.branding.bannerUrl)
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bet_criar_aposta')
        .setLabel('Criar Aposta')
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Primary),
    )

    await channel.send({ embeds: [embed], components: [row] })

    await interaction.reply({
      content: `✅ Embed de apostas criado no canal <#${config.channels.bet}>!`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
