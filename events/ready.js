const config = require('../config')
const checkExpiredWarnings = require('../utils/checkExpiredWarnings')
const checkExpiredLoja = require('../utils/checkExpiredLoja')
const { Warning } = require('../database')
const updateMemberIDs = require('../utils/updateMembersIDs')
const { updateHierarchy } = require('../utils/updateHierarchy')
const patrolCommand = require('../commands/patrulha')
const { Ausencia } = require('../database')
const { startLeaderboardUpdate } = require('../utils/leaderboardUpdate.js')
const { closeExpiredBetsOnReady } = require('./interactionBet.js')
const {
  notifyExpiredIdentifications,
  alertStaffExpiredIdentifications,
  reportIdentificationStatus,
} = require('../utils/identificationExpiryUtils')
const { startDonationChecks } = require('../utils/donationScheduler')
const { Op } = require('sequelize')
const { EmbedBuilder } = require('discord.js')

async function fetchMessagesInBatches(channel, limit = 500) {
  let allMessages = []
  let lastMessageId = null
  const batchSize = 100

  while (allMessages.length < limit) {
    const options = { limit: batchSize }
    if (lastMessageId) options.before = lastMessageId

    const messages = await channel.messages.fetch(options)
    if (messages.size === 0) break

    allMessages = allMessages.concat(Array.from(messages.values()))
    lastMessageId = messages.last().id

    if (allMessages.length >= limit) break
  }

  return allMessages.slice(0, limit)
}

/**
 * Verifica ausências expiradas e atualiza status, remove cargo, envia embed de log.
 */
async function checkExpiredAusencias(client) {
  try {
    console.log('Iniciando verificação de ausências expiradas...')

    const now = new Date()
    const ausenciasExpiradas = await Ausencia.findAll({
      where: {
        endDate: { [Op.lte]: now },
        status: 'Ativa',
      },
    })

    for (const ausencia of ausenciasExpiradas) {
      await Ausencia.update(
        { status: 'Inativo' },
        { where: { id: ausencia.id } },
      )

      const guild = client.guilds.cache.get(config.guilds.main)
      if (guild) {
        const member = await guild.members
          .fetch(ausencia.userId)
          .catch(() => null)
        if (member) {
          try {
            await member.roles.remove(config.roles.ausencia)
            console.log(`Cargo de ausência removido para ${member.user.tag}`)
          } catch (error) {
            console.error(
              `Erro ao remover cargo de ausência para ${member.user.tag}:`,
              error,
            )
          }
        }
      }

      // Atualiza a mensagem de ausência no canal
      const channel = client.channels.cache.get(ausencia.channelId)
      if (channel) {
        try {
          const message = await channel.messages
            .fetch(ausencia.messageId)
            .catch(() => null)
          if (message) {
            await message.edit(
              message.content.replace(
                'Status: **Ativo**',
                'Status: **Inativo**',
              ),
            )
          }
        } catch (error) {
          console.error(`Erro ao atualizar mensagem de ausência: ${error}`)
        }
      }

      // Envia EMBED no canal de log de ausência
      const logChannel = client.channels.cache.get(config.channels.ausenciaLog)
      if (logChannel) {
        const startDateLocal = new Date(ausencia.startDate).toLocaleDateString('pt-BR')
        const endDateLocal = new Date(ausencia.endDate).toLocaleDateString('pt-BR')
        const user = await client.users.fetch(ausencia.userId)

        const embed = new EmbedBuilder()
          .setTitle('✅ Retorno de Ausência (Expiração)')
          .setColor('#FFA500')
          .setDescription(
            `O oficial <@${ausencia.userId}> retornou de ausência devido à expiração automática.`,
          )
          .addFields(
            {
              name: '👤 QRA',
              value: ausencia.userName
                ? `<@${ausencia.userId}> - ${ausencia.userName}`
                : `<@${ausencia.userId}>`,
              inline: true,
            },
            {
              name: '📅 Período',
              value: `${startDateLocal} a ${endDateLocal}`,
              inline: true,
            },
            {
              name: '📝 Motivo',
              value: ausencia.motivo || 'Não especificado',
              inline: false,
            },
          )
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setFooter({
            text: `${config.branding.footerText} • Status: Inativo • Expirado`,
          })
          .setTimestamp()

        await logChannel.send({ embeds: [embed] })
      }
    }

    console.log('Verificação de ausências expiradas concluída.')
  } catch (error) {
    console.error('Erro ao verificar ausências expiradas:', error)
  }
}

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Logado como: ${client.user.tag}`)
    client.botIsReady = true

    // Verificação de ausências a cada 12 horas
    setInterval(() => checkExpiredAusencias(client), 12 * 60 * 60 * 1000)

    startDonationChecks(client, 10000)

    // Executa patrulha periodicamente (6h)
    const executePatrolPeriodically = async () => {
      try {
        await patrolCommand.executePatrolCommand(client)
        console.log('Comando de patrulha executado com sucesso.')
      } catch (error) {
        console.error('Erro ao executar o comando de patrulha:', error)
      }
    }
    setInterval(executePatrolPeriodically, 21600000)

    // Verifica advertências expiradas
    checkExpiredWarnings(client)

    // Leaderboard update (desativado)
    // startLeaderboardUpdate(client)

    // Identificação expirada (DM + alerta staff a cada 6h)
    setInterval(async () => {
      await notifyExpiredIdentifications(client)
    }, 21600000)

    // Relatório identificação a cada 1h
    setInterval(async () => {
      await reportIdentificationStatus(client)
    }, 3600000)

    // Advertências expiradas (check frequente)
    setInterval(() => {
      checkExpiredWarnings(client)
    }, 23200)

    // Loja expirada
    setInterval(() => {
      checkExpiredLoja(client)
    }, 23200)

    // Apostas expiradas
    setInterval(() => {
      closeExpiredBetsOnReady(client)
    }, 60000)

    // Atualiza BD de IDs a cada 15min
    setInterval(async () => {
      const guild = client.guilds.cache.get(config.guilds.main)
      if (guild) {
        await updateMemberIDs(guild)
      }
    }, 900000)

    // Atualizar hierarquia: principal caminho é event-driven
    // (events/guildMember{Update,Add,Remove}.js). Este timer é safety net
    // pra capturar qualquer evento perdido.
    setInterval(async () => {
      const guild = client.guilds.cache.get(config.guilds.main)
      if (guild) {
        await updateHierarchy(guild, config.channels.hierarquia)
      }
    }, 1800000) // 30 minutos

    // Chama a função que apaga automaticamente canais "registro-"
    deleteProvaChannels(client)
  },
}

/**
 * Exclui automaticamente canais que começam com "registro-"
 */
async function deleteProvaChannels(client) {
  const guild = client.guilds.cache.get(config.guilds.main)
  if (!guild) {
    console.error('Guilda não encontrada para excluir salas de prova.')
    return
  }

  const channels = await guild.channels.fetch()
  channels.forEach(channel => {
    if (channel && channel.name && channel.name.startsWith('registro-')) {
      channel.delete().catch(console.error)
    }
  })
}
