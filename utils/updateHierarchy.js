const { DateTime } = require('luxon')
const config = require('../config')
const { BotConfig } = require('../database')

const HIERARCHY_KEY = 'hierarchyMessageIds'

// Salvar IDs no banco
async function saveMessageIds(messageIds) {
  await BotConfig.upsert({ key: HIERARCHY_KEY, value: JSON.stringify(messageIds) })
}

// Carregar IDs do banco
async function loadMessageIds() {
  const record = await BotConfig.findOne({ where: { key: HIERARCHY_KEY } })
  if (record && record.value) {
    try {
      return JSON.parse(record.value)
    } catch {
      return []
    }
  }
  return []
}

// Dividir mensagens longas em blocos de até 2000 caracteres
function splitMessage(message, maxLen = 2000) {
  const parts = []
  let currentPart = ''

  message.split('\n').forEach(line => {
    if (currentPart.length + line.length > maxLen) {
      parts.push(currentPart)
      currentPart = ''
    }
    currentPart += line + '\n'
  })

  if (currentPart.length) {
    parts.push(currentPart)
  }

  return parts
}

// Construir roleCategoryMap a partir de config.ranks
const roleCategoryMap = {}
for (const key of config.rankOrder) {
  const rank = config.ranks[key]
  roleCategoryMap[rank.roleId] = { category: rank.name, fullName: rank.name }
}

// Prioridade de exibição a partir de config.rankOrder
const rolePriority = config.rankOrder.map(key => config.ranks[key].name)

// Construir a hierarquia da guilda
async function buildHierarchyMessage(guild) {
  const localTime = DateTime.now()
    .setZone('America/Sao_Paulo')
    .toFormat('dd/MM/yyyy, HH:mm:ss')
  const hierarchy = {}

  for (const role of rolePriority) {
    hierarchy[role] = []
  }

  let totalContingent = 0

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await guild.members.fetch()
      break
    } catch (error) {
      const retryAfter = error.data?.retry_after || 30
      if (attempt < 2) {
        console.log(`Rate limited ao buscar membros. Tentando novamente em ${Math.ceil(retryAfter)}s... (tentativa ${attempt + 1}/3)`)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
      } else {
        console.error('Erro ao buscar membros da guilda após 3 tentativas:', error.message)
        return ['Erro ao buscar membros da guilda.']
      }
    }
  }

  guild.members.cache.forEach(member => {
    for (const roleId of Object.keys(roleCategoryMap)) {
      if (member.roles.cache.has(roleId)) {
        const { category } = roleCategoryMap[roleId]

        if (!hierarchy[category]) {
          console.error(
            `Categoria não encontrada: ${category} para o cargo ID: ${roleId}`,
          )
          continue
        }

        hierarchy[category].push(`<@${member.user.id}>`)
        totalContingent++
        break
      }
    }
  })

  let hierarchyMessage = `# **${config.branding.hierarchyTitle}**\n\n`

  rolePriority.forEach(role => {
    const count = hierarchy[role].length || 0
    hierarchyMessage += `# **${role}:** ${count ? `\`${count}\`` : '`0`'}\n`
    hierarchyMessage +=
      hierarchy[role].length > 0
        ? hierarchy[role].join('\n') + '\n\n'
        : 'Sem ocupantes.\n\n'
  })

  hierarchyMessage += `# **Total de contingente: \`${totalContingent}\`**\n`
  hierarchyMessage += `\n\n*Atualizado em ${localTime}*`

  return splitMessage(hierarchyMessage)
}

// Atualizar a hierarquia no canal
async function updateHierarchy(guild, channelId) {
  const channel = guild.channels.cache.get(channelId)
  if (!channel) {
    console.log('Canal não encontrado.')
    return
  }

  try {
    const messageParts = await buildHierarchyMessage(guild)
    let storedMessageIds = await loadMessageIds()
    let storedMessages = []

    for (const messageId of storedMessageIds) {
      try {
        const message = await channel.messages.fetch(messageId)
        storedMessages.push(message)
      } catch (error) {
        console.log(`Mensagem ${messageId} não encontrada. Será recriada.`)
      }
    }

    const quantidadeMudou = storedMessages.length !== messageParts.length

    if (quantidadeMudou) {
      console.log(
        'Quantidade de mensagens mudou. Deletando todas e recriando...',
      )

      for (const msg of storedMessages) {
        try {
          await msg.delete()
        } catch (error) {
          console.error(`Erro ao deletar mensagem ${msg.id}:`, error)
        }
      }

      const newMessageIds = []
      for (const part of messageParts) {
        const newMessage = await channel.send(part)
        newMessageIds.push(newMessage.id)
      }

      await saveMessageIds(newMessageIds)
      console.log('Hierarquia recriada com sucesso.')
      return
    }

    if (storedMessages.length > messageParts.length) {
      for (let i = messageParts.length; i < storedMessages.length; i++) {
        try {
          await storedMessages[i].delete()
        } catch (error) {
          console.error(
            `Erro ao deletar mensagem ${storedMessages[i].id}:`,
            error,
          )
        }
      }
      storedMessages = storedMessages.slice(0, messageParts.length)
    }

    let newMessageIds = []

    for (let i = 0; i < messageParts.length; i++) {
      if (storedMessages[i]) {
        if (storedMessages[i].content !== messageParts[i]) {
          await storedMessages[i].edit(messageParts[i])
        }
        newMessageIds.push(storedMessages[i].id)
      } else {
        const newMessage = await channel.send(messageParts[i])
        newMessageIds.push(newMessage.id)
      }
    }

    await saveMessageIds(newMessageIds)
    console.log('Hierarquia atualizada.')
  } catch (error) {
    console.error('Erro ao atualizar hierarquia:', error)
  }
}

module.exports = {
  updateHierarchy,
}
