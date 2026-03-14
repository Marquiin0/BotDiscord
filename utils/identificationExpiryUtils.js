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
  if (!MemberModel) {
    console.error('[ID‑EXP] MemberModel não encontrado, abortando relatório.')
    return
  }

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

  /* ---------- coleta dados (igual antes) -------------------------------- */
  let membersDb, identificados
  try {
    membersDb = await MemberModel.findAll({ attributes: ['memberId'] })
    identificados = await Identificacao.findAll({
      where: { status: 'ativo' },
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

  /* ---------- envia nova mensagem a cada execução ------------------------ */
  await channel.send({ embeds: [embedSem], components: [rowSem] })
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
