const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js')
const { PatrolSession } = require('../database')
const config = require('../config')
const moment = require('moment-timezone')

// Patentes que aparecem separadas (Alto Comando)
const HIGH_COMMAND_RANKS = ['CMD', 'SCMD', 'HC', 'SC', 'IA']

// Limite máximo de sessão ativa (horas)
const MAX_SESSION_HOURS = 12

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

      const guild = interaction.client.guilds.cache.get(config.guilds.main)
      if (!guild) {
        return await interaction.editReply({ content: '❌ Servidor principal não encontrado.' })
      }

      await guild.members.fetch()

      // Mapa de roleId de unidade → nome da unidade
      const unitMap = {}
      for (const bat of config.battalions) {
        unitMap[bat.mainRoleId] = bat.roleName
      }

      // Categorias
      const altoComando = {} // rankKey -> { label, members[] }
      for (const key of HIGH_COMMAND_RANKS) {
        const rank = config.ranks[key]
        if (rank) altoComando[key] = { label: `${rank.tag} ${rank.name}`, members: [] }
      }

      const unidades = {} // unitName -> members[]
      for (const bat of config.battalions) {
        unidades[bat.roleName] = []
      }
      const patrulha = [] // membros sem unidade e que não são HC+
      const outros = [] // sem Discord ID ou sem patente

      let totalAtivos = 0
      let totalInativos = 0
      const agora = moment().tz('America/Sao_Paulo')

      for (const session of openSessions) {
        const entrada = moment(session.entryTime).tz('America/Sao_Paulo')
        const diffHours = agora.diff(entrada, 'hours', true)
        const horas = Math.floor(diffHours)
        const minutos = Math.floor((diffHours - horas) * 60)

        const isStale = diffHours > MAX_SESSION_HOURS
        if (isStale) {
          totalInativos++
        } else {
          totalAtivos++
        }

        const statusIcon = isStale ? '⚠️' : '⏱️'
        const tempoText = `${statusIcon} (${horas}h ${minutos}m)`

        const member = session.discordId ? guild.members.cache.get(session.discordId) : null

        if (!member) {
          outros.push(`\`${session.memberName} | ${session.inGameId}\` ${tempoText}`)
          continue
        }

        const display = `${member} | ${session.inGameId} ${tempoText}`

        // Verificar se é Alto Comando
        let isHC = false
        for (const key of HIGH_COMMAND_RANKS) {
          const rank = config.ranks[key]
          if (rank && member.roles.cache.has(rank.roleId)) {
            altoComando[key].members.push(display)
            isHC = true
            break
          }
        }

        if (isHC) continue

        // Verificar unidade
        let unitFound = false
        for (const bat of config.battalions) {
          if (member.roles.cache.has(bat.mainRoleId)) {
            unidades[bat.roleName].push(display)
            unitFound = true
            break
          }
        }

        if (!unitFound) {
          patrulha.push(display)
        }
      }

      // Montar embed
      let corpo = ''

      // Alto Comando (cada patente separada)
      for (const key of HIGH_COMMAND_RANKS) {
        const cat = altoComando[key]
        if (cat && cat.members.length > 0) {
          corpo += `🎖️ **${cat.label}** (${cat.members.length}):\n${cat.members.join('\n')}\n\n`
        }
      }

      // Unidades
      for (const bat of config.battalions) {
        const members = unidades[bat.roleName]
        if (members && members.length > 0) {
          corpo += `🛡️ **${bat.roleName}** (${members.length}):\n${members.join('\n')}\n\n`
        }
      }

      // Patrulha (sem unidade)
      if (patrulha.length > 0) {
        corpo += `👮 **Patrulha** (${patrulha.length}):\n${patrulha.join('\n')}\n\n`
      }

      // Outros (sem Discord ID vinculado)
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
          .setTitle(i === 0 ? '🟢 Membros em Serviço' : '🟢 Membros em Serviço (continuação)')
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
