const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js')
const moment = require('moment')
const { UserPoints, UserLog, WeeklyPoints } = require('../database')
const { Op } = require('sequelize')

const META_SEMANAL = 1800000 // 1kk800

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resetsemanal')
    .setDescription(
      'Atualiza o embed do canal com as informações desde o último domingo e realiza o reset semanal.'
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addIntegerOption(option =>
      option
        .setName('pontos_semanal')
        .setDescription(
          'Quantidade de pontos semanais a ser descontada e, se for igual a 0, irá apenas atualizar o embed.'
        )
        .setRequired(true)
    ),

  async execute(interaction) {
    const SEMANAL = interaction.options.getInteger('pontos_semanal')

    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return interaction.reply({
        content: 'Você não tem permissão para usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const lastSunday = moment()
      .utc()
      .day(0)
      .subtract(moment().utc().day() === 0 ? 1 : 0, 'week')
      .startOf('day')
      .toDate()
    const embedDescription =
      `As horas de patrulha e os **pontos semanais** estão sendo contabilizados desde **__<t:${moment(
        lastSunday
      ).unix()}:F>__**.\n\n` +
      '*Esses valores são atualizados constantemente, então verifique regularmente!*\n\n'

    const updatedEmbed = new EmbedBuilder()
      .setTitle('Verifique suas informações! 🚓')
      .setDescription(
        '> Clique no botão abaixo para ver suas informações na Merryweather.\n\n' +
          embedDescription +
          '**Observação:**\n' +
          '- As informações sobre os pontos são atualizadas instantaneamente.\n' +
          '- Horas de patrulha são atualizadas a cada 1 hora.'
      )
      .setColor('#FF0000')
      .setImage(
        'https://cdn.discordapp.com/attachments/1259781955353051157/1259961535099437226/Merry.gif'
      )

    const channelId = '1277086294958407680'
    const messageId = '1277248301514625075'

    try {
      const channel = await interaction.client.channels.fetch(channelId)
      const message = await channel.messages.fetch(messageId)
      await message.edit({ embeds: [updatedEmbed] })

      const users = await UserPoints.findAll()

      // Armazena todos os usuários com seus pontos semanais em um array
      const userWeeklyData = await Promise.all(
        users.map(async user => {
          const userLogs = await UserLog.findAll({
            where: {
              userId: user.userId,
              createdAt: {
                [Op.gte]: lastSunday,
              },
            },
          })

          const weeklyPoints = userLogs.reduce(
            (sum, log) => sum + log.points,
            0
          )
          return {
            userId: user.userId,
            userName: user.userName,
            weeklyPoints,
          }
        })
      )

      // Limpa a tabela WeeklyPoints antes de inserir os novos dados
      await WeeklyPoints.destroy({ where: {} })

      // Insere os dados na tabela WeeklyPoints
      await WeeklyPoints.bulkCreate(userWeeklyData)

      // Ordena os usuários pelos pontos semanais em ordem decrescente
      userWeeklyData.sort((a, b) => b.weeklyPoints - a.weeklyPoints)

      let weeklyReport = '\n📊 **Relatório de Pontos Semanais**:\n\n'

      for (const userData of userWeeklyData) {
        const metaInfo =
          userData.weeklyPoints < META_SEMANAL ? ' *(não bateu a meta)*' : ''
        weeklyReport += `**👤 Membro**: ${
          userData.userName
        }\n**📅 Pontos Semanais**: ${userData.weeklyPoints.toLocaleString()}${metaInfo}\n\n`
      }

      // Enviar o relatório
      await interaction.followUp({
        content: weeklyReport,
        flags: MessageFlags.Ephemeral,
      })

      // Enviar a mensagem de notificação no canal se SEMANAL for maior que 0
      if (SEMANAL > 0) {
        const notifyChannelId = '1259776287426482187'
        const roleMention = '<@&1259753632832946206>'
        const notifyChannel = await interaction.client.channels.fetch(
          notifyChannelId
        )
        await notifyChannel.send(
          `${roleMention} O reset semanal foi realizado e **${SEMANAL.toLocaleString()}** pontos foram descontados de todos os membros.`
        )
      }
    } catch (error) {
      console.error('Erro ao atualizar o embed ou os pontos:', error)
      await interaction.editReply({
        content:
          'Houve um erro ao tentar atualizar o embed ou realizar o reset semanal.',
      })
    }
  },
}
