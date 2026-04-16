// comandos/sorteio.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js')
const { Sorteio } = require('../database') // ajuste o caminho conforme sua estrutura
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sorteio')
    .setDescription('Inicia um sorteio')
    .addStringOption(option =>
      option
        .setName('nome')
        .setDescription('Nome do sorteio')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('data')
        .setDescription('Data do sorteio (DD/MM/AAAA)')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('horario')
        .setDescription('Horário do sorteio (HH:MM)')
        .setRequired(true),
    )
    .addIntegerOption(option =>
      option
        .setName('ganhadores')
        .setDescription('Quantidade de ganhadores')
        .setRequired(true),
    )
    .addIntegerOption(option =>
      option
        .setName('pontos')
        .setDescription('Pontos para os ganhadores')
        .setRequired(true),
    ),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
      !interaction.member.roles.cache.hasAny(...config.permissions.hcPlus)
    ) {
      return interaction.reply({ content: '❌ Você não tem permissão.', flags: 64 })
    }
    const nome = interaction.options.getString('nome')
    const data = interaction.options.getString('data') // formato: DD/MM/AAAA
    const horario = interaction.options.getString('horario') // formato: HH:MM
    const ganhadores = interaction.options.getInteger('ganhadores')
    const pontos = interaction.options.getInteger('pontos')

    // Converter data e horário do formato pt-br para Date
    const [dia, mes, ano] = data.split('/')
    const [hora, minuto] = horario.split(':')
    const expirationDate = new Date(ano, mes - 1, dia, hora, minuto)

    if (isNaN(expirationDate.getTime())) {
      return interaction.reply({
        content:
          'Data ou horário inválido. Use o formato DD/MM/AAAA para data e HH:MM para horário.',
        flags: MessageFlags.Ephemeral,
      })
    }

    // Criar embed inicial com as informações do sorteio
    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle(`🎉 Sorteio: ${nome}`)
      .setDescription('**Participe do sorteio reagindo com 🎉 abaixo!**')
      .addFields(
        { name: '📅 Data', value: `${data}`, inline: true },
        { name: '⏰ Horário', value: `${horario}`, inline: true },
        { name: '🏆 Ganhadores', value: `${ganhadores}`, inline: true },
        { name: '💎 Pontos', value: `${pontos}`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: config.branding.footerText })

    // Criar botão "Sortear"
    const button = new ButtonBuilder()
      .setCustomId('sortear_PENDING') // placeholder; será atualizado
      .setLabel('Sortear')
      .setStyle(ButtonStyle.Primary)

    const row = new ActionRowBuilder().addComponents(button)

    // Enviar a mensagem e buscar a resposta enviada
    await interaction.reply({ embeds: [embed], components: [row] })
    const message = await interaction.fetchReply()

    // Criar registro do sorteio no banco
    const sorteio = await Sorteio.create({
      name: nome,
      expiration: expirationDate,
      winnersCount: ganhadores,
      messageId: message.id,
      channelId: message.channel.id,
      guildId: interaction.guild.id,
      isDrawn: false,
      points: pontos, // Certifique-se de que o modelo inclui o campo "points"
    })

    // Atualizar o botão para incluir o ID do sorteio na customId
    const updatedButton = ButtonBuilder.from(button).setCustomId(
      `sortear_${sorteio.raffleId}`,
    )
    const updatedRow = ActionRowBuilder.from(row).setComponents(updatedButton)
    await message.edit({ components: [updatedRow] })

    // Adicionar reação 🎉 para participação
    await message.react('🎉')
  },
}
