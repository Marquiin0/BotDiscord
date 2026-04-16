const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
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
  if (roleId === config.roles.rh) return '[R.H]'
  for (const key of config.rankOrder) {
    if (config.ranks[key].roleId === roleId) return config.ranks[key].tag
  }
  return 'Cargo desconhecido'
}

const promotionTags = config.promotionTags

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rebaixar')
    .setDescription('Rebaixa um usuário para um cargo especificado.')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('O usuário que será rebaixado.')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('cargo')
        .setDescription('O cargo para o qual o usuário será rebaixado.')
        .setRequired(true)
        .addChoices(
          ...config.rankOrder.map(key => ({
            name: config.ranks[key].tag,
            value: config.ranks[key].roleId,
          })),
          { name: '[R.H]', value: config.roles.rh },
        ),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.Administrator,
        ) &&
        !interaction.memberPermissions.has(
          PermissionsBitField.Flags.UseApplicationCommands,
        )
      ) {
        return await interaction.editReply({
          content: '❌ Você não tem permissão.',
        })
      }

      const user = interaction.options.getUser('usuario')
      const newRoleId = interaction.options.getString('cargo')
      const member = interaction.guild.members.cache.get(user.id)
      if (!member) {
        return await interaction.editReply({
          content: '❌ Usuário não encontrado no servidor.',
        })
      }

      // Identifica o cargo atual (patente)
      let oldRoleId = null
      for (const roleId of Object.keys(promotionTags)) {
        if (member.roles.cache.has(roleId)) {
          oldRoleId = roleId
          break
        }
      }

      const isRemovingRH = newRoleId === config.roles.rh
      let oldTag, newTag, updatedNickname

      if (isRemovingRH) {
        // Rebaixar de R.H: remove o cargo R.H e volta o nickname para a patente atual
        if (!member.roles.cache.has(config.roles.rh)) {
          return await interaction.editReply({
            content: '⚠️ O usuário não possui o cargo R.H.',
          })
        }
        if (!oldRoleId) {
          return await interaction.editReply({
            content: '⚠️ O usuário não possui uma patente válida.',
          })
        }
        await member.roles.remove(config.roles.rh).catch(console.error)
        updatedNickname = member.displayName.replace(/\[.*?\]/, promotionTags[oldRoleId])
        await member.setNickname(updatedNickname).catch(console.error)
        oldTag = '[R.H]'
        newTag = promotionTags[oldRoleId]
      } else {
        oldTag = promotionTags[oldRoleId]
        newTag = promotionTags[newRoleId]

        if (!oldRoleId || !newRoleId || !newTag) {
          return await interaction.editReply({
            content:
              '⚠️ O usuário não possui um cargo válido para rebaixamento ou o cargo de destino é inválido.',
          })
        }

        // Remove o cargo atual e adiciona o novo
        await member.roles.remove(oldRoleId).catch(console.error)
        await member.roles.add(newRoleId).catch(console.error)

        // Se tinha R.H, remove também
        if (member.roles.cache.has(config.roles.rh)) {
          await member.roles.remove(config.roles.rh).catch(console.error)
        }

        // Atualiza o apelido
        updatedNickname = member.displayName.replace(/\[.*?\]/, newTag)
        await member.setNickname(updatedNickname).catch(console.error)
      }

      // Atualiza registro
      await PromotionRecords.upsert({
        userId: user.id,
        userName: updatedNickname,
        lastPromotionDate: new Date(),
      })

      // Limpa registros de comandante
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

      const today = new Date()
      const formattedDate = today.toLocaleDateString('pt-BR')

      // Embed de notificação de rebaixamento
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`🔻 ${config.branding.name} - Rebaixamento`)
        .setDescription(
          'Em virtude da análise dos serviços prestados, o usuário foi rebaixado para um cargo inferior:',
        )
        .addFields(
          { name: '👤 Ao:', value: `<@${user.id}>`, inline: true },
          { name: '📌 De:', value: `<@&${oldRoleId}>`, inline: true },
          { name: '📌 Para:', value: `<@&${newRoleId}>`, inline: true },
        )
        .setFooter({
          text: `Dado sob autoridade de ALTO COMANDO ${config.branding.name}, neste ${formattedDate}.`,
        })
        .setTimestamp()

      // Canal de promoção/rebaixamento log
      const rebaixamentoChannel = interaction.guild.channels.cache.get(
        config.channels.promocaoLog,
      )
      if (rebaixamentoChannel) {
        await rebaixamentoChannel.send({
          content: `<@${user.id}>`,
          embeds: [embed],
        })
      }

      // Log no servidor de logs
      const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
      if (logsGuild) {
        const rebaixamentoLogEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('📋 Log de Rebaixamento')
          .setDescription('Um rebaixamento foi realizado com sucesso.')
          .addFields(
            { name: 'Oficial', value: `<@${user.id}>`, inline: true },
            { name: 'De', value: getRankTag(oldRoleId), inline: true },
            { name: 'Para', value: getRankTag(newRoleId), inline: true },
            {
              name: 'Rebaixado por',
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
          )
          .setTimestamp()
          .setFooter({ text: `${config.branding.footerText} - Logs de Rebaixamento` })

        const logChannel = logsGuild.channels.cache.get(config.logsChannels.rebaixamento)
        if (logChannel) {
          await logChannel.send({ embeds: [rebaixamentoLogEmbed] })
        }
      }

      // DM para a pessoa rebaixada
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle(`🔻 ${config.branding.name} - Rebaixamento`)
          .setDescription(
            `Você foi rebaixado(a) de **${oldTag}** para **${newTag}**.\n\nEsperamos que esta situação sirva como motivação para melhorar seu desempenho.`,
          )
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()
        await user.send({ embeds: [dmEmbed] }).catch(() => {})
      } catch (e) { /* DM fechada */ }

      await interaction.editReply({
        content: `✅ <@${user.id}> foi rebaixado com sucesso para ${newTag}!`,
      })
    } catch (error) {
      console.error('Erro ao rebaixar usuário:', error)
      try {
        await interaction.editReply({
          content: '❌ Ocorreu um erro ao tentar rebaixar o usuário.',
        })
      } catch (err) {
        console.error('Erro ao enviar mensagem de falha:', err)
      }
    }
  },
}
