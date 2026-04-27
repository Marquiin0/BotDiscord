const { EmbedBuilder, AttachmentBuilder } = require('discord.js')
const { DateTime } = require('luxon')
const path = require('path')
const fs = require('fs')
const config = require('../config')
const { BotConfig } = require('../database')

const HIERARCHY_KEY = 'hierarchyMessageId'

async function saveMessageId(messageId) {
  await BotConfig.upsert({ key: HIERARCHY_KEY, value: messageId })
}

async function loadMessageId() {
  const record = await BotConfig.findOne({ where: { key: HIERARCHY_KEY } })
  return record?.value || null
}

const roleCategoryMap = {}
for (const key of config.rankOrder) {
  const rank = config.ranks[key]
  roleCategoryMap[rank.roleId] = rank.name
}

const orderedRanks = config.rankOrder.map(key => config.ranks[key])

async function buildHierarchyPayload(guild) {
  const localTime = DateTime.now()
    .setZone('America/Sao_Paulo')
    .toFormat('dd/MM/yyyy, HH:mm:ss')

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
        throw error
      }
    }
  }

  const buckets = new Map(orderedRanks.map(r => [r.roleId, []]))
  let totalContingent = 0

  guild.members.cache.forEach(member => {
    for (const rank of orderedRanks) {
      if (member.roles.cache.has(rank.roleId)) {
        buckets.get(rank.roleId).push(`<@${member.user.id}>`)
        totalContingent++
        break
      }
    }
  })

  const embed = new EmbedBuilder()
    .setTitle(`🏴‍☠️ ${config.branding.hierarchyTitle}`)
    .setColor(config.branding.color)
    .setFooter({ text: `${config.branding.footerText} • Atualizado em ${localTime}` })

  const files = []
  const bannerPath = path.resolve(config.branding.bannerPath)
  const logoPath = path.resolve(config.branding.logoPath)
  if (fs.existsSync(bannerPath)) {
    files.push(new AttachmentBuilder(bannerPath, { name: 'banner.png' }))
    embed.setImage('attachment://banner.png')
  }
  if (fs.existsSync(logoPath)) {
    files.push(new AttachmentBuilder(logoPath, { name: 'logo.png' }))
    embed.setThumbnail('attachment://logo.png')
  }

  for (const rank of orderedRanks) {
    const occupants = buckets.get(rank.roleId)
    const value = occupants.length > 0 ? occupants.join('\n') : '*Sem ocupantes.*'
    embed.addFields({
      name: `${rank.name} \`${occupants.length}\``,
      value: value.length > 1024 ? value.slice(0, 1020) + '...' : value,
      inline: false,
    })
  }

  embed.addFields({
    name: '​',
    value: `**Total de contingente: \`${totalContingent}\`**`,
    inline: false,
  })

  return { embeds: [embed], files }
}

async function updateHierarchy(guild, channelId) {
  const channel = guild.channels.cache.get(channelId)
  if (!channel) {
    console.log('Canal de hierarquia não encontrado.')
    return
  }

  try {
    const payload = await buildHierarchyPayload(guild)
    const storedId = await loadMessageId()

    if (storedId) {
      try {
        const existing = await channel.messages.fetch(storedId)
        await existing.edit(payload)
        console.log('Hierarquia atualizada (edit).')
        return
      } catch (err) {
        console.log(`Mensagem ${storedId} não encontrada — recriando.`)
      }
    }

    const sent = await channel.send(payload)
    await saveMessageId(sent.id)
    console.log('Hierarquia criada (nova mensagem).')
  } catch (error) {
    console.error('Erro ao atualizar hierarquia:', error)
  }
}

let debounceTimer = null
let pendingGuild = null
function scheduleHierarchyUpdate(guild) {
  if (!guild || guild.id !== config.guilds.main) return
  pendingGuild = guild
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    const g = pendingGuild
    pendingGuild = null
    updateHierarchy(g, config.channels.hierarquia).catch(err =>
      console.error('[updateHierarchy] debounced:', err),
    )
  }, 3000)
}

const hierarchyRoleIds = new Set(Object.keys(roleCategoryMap))

module.exports = {
  updateHierarchy,
  scheduleHierarchyUpdate,
  hierarchyRoleIds,
}
