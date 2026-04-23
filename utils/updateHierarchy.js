const fs = require('fs')
const path = require('path')
const { DateTime } = require('luxon')
const config = require('../config')

const messageIdFilePath = path.join(__dirname, 'hierarchyMessageId.json')

function saveMessageId(messageId) {
  fs.writeFileSync(messageIdFilePath, JSON.stringify({ messageId }))
}

function loadMessageId() {
  try {
    const parsed = JSON.parse(fs.readFileSync(messageIdFilePath, 'utf8'))
    return parsed.messageId || parsed.messageIds?.[0] || null
  } catch {
    return null
  }
}

const roleCategoryMap = {}
for (const key of config.rankOrder) {
  const rank = config.ranks[key]
  roleCategoryMap[rank.roleId] = { category: rank.name }
}
const rolePriority = config.rankOrder.map(key => config.ranks[key].name)

async function buildHierarchyMessage(guild) {
  const localTime = DateTime.now()
    .setZone('America/Sao_Paulo')
    .toFormat('dd/MM/yyyy, HH:mm:ss')
  const hierarchy = {}
  for (const role of rolePriority) hierarchy[role] = []

  let totalContingent = 0
  try {
    await guild.members.fetch()
  } catch (error) {
    console.error('Erro ao buscar membros da guilda:', error)
    return null
  }

  guild.members.cache.forEach(member => {
    for (const roleId of Object.keys(roleCategoryMap)) {
      if (member.roles.cache.has(roleId)) {
        const { category } = roleCategoryMap[roleId]
        if (!hierarchy[category]) continue
        hierarchy[category].push(`<@${member.user.id}>`)
        totalContingent++
        break
      }
    }
  })

  let msg = `# **${config.branding.hierarchyTitle}**\n\n`
  for (const role of rolePriority) {
    const members = hierarchy[role]
    msg += `# **${role}:** \`${members.length}\`\n`
    msg += members.length ? members.join('\n') + '\n\n' : 'Sem ocupantes.\n\n'
  }
  msg += `# **Total de contingente: \`${totalContingent}\`**\n\n*Atualizado em ${localTime}*`
  return msg
}

async function updateHierarchy(guild, channelId) {
  const channel = guild.channels.cache.get(channelId)
  if (!channel) {
    console.log('Canal de hierarquia não encontrado.')
    return
  }

  const content = await buildHierarchyMessage(guild)
  if (!content) return

  try {
    const storedId = loadMessageId()
    if (storedId) {
      try {
        const existing = await channel.messages.fetch(storedId)
        if (existing.content !== content) await existing.edit(content)
        return
      } catch {
        console.log('Mensagem de hierarquia anterior não encontrada. Recriando.')
      }
    }

    const newMessage = await channel.send(content)
    saveMessageId(newMessage.id)
  } catch (error) {
    console.error('Erro ao atualizar hierarquia:', error)
  }
}

module.exports = { updateHierarchy }
