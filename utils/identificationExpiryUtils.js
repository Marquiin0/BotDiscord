// utils/identificationExpiryUtils.js
//
// ① notifyExpiredIdentifications(client)
// ② alertStaffExpiredIdentifications(client)
// ③ reportIdentificationStatus(client)        ← agora cria/edita msgs fixas
// ④ handleCopyMentions(interaction)
// ---------------------------------------------------------------------------

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js')
const fs = require('fs')
const path = require('path')
const moment = require('moment-timezone')
const SequelizeLib = require('sequelize')
const { Op } = SequelizeLib
const config = require('../config')

// ─── Models ─────────────────────────────────────────────────────────────────
const db = require('../database.js')
const Identificacao = db.Identificacao

// tenta descobrir o nome correto do model de membros
const MemberModel = db.MemberIDs || db.MemberID || db.Members || undefined

if (!MemberModel) {
  console.warn(
    '[ID‑EXP] ⚠️ Model de membros não encontrado em database.js. ' +
      'Função reportIdentificationStatus ficará inativa.',
  )
}

// ─── Constantes ─────────────────────────────────────────────────────────────
const GUILD_ID = config.guilds.main
const TICKET_CHANNEL_URL =
  `https://discord.com/channels/${config.guilds.main}/${config.channels.tickets}`
const STAFF_LOG_CHANNEL_ID = config.channels.identificacaoLog
const RESUMO_CHANNEL_ID = config.channels.identificacaoResumo
const COPY_BTN_PREFIX = 'copy_mentions_'

// arquivo que guarda os IDs das mensagens
const STORE_PATH = path.join(__dirname, '..', 'identificationMessages.json')

// ─── Utilitário para carregar / salvar JSON ────────────────────────────────
function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8')
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}
function saveStore(obj) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2))
}

// helper PostgreSQL (<= dataRegistro)
const lteDataRegistro = dateObj =>
  SequelizeLib.literal(
    `"dataRegistro" <= '${dateObj.toISOString()}'`,
  )

// ────────────────────────────────────────────────────────────────────────────
// 1) DM (dataRegistro ≤ agora‑7 dias, status 'ativo')
// ────────────────────────────────────────────────────────────────────────────
async function notifyExpiredIdentifications(client) {
  const limite7 = moment().tz('America/Sao_Paulo').subtract(7, 'days').toDate()

  let registros
  try {
    registros = await Identificacao.findAll({
      where: { status: 'ativo', [Op.and]: lteDataRegistro(limite7) },
    })
  } catch (err) {
    console.error('[ID‑EXP] Erro na query (notify):', err)
    return
  }

  // Agrupar registros por userId para enviar apenas 1 DM por usuário
  const porUsuario = new Map()
  for (const reg of registros) {
    if (!porUsuario.has(reg.userId)) porUsuario.set(reg.userId, [])
    porUsuario.get(reg.userId).push(reg)
  }

  for (const [userId, regs] of porUsuario) {
    let dmOk = false
    // Usar a data do registro mais recente
    const maisRecente = regs.reduce((a, b) => (a.dataRegistro > b.dataRegistro ? a : b))

    try {
      const user = await client.users.fetch(userId).catch(() => null)
      if (!user) throw new Error('User não encontrado')

      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('⚠️ Identificação Expirada')
        .setDescription(
          `Sua identificação na **${config.branding.name}** expirou.\n` +
            'Para evitar advertência, refaça‑a clicando no botão abaixo.',
        )
        .addFields({
          name: '📅 Criada em',
          value: `<t:${Math.floor(maisRecente.dataRegistro / 1000)}:F>`,
        })
        .setFooter({
          text: `${config.branding.footerText} • CORREGEDORIA`,
          iconURL: client.user.displayAvatarURL(),
        })
        .setTimestamp()

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Refazer Identificação')
          .setStyle(ButtonStyle.Link)
          .setURL(TICKET_CHANNEL_URL)
          .setEmoji('🪪'),
      )

      await user.send({ embeds: [embed], components: [row] })
      dmOk = true
    } catch (err) {
      console.warn(
        `[ID‑EXP] DM falhou para ${userId}:`,
        err.code ?? err.message,
      )
    }

    // Marca TODOS os registros do usuário como inativo
    for (const reg of regs) {
      try {
        reg.status = 'inativo'
        await reg.save()
        console.log(
          `[ID‑EXP] Registro ${reg.id} marcado inativo (${dmOk ? 'DM OK' : 'DM falhou'})`,
        )
      } catch (err) {
        console.error(`[ID‑EXP] Falha ao salvar registro ${reg.id}:`, err)
      }
    }

    // Trocar cargo: remover identificado, adicionar não identificado (1x por usuário)
    try {
      const guild = client.guilds.cache.get(GUILD_ID)
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null)
        if (member) {
          await member.roles.remove(config.roles.identificado).catch(console.error)
          await member.roles.add(config.roles.naoIdentificado).catch(console.error)
        }
      }
    } catch (err) {
      console.error(`[ID‑EXP] Erro ao trocar cargo de ${userId}:`, err)
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 2) ALERTA STAFF (dataRegistro ≤ agora‑10 dias, status 'inativo')
// ────────────────────────────────────────────────────────────────────────────
async function alertStaffExpiredIdentifications(client) {
  const limite10 = moment()
    .tz('America/Sao_Paulo')
    .subtract(10, 'days')
    .toDate()

  let registros
  try {
    registros = await Identificacao.findAll({
      where: { status: 'inativo', [Op.and]: lteDataRegistro(limite10) },
    })
  } catch (err) {
    console.error('[ID‑EXP] Erro na query (staff):', err)
    return
  }

  if (!registros.length) return

  const guild = client.guilds.cache.get(GUILD_ID)
  const channel = guild?.channels.cache.get(STAFF_LOG_CHANNEL_ID)
  if (!guild || !channel) return

  for (const reg of registros) {
    const member = await guild.members.fetch(reg.userId).catch(() => null)
    const nickname = member ? member.displayName : 'Indisponível'

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setAuthor({
        name: `${config.branding.footerText} • Log de Identificações`,
        iconURL: guild.iconURL() ?? undefined,
      })
      .setTitle('🚨 Identificação expirada (10+ dias)')
      .setDescription(`O oficial <@${reg.userId}> não renovou a identificação.`)
      .addFields(
        {
          name: '📅 Criada em',
          value: `<t:${Math.floor(reg.dataRegistro / 1000)}:F>`,
          inline: true,
        },
        { name: '🆔 Registro', value: `\`${reg.id}\``, inline: true },
      )
      .setFooter({ text: `Nickname: ${nickname}` })
      .setTimestamp()

    await channel.send({ embeds: [embed] }).catch(console.error)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3) RELATÓRIO GERAL
// ────────────────────────────────────────────────────────────────────────────
async function reportIdentificationStatus(client) {
  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null)
  if (!guild) {
    console.error('[ID‑EXP] Guild não encontrada:', GUILD_ID)
    return
  }

  const channel = guild.channels.cache.get(RESUMO_CHANNEL_ID) || await guild.channels.fetch(RESUMO_CHANNEL_ID).catch(() => null)
  if (!channel) {
    console.error('[ID‑EXP] Canal de resumo não encontrado:', RESUMO_CHANNEL_ID)
    return
  }

  // IDs isentos (CMD e SCMD não precisam de identificação)
  const exemptRoles = [config.ranks.CMD.roleId, config.ranks.SCMD.roleId]

  /* ---------- Método 1: banco de dados ---------------------------------- */
  const semIdentificacaoDB = new Set()
  if (MemberModel) {
    try {
      const membersDb = await MemberModel.findAll({ attributes: ['memberId'] })
      const identificados = await Identificacao.findAll({
        where: { status: 'ativo' },
        attributes: ['userId'],
        group: ['userId'],
      })
      const idsIdentificados = new Set(identificados.map(i => i.userId))
      for (const m of membersDb) {
        if (!idsIdentificados.has(m.memberId)) {
          semIdentificacaoDB.add(m.memberId)
        }
      }
    } catch (err) {
      console.error('[ID‑EXP] Erro ao coletar dados do banco:', err)
    }
  }

  /* ---------- Método 2: verificação por roles --------------------------- */
  const semIdentificacaoRoles = new Set()
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await guild.members.fetch()
      break
    } catch (error) {
      const retryAfter = error.data?.retry_after || 30
      if (attempt < 2) {
        console.log(`[ID‑EXP] Rate limited ao buscar membros. Tentando em ${Math.ceil(retryAfter)}s... (${attempt + 1}/3)`)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
      } else {
        console.error('[ID‑EXP] Erro ao buscar membros após 3 tentativas:', error.message)
      }
    }
  }

  guild.members.cache.forEach(member => {
    if (!member.roles.cache.has(config.roles.recruta)) return
    const temIdentificado = member.roles.cache.has(config.roles.identificado)
    const temNaoIdentificado = member.roles.cache.has(config.roles.naoIdentificado)
    if (!temIdentificado || temNaoIdentificado) {
      semIdentificacaoRoles.add(member.id)
    }
  })

  /* ---------- União dos dois métodos (sem duplicatas) -------------------- */
  const semIdentificacaoSet = new Set([...semIdentificacaoDB, ...semIdentificacaoRoles])

  // Remover isentos (CMD e SCMD)
  for (const id of semIdentificacaoSet) {
    const member = guild.members.cache.get(id)
    if (member && exemptRoles.some(r => member.roles.cache.has(r))) {
      semIdentificacaoSet.delete(id)
    }
  }

  const semIdentificacao = [...semIdentificacaoSet]

  /* ---------- monta embed + row ----------------------------------------- */
  const semDesc = semIdentificacao.length
    ? semIdentificacao.map(id => `<@${id}>`).join('\n')
    : 'Todos os oficiais possuem identificação.'

  const embedSem = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle('📋 Oficiais sem Identificação')
    .setDescription(semDesc)
    .setFooter({ text: `Total: ${semIdentificacao.length}` })
    .setTimestamp()

  const rowSem = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${COPY_BTN_PREFIX}sem`)
      .setLabel('Copiar menções')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
  )

  /* ---------- envia com menções de IA e RH ------------------------------ */
  const mentionContent = `<@&${config.ranks.IA.roleId}> <@&${config.roles.rh}>`
  await channel.send({ content: mentionContent, embeds: [embedSem], components: [rowSem] })
}

// ────────────────────────────────────────────────────────────────────────────
// 4) Relatório de oficiais sem curso MAA
// ────────────────────────────────────────────────────────────────────────────
async function reportMAAStatus(client) {
  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null)
  if (!guild) {
    console.error('[MAA] Guild não encontrada:', GUILD_ID)
    return
  }

  const channel = guild.channels.cache.get(RESUMO_CHANNEL_ID) || await guild.channels.fetch(RESUMO_CHANNEL_ID).catch(() => null)
  if (!channel) {
    console.error('[MAA] Canal de resumo não encontrado:', RESUMO_CHANNEL_ID)
    return
  }

  // Fetch membros com retry
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await guild.members.fetch()
      break
    } catch (error) {
      const retryAfter = error.data?.retry_after || 30
      if (attempt < 2) {
        console.log(`[MAA] Rate limited ao buscar membros. Tentando em ${Math.ceil(retryAfter)}s... (${attempt + 1}/3)`)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
      } else {
        console.error('[MAA] Erro ao buscar membros após 3 tentativas:', error.message)
        return
      }
    }
  }

  const exemptRoles = config.permissions.maaExempt
  const semMAA = []

  guild.members.cache.forEach(member => {
    if (member.user.bot) return
    if (!member.roles.cache.has(config.roles.recruta)) return
    if (member.roles.cache.has(config.roles.maaAprovado)) return
    if (exemptRoles.some(r => member.roles.cache.has(r))) return
    semMAA.push(member.id)
  })

  // Só envia se houver oficiais sem curso MAA
  if (semMAA.length === 0) return

  const embedMAA = new EmbedBuilder()
    .setColor(config.branding.color)
    .setTitle('📋 Oficiais sem Curso MAA')
    .setDescription(semMAA.map(id => `<@${id}>`).join('\n'))
    .setFooter({ text: `Total: ${semMAA.length}` })
    .setTimestamp()

  const rowMAA = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${COPY_BTN_PREFIX}maa`)
      .setLabel('Copiar menções')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
  )

  const mentionContent = `<@&${config.ranks.IA.roleId}> <@&${config.roles.rh}>`
  await channel.send({ content: mentionContent, embeds: [embedMAA], components: [rowMAA] })
}

// ────────────────────────────────────────────────────────────────────────────
// 5) Handler do botão "Copiar menções"
// ────────────────────────────────────────────────────────────────────────────
async function handleCopyMentions(interaction) {
  if (
    !interaction.isButton() ||
    !interaction.customId.startsWith(COPY_BTN_PREFIX)
  )
    return false

  const description = interaction.message.embeds?.[0]?.description ?? ''
  const mentionsText = description
    .split('\n')
    .filter(l => l.trim().startsWith('<@'))
    .join('\n')
    .trim()

  const embed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle('📋 Menções copiáveis')
    .setDescription(
      mentionsText
        ? `\`\`\`\n${mentionsText}\n\`\`\``
        : '*Nenhuma menção disponível.*',
    )
    .setTimestamp()

  await interaction.reply({ embeds: [embed], ephemeral: true })
  return true
}

// ─── Exporta ────────────────────────────────────────────────────────────────
module.exports = {
  notifyExpiredIdentifications,
  alertStaffExpiredIdentifications,
  reportIdentificationStatus,
  reportMAAStatus,
  handleCopyMentions,
}
