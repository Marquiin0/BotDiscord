const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js')
const { PatrolSession } = require('../database')
const config = require('../config')
const moment = require('moment-timezone')

const MAX_SESSION_HOURS = 12 // Sessões com mais de 12h são marcadas como possivelmente inativas

module.exports = {
  data: new SlashCommandBuilder()
    .setName('online')
    .setDescription('Mostra todos os membros em serviço no jogo.'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      // Busca todas as sessões abertas (em serviço no jogo)
      const openSessions = await PatrolSession.findAll({
        where: { exitTime: null },
        order: [['entryTime', 'ASC']],
      })

      if (openSessions.length === 0) {
        return await interaction.editReply({
          content: '⚠️ Nenhum membro em serviço no momento.',
        })
      }

      // Buscar membros da guild
      const guild = interaction.client.guilds.cache.get(config.guilds.main)
      if (!guild) {
        return await interaction.editReply({ content: '❌ Servidor principal não encontrado.' })
      }

      await guild.members.fetch()

      // Agrupar por patente
      const categorias = {}
      for (const key of config.rankOrder) {
        const rank = config.ranks[key]
        categorias[key] = { label: `${rank.tag} ${rank.name}`, members: [] }
      }
      const outros = []
      let totalAtivos = 0
      let totalInativos = 0

      const agora = moment().tz('America/Sao_Paulo')

      for (const session of openSessions) {
        // Calcular tempo em serviço
        const entrada = moment(session.entryTime).tz('America/Sao_Paulo')
        const diffHours = agora.diff(entrada, 'hours', true)
        const horas = Math.floor(diffHours)
        const minutos = Math.floor((diffHours - horas) * 60)

        // Sessões com mais de 12h são possivelmente inativas
        const isStale = diffHours > MAX_SESSION_HOURS
        const statusIcon = isStale ? '⚠️' : '⏱️'
        const tempoText = `${statusIcon} (${horas}h ${minutos}m)`

        if (isStale) {
          totalInativos++
        } else {
          totalAtivos++
        }

        // Buscar membro na guild
        const member = session.discordId ? guild.members.cache.get(session.discordId) : null

        const display = member
          ? `${member} ${tempoText}`
          : `\`${session.memberName} | ${session.inGameId}\` ${tempoText}`

        // Identificar patente do membro
        if (member) {
          let found = false
          for (const key of config.rankOrder) {
            const rank = config.ranks[key]
            if (member.roles.cache.has(rank.roleId)) {
              categorias[key].members.push(display)
              found = true
              break
            }
          }
          if (!found) outros.push(display)
        } else {
          outros.push(display)
        }
      }

      // Montar embed
      let corpo = ''

      for (const key of config.rankOrder) {
        const cat = categorias[key]
        if (cat.members.length > 0) {
          corpo += `🎖️ **${cat.label}** (${cat.members.length}):\n${cat.members.join('\n')}\n\n`
        }
      }

      if (outros.length > 0) {
        corpo += `🔹 **Outros** (${outros.length}):\n${outros.join('\n')}\n\n`
      }

      corpo += `📌 **Total em Serviço:** \`${totalAtivos}\``
      if (totalInativos > 0) {
        corpo += ` | ⚠️ **Possivelmente inativos:** \`${totalInativos}\``
      }
      corpo += `\n⏰ **Atualizado em:** <t:${Math.floor(Date.now() / 1000)}:f>`

      // Dividir em múltiplos embeds se necessário (limite 4096 chars)
      const partes = []
      for (let i = 0; i < corpo.length; i += 4000) {
        partes.push(corpo.slice(i, i + 4000))
      }

      const embeds = partes.map((parte, i) =>
        new EmbedBuilder()
          .setColor(config.branding.color)
          .setTitle(i === 0 ? `🟢 Membros em Serviço` : `🟢 Membros em Serviço (continuação)`)
          .setDescription(parte)
          .setFooter({ text: config.branding.footerText })
          .setTimestamp(),
      )

      await interaction.editReply({ embeds: embeds.slice(0, 10) })
    } catch (error) {
      console.error('Erro ao executar /online:', error)
      await interaction.editReply({
        content: '❌ Ocorreu um erro ao buscar membros em serviço.',
      })
    }
  },
}
