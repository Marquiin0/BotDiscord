const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} = require('discord.js')
const { v4: uuidv4 } = require('uuid')
const { Course } = require('../database')
const { MessageFlags } = require('discord.js')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('curso')
    .setDescription('Cria um embed para inscrição de um curso.')
    .addStringOption(option =>
      option.setName('nome').setDescription('Nome do curso').setRequired(true),
    )
    .addStringOption(option =>
      option.setName('data').setDescription('Data do curso').setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('horario')
        .setDescription('Horário do curso')
        .setRequired(true),
    )
    .addIntegerOption(option =>
      option
        .setName('vagas')
        .setDescription('Quantidade de vagas disponíveis')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('local')
        .setDescription('Local onde o curso será aplicado')
        .setRequired(true),
    ),

  async execute(interaction) {
    // Verifica permissão: cargos de instrutor ou administrador
    const allowedRoles = config.permissions.curso
    const hasRole = allowedRoles.some(roleId => interaction.member.roles.cache.has(roleId))
    const hasAdmin = interaction.member.permissions.has('Administrator')

    if (!hasRole && !hasAdmin) {
      return interaction.reply({
        content: '❌ Você não tem permissão para criar cursos.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const courseId = uuidv4()

    const nome = interaction.options.getString('nome')
    const data = interaction.options.getString('data')
    const horario = interaction.options.getString('horario')
    const vagas = interaction.options.getInteger('vagas')
    const local = interaction.options.getString('local')

    const instrutorId = interaction.user.id // Quem criou o comando é o instrutor

    // Cria registro (messageId e channelId serão definidos após enviar a mensagem)
    await Course.create({
      courseId,
      nome,
      data,
      horario,
      local,
      vagas,
      messageId: null,
      channelId: null,
    })

    // Responde ephemeral confirmando criação
    await interaction.reply({
      content: `✅ O curso **${nome}** foi criado com sucesso!`,
      flags: MessageFlags.Ephemeral,
    })

    // Monta embed inicial
    const embed = new EmbedBuilder()
      .setTitle(`📚 Inscrições Abertas – ${nome}`)
      .setDescription(
        `Olá, recruta! Para participar do curso **${nome}**:\n\n` +
          `> **🗓 Data:** ${data}\n` +
          `> **🕒 Horário:** ${horario}\n` +
          `> **📍 Local:** ${local}\n` +
          `> **🎫 Vagas:** 0 / ${vagas}\n\n` +
          `**💰 Valor:** R$ 100.000 ingame → PIX: GNSPolice\n` +
          `**Instrutor responsável:** <@${instrutorId}>\n\n` +
          `*Apenas oficiais aptos receberão a tag do curso.\n` +
          `Evitar brincadeiras e atitudes inadequadas.\n` +
          `Todas as etapas práticas devem ser cumpridas, caso contrário perderá o direito à tag.*`,
      )
      .setColor('#0099FF')
      .setImage(
        'https://media.discordapp.net/attachments/1405588312248287415/1466211722288431188/banner.png?ex=6989c353&is=698871d3&hm=96647c0dfa993d7e72df72206065ce77bed92277730af3851a3584def71428da&=&format=webp&quality=lossless&width=1522&height=856',
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    // Usamos prefixo "curso_" para os botões deste módulo
    const inscreverBtn = new ButtonBuilder()
      .setCustomId(`curso_inscrever_${courseId}`)
      .setLabel('Inscrever')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝')

    const finalizarBtn = new ButtonBuilder()
      .setCustomId(`curso_finalizarCurso_${courseId}`)
      .setLabel('Finalizar Curso')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⏹')

    const row = new ActionRowBuilder().addComponents(inscreverBtn, finalizarBtn)

    // Envia o embed no canal atual
    const msg = await interaction.channel.send({
      embeds: [embed],
      components: [row],
    })

    // Atualiza no banco: messageId e channelId
    await Course.update(
      { messageId: msg.id, channelId: msg.channel.id },
      { where: { courseId } },
    )
  },
}
