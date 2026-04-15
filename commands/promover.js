const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js')
const {
  ActionReports,
  PrisonReports,
  PromotionRecords,
  PromotionRequests,
  ApreensaoReports,
} = require('../database.js')
const { Warning } = require('../database')
const { Op } = require('sequelize')
const config = require('../config')

function getRankTag(roleId) {
  for (const key of config.rankOrder) {
    if (config.ranks[key].roleId === roleId) return config.ranks[key].tag
  }
  return 'Cargo desconhecido'
}

const promotionTags = config.promotionTags

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promover')
    .setDescription('Promove um usuário para um cargo especificado.')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('O usuário que será promovido.')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('cargo')
        .setDescription('O cargo para o qual o usuário será promovido.')
        .setRequired(true)
        .addChoices(
          ...config.rankOrder.map(key => ({
            name: config.ranks[key].tag,
            value: config.ranks[key].roleId,
          })),
        ),
    ),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      ) &&
      !interaction.memberPermissions.has(
        PermissionsBitField.Flags.UseApplicationCommands,
      )
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        ephemeral: true,
      })
    }

    await interaction.deferReply({ ephemeral: true })

    try {
      const user = interaction.options.getUser('usuario')
      const newRoleId = interaction.options.getString('cargo')
      const member = interaction.guild.members.cache.get(user.id)

      if (!member) {
        return await interaction.editReply({
          content: '❌ Usuário não encontrado no servidor.',
        })
      }

      // Identifica o cargo atual do usuário
      let oldRoleId = null
      for (const roleId of Object.keys(promotionTags)) {
        if (member.roles.cache.has(roleId)) {
          oldRoleId = roleId
          break
        }
      }

      const oldTag = promotionTags[oldRoleId]
      const newTag = promotionTags[newRoleId]

      if (!oldRoleId || !newRoleId || !newTag) {
        return await interaction.editReply({
          content:
            '⚠️ O usuário não possui um cargo válido para promoção ou cargo de destino inválido.',
        })
      }

      // Remove o cargo antigo e adiciona o novo
      await member.roles.remove(oldRoleId).catch(console.error)
      await member.roles.add(newRoleId).catch(console.error)

      // Atualiza o apelido substituindo a tag antiga pela nova
      const currentNickname = member.displayName
      const updatedNickname = currentNickname.replace(/\[.*?\]/, newTag)
      await member.setNickname(updatedNickname).catch(console.error)

      // Atualiza o registro de promoção
      await PromotionRecords.upsert({
        userId: user.id,
        userName: updatedNickname,
        lastPromotionDate: new Date(),
      })

      // Zera o commanderId em reports
      await PrisonReports.update(
        { commanderId: 'NULL' },
        { where: { commanderId: member.id } },
      )
      await ActionReports.update(
        { commanderId: 'NULL' },
        { where: { commanderId: member.id } },
      )
      await ApreensaoReports.update(
        { commanderId: 'NULL' },
        { where: { commanderId: member.id } },
      )

      // Remove participante dos relatórios
      const updateParticipants = async (Model, columnName) => {
        const records = await Model.findAll({
          where: {
            [columnName]: { [Op.like]: `%${member.id}%` },
          },
        })
        for (const record of records) {
          const participantsArray = record[columnName]
            .split(',')
            .map(id => id.trim())
          const updatedParticipants = participantsArray.filter(
            id => id !== member.id,
          )
          await record.update({
            [columnName]: updatedParticipants.length > 0
              ? updatedParticipants.join(', ')
              : '',
          })
        }
      }

      await updateParticipants(PrisonReports, 'participants')
      await updateParticipants(ActionReports, 'participants')
      await updateParticipants(ApreensaoReports, 'participants')

      // Embed de notificação
      const today = new Date()
      const formattedDate = today.toLocaleDateString('pt-BR')

      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle(`🏅 ${config.branding.name} - Ordem de Mérito Policial`)
        .setDescription(
          'Em reconhecimento aos serviços extraordinários prestados à segurança pública, conferimos a presente condecoração:',
        )
        .addFields(
          { name: '👤 Ao:', value: `<@${user.id}>`, inline: true },
          { name: '📌 De:', value: `<@&${oldRoleId}>`, inline: true },
          { name: '📌 Para:', value: `<@&${newRoleId}>`, inline: true },
        )
        .setFooter({
          text: `Dado sob autoridade de ALTO COMANDO ${config.branding.name}, neste ${formattedDate}.`,
        })

      // Envia no canal de promoção log
      const notificationChannel = interaction.guild.channels.cache.get(
        config.channels.promocaoLog,
      )
      if (notificationChannel) {
        await notificationChannel.send({
          content: `<@${user.id}>`,
          embeds: [embed],
        })
      }

      // Log de promoção no servidor de logs
      const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
      if (logsGuild) {
        const promotionLogEmbed = new EmbedBuilder()
          .setColor('#1E90FF')
          .setTitle('📋 Log de Promoção')
          .setDescription('Uma promoção foi realizada com sucesso.')
          .addFields(
            { name: 'Oficial', value: `<@${user.id}>`, inline: true },
            { name: 'De', value: getRankTag(oldRoleId), inline: true },
            { name: 'Para', value: getRankTag(newRoleId), inline: true },
            {
              name: 'Promovido por',
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
          )
          .setTimestamp()
          .setFooter({ text: `${config.branding.footerText} - Logs de Promoção` })

        const logChannel = logsGuild.channels.cache.get(config.logsChannels.promocao)
        if (logChannel) {
          await logChannel.send({ embeds: [promotionLogEmbed] })
        }
      }

      // DM para a pessoa promovida
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle(`🏅 ${config.branding.name} - Promoção`)
          .setDescription(
            `Parabéns! Você foi promovido(a) de **${oldTag}** para **${newTag}**!\n\nContinue com o excelente trabalho e dedicação.`,
          )
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()
        await user.send({ embeds: [dmEmbed] }).catch(() => {})
      } catch (e) { /* DM fechada */ }

      await interaction.editReply({
        content: `✅ <@${user.id}> foi promovido com sucesso para ${newTag}!`,
      })
    } catch (error) {
      console.error('Erro ao processar /promover:', error)
      await interaction.editReply({
        content: 'Ocorreu um erro ao tentar promover o usuário.',
      })
    }
  },
}
