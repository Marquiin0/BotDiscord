const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const { PatrolHours } = require('../database')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('online')
    .setDescription('Mostra todos os membros online no servidor com suas horas.'),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
      !interaction.member.roles.cache.hasAny(...config.permissions.rhPlus)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      // Busca membros com presença
      await interaction.guild.members.fetch({ withPresences: true })

      const onlineMembers = interaction.guild.members.cache.filter(
        member =>
          !member.user.bot &&
          member.presence &&
          ['online', 'idle', 'dnd'].includes(member.presence.status),
      )

      if (onlineMembers.size === 0) {
        return await interaction.editReply({
          content: '⚠️ Nenhum membro online encontrado.',
        })
      }

      // Busca horas do BD para cada membro online
      const memberList = []
      for (const [, member] of onlineMembers) {
        const patrol = await PatrolHours.findOne({
          where: { userId: member.id },
        })

        const hours = patrol ? patrol.hours.toFixed(1) : '0.0'
        const statusEmoji =
          member.presence.status === 'online'
            ? '🟢'
            : member.presence.status === 'idle'
            ? '🟡'
            : '🔴'

        memberList.push({
          name: member.displayName,
          mention: `<@${member.id}>`,
          status: statusEmoji,
          hours,
        })
      }

      // Ordena por horas (maior primeiro)
      memberList.sort((a, b) => parseFloat(b.hours) - parseFloat(a.hours))

      // Monta a lista em chunks (limite de embed)
      const lines = memberList.map(
        (m, i) => `${m.status} **${i + 1}.** ${m.mention} - \`${m.hours}h\``,
      )

      const chunkSize = 20
      const embeds = []
      for (let i = 0; i < lines.length; i += chunkSize) {
        const chunk = lines.slice(i, i + chunkSize)
        const embed = new EmbedBuilder()
          .setColor(config.branding.color)
          .setTitle(
            i === 0
              ? `🟢 Membros Online - ${config.branding.name}`
              : `🟢 Membros Online (continuação)`,
          )
          .setDescription(chunk.join('\n'))
          .setFooter({
            text: `Total online: ${onlineMembers.size} | ${config.branding.footerText}`,
          })
          .setTimestamp()

        embeds.push(embed)
      }

      await interaction.editReply({ embeds: embeds.slice(0, 10) }) // Discord limita 10 embeds
    } catch (error) {
      console.error('Erro ao executar /online:', error)
      await interaction.editReply({
        content: '❌ Ocorreu um erro ao buscar membros online.',
      })
    }
  },
}
