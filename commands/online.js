const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js')
const { PatrolSession } = require('../database')
const config = require('../config')
const moment = require('moment-timezone')

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

      const agora = moment().tz('America/Sao_Paulo')

      for (const session of openSessions) {
        // Calcular tempo em serviço
        const entrada = moment(session.entryTime).tz('America/Sao_Paulo')
        const diff = moment.duration(agora.diff(entrada))
        const horas = Math.floor(diff.asHours())
        const minutos = diff.minutes()
        const tempoText = `⏱️ (${horas}h ${minutos}m)`

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

      const total = openSessions.length
      corpo += `📌 **Total em Serviço:** \`${total}\`\n`
      corpo += `⏰ **Atualizado em:** <t:${Math.floor(Date.now() / 1000)}:f>`

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
