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

// helper SQLite (<= dataRegistro)
const lteDataRegistro = dateObj =>
  SequelizeLib.literal(
    `strftime('%s', dataRegistro) <= strftime('%s', '${dateObj.toISOString()}')`,
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

  for (const reg of registros) {
    let dmOk = false
    try {
      const user = await client.users.fetch(reg.userId).catch(() => null)
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
          value: `<t:${Math.floor(reg.dataRegistro / 1000)}:F>`,
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
        `[ID‑EXP] DM falhou para ${reg.userId} (${reg.id}):`,
        err.code ?? err.message,
      )
    }

    // marca como inativo em qualquer cenário
    try {
      reg.status = 'inativo'
      await reg.save()
      console.log(
        `[ID‑EXP] Registro ${reg.id} marcado inativo (${dmOk ? 'DM OK' : 'DM falhou'})`,
      )
    } catch (err) {
      console.error(`[ID‑EXP] Falha ao salvar registro ${reg.id}:`, err)
    }

    // Trocar cargo: remover identificado, adicionar não identificado
    try {
      const guild = client.guilds.cache.get(GUILD_ID)
      if (guild) {
        const member = await guild.members.fetch(reg.userId).catch(() => null)
        if (member) {
          await member.roles.remove(config.roles.identificado).catch(console.error)
          await member.roles.add(config.roles.naoIdentificado).catch(console.error)
        }
      }
    } catch (err) {
      console.error(`[ID‑EXP] Erro ao trocar cargo de ${reg.userId}:`, err)
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
  if (!MemberModel) return

  const guild = client.guilds.cache.get(GUILD_ID)
  const channel = guild?.channels.cache.get(STAFF_LOG_CHANNEL_ID)
  if (!guild || !channel) return

  /* ---------- coleta dados (igual antes) -------------------------------- */
  let membersDb, identificados
  try {
    membersDb = await MemberModel.findAll({ attributes: ['memberId'] })
    identificados = await Identificacao.findAll({
      attributes: ['userId'],
      group: ['userId'],
    })
  } catch (err) {
    console.error('[ID‑EXP] Erro ao coletar dados:', err)
    return
  }

  const todosIDs = membersDb.map(m => m.memberId)
  const idsIdentificados = identificados.map(i => i.userId)
  const semIdentificacao = todosIDs.filter(id => !idsIdentificados.includes(id))

  const limite10 = moment()
    .tz('America/Sao_Paulo')
    .subtract(10, 'days')
    .toDate()
  let exp10
  try {
    exp10 = await Identificacao.findAll({
      where: { status: 'inativo', [Op.and]: lteDataRegistro(limite10) },
    })
  } catch (err) {
    console.error('[ID‑EXP] Erro ao buscar expirados 10+ dias:', err)
    return
  }

  /* ---------- monta embeds + rows --------------------------------------- */
  const semDesc = semIdentificacao.length
    ? semIdentificacao.map(id => `<@${id}>`).join('\n')
    : 'Todos os oficiais possuem identificação.'

  const expDesc = exp10.length
    ? exp10
        .map(
          r =>
            `<@${r.userId}> • criada <t:${Math.floor(
              r.dataRegistro / 1000,
            )}:R>`,
        )
        .join('\n')
    : 'Nenhuma identificação expirada há 10+ dias.'

  const embedSem = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle('📋 Oficiais sem Identificação')
    .setDescription(semDesc)
    .setFooter({ text: `Total: ${semIdentificacao.length}` })
    .setTimestamp()

  const embedExp = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('⏰ Identificações expiradas (10+ dias)')
    .setDescription(expDesc)
    .setFooter({ text: `Total: ${exp10.length}` })
    .setTimestamp()

  const rowSem = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${COPY_BTN_PREFIX}sem`)
      .setLabel('Copiar menções')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
  )
  const rowExp = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${COPY_BTN_PREFIX}exp`)
      .setLabel('Copiar menções')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
  )

  /* ---------- cria OU edita mensagens ----------------------------------- */
  const store = loadStore()

  // helper interno para criar / editar
  async function upsertMessage(key, embed, row) {
    const msgId = store[key]
    let message
    if (msgId) {
      // tenta editar
      message = await channel.messages.fetch(msgId).catch(() => null)
      if (message) {
        await message.edit({ embeds: [embed], components: [row] })
        return
      }
    }
    // se não existia (ou foi deletada) → envia de novo
    message = await channel.send({ embeds: [embed], components: [row] })
    store[key] = message.id
    saveStore(store)
  }

  await upsertMessage('sem', embedSem, rowSem)
  await upsertMessage('exp', embedExp, rowExp)
}

// ────────────────────────────────────────────────────────────────────────────
// 4) Handler do botão "Copiar menções"
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
  handleCopyMentions,
}
