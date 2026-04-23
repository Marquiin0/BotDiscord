const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js')
const config = require('../config')
const { UserPontos, UserActions } = require('../database')
const moment = require('moment-timezone')

const POLICIAL_ROLE_ID = '1497006047205003365'
const POINTS_RECRUTADOR = 25
const POINTS_AUXILIAR = 10
const STEP_TIMEOUT = 5 * 60 * 1000 // 5 minutos por passo

function parseMentions(text) {
  const ids = []
  const regex = /<@!?(\d+)>/g
  let m
  while ((m = regex.exec(text)) !== null) ids.push(m[1])
  return ids
}

// Aceita @menções ou IDs numéricos do Discord (17-20 dígitos)
function parseDiscordIds(text) {
  const fromMentions = parseMentions(text)
  const fromRaw = [...text.matchAll(/\b(\d{17,20})\b/g)].map(m => m[1])
  return [...new Set([...fromMentions, ...fromRaw])]
}

async function validateRecruit(discordId, mainGuild) {
  try {
    const member = await mainGuild.members.fetch(discordId).catch(() => null)
    if (!member) return { valid: false, reason: 'não está no servidor' }
    if (!member.roles.cache.has(POLICIAL_ROLE_ID)) return { valid: false, reason: 'sem cargo de policial' }
    return { valid: true }
  } catch {
    return { valid: false, reason: 'erro na validação' }
  }
}

async function addPoints(userId, points, idTipo, nomeTipo) {
  let record = await UserPontos.findOne({ where: { userId } })
  if (record) {
    record.pontos += points
    await record.save()
  } else {
    record = await UserPontos.create({ userId, pontos: points })
  }
  await UserActions.create({
    userId,
    id_tipo: idTipo,
    nome_tipo: nomeTipo,
    pontos: points,
    multiplicador: 1,
    pontosRecebidos: points,
  })
}

async function fecharCanal(canal, delay = 10000) {
  setTimeout(() => canal.delete().catch(() => {}), delay)
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('registrar-rec')
    .setDescription('Registra um recrutamento e distribui pontos automaticamente.'),

  async execute(interaction) {
    const client = interaction.client

    const hasRole = interaction.member.roles.cache.some(r =>
      config.permissions.rec.includes(r.id),
    )
    if (!hasRole) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.reply({
      content: '✅ Canal criado! Prossiga pelo canal de recrutamento.',
      flags: MessageFlags.Ephemeral,
    })

    // Criar canal privado no servidor FTO
    let canal
    try {
      canal = await interaction.guild.channels.create({
        name: `rec-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
      })
    } catch (err) {
      console.error('[REC] Erro ao criar canal:', err)
      return
    }

    const filter = m => m.author.id === interaction.user.id

    async function coletar(prompt) {
      await canal.send(prompt)
      const col = await canal.awaitMessages({ filter, max: 1, time: STEP_TIMEOUT }).catch(() => null)
      if (!col?.size) return null
      return col.first()
    }

    try {
      // Passo 1: Recrutador
      const msg1 = await coletar(
        '👤 **Passo 1/3 — Recrutador**\nMencione o recrutador com @:',
      )
      if (!msg1) {
        await canal.send('⏱️ Tempo esgotado. Canal será fechado em 10 segundos.')
        return fecharCanal(canal)
      }

      // Passo 2: Auxiliares
      const msg2 = await coletar(
        '🤝 **Passo 2/3 — Auxiliares**\nMencione os auxiliares com @ (separe por espaço).\nResponda `nenhum` se não houver:',
      )
      if (!msg2) {
        await canal.send('⏱️ Tempo esgotado. Canal será fechado em 10 segundos.')
        return fecharCanal(canal)
      }

      // Passo 3: IDs dos recrutados
      const msg3 = await coletar(
        '🆔 **Passo 3/3 — Recrutados**\nEnvie os **IDs do Discord** dos recrutados (@menções ou IDs numéricos, separados por espaço):',
      )
      if (!msg3) {
        await canal.send('⏱️ Tempo esgotado. Canal será fechado em 10 segundos.')
        return fecharCanal(canal)
      }

      // Parsing
      const recrutadorIds = parseMentions(msg1.content)
      const auxiliarIds =
        msg2.content.trim().toLowerCase() === 'nenhum' ? [] : parseMentions(msg2.content)
      const recruitedIds = parseDiscordIds(msg3.content)

      if (recruitedIds.length === 0) {
        await canal.send(
          '❌ Nenhum ID Discord válido encontrado nos recrutados. Registro cancelado.\nCanal será fechado em 10 segundos.',
        )
        return fecharCanal(canal)
      }

      await canal.send(`⏳ Validando ${recruitedIds.length} recrutado(s) no servidor principal...`)

      // Buscar servidor principal
      const mainGuild =
        client.guilds.cache.get(config.guilds.main) ||
        (await client.guilds.fetch(config.guilds.main).catch(() => null))

      if (!mainGuild) {
        await canal.send('❌ Não foi possível acessar o servidor principal.')
        return fecharCanal(canal)
      }

      // Validar cada ID
      const results = await Promise.all(
        recruitedIds.map(async id => ({ id, ...(await validateRecruit(id, mainGuild)) })),
      )
      const validCount = results.filter(r => r.valid).length

      if (validCount === 0) {
        const lista = results.map(r => `<@${r.id}> ❌ (${r.reason})`).join('\n')
        await canal.send(
          `❌ Nenhum recrutado foi validado. Nenhum ponto distribuído.\n\n${lista}\n\nCanal será fechado em 15 segundos.`,
        )
        return fecharCanal(canal, 15000)
      }

      // Distribuir pontos
      const recrutadorPts = validCount * POINTS_RECRUTADOR
      const auxiliarPts = validCount * POINTS_AUXILIAR
      const nomeTipo = `Recrutamento (${validCount} recrutado${validCount !== 1 ? 's' : ''})`

      for (const uid of recrutadorIds) {
        await addPoints(uid, recrutadorPts, 'rec_recrutador', nomeTipo).catch(e =>
          console.error(`[REC] Pontos recrutador ${uid}:`, e),
        )
      }
      for (const uid of auxiliarIds) {
        await addPoints(uid, auxiliarPts, 'rec_auxiliar', `${nomeTipo} - Auxiliar`).catch(e =>
          console.error(`[REC] Pontos auxiliar ${uid}:`, e),
        )
      }

      // Montar embed
      const idLines = results
        .map(r => `<@${r.id}> ${r.valid ? '✅' : `❌ (${r.reason})`}`)
        .join('\n')

      const recrutadorDisplay = recrutadorIds.length
        ? recrutadorIds.map(id => `<@${id}>`).join(', ')
        : msg1.content

      const auxiliaresDisplay = auxiliarIds.length
        ? auxiliarIds.map(id => `<@${id}>`).join(', ')
        : 'Nenhum'

      const horaBrasilia = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY [às] HH:mm')

      const pontosLinhas = []
      if (recrutadorIds.length) {
        pontosLinhas.push(
          `→ Recrutador: **+${recrutadorPts} pts** — ${recrutadorIds.map(id => `<@${id}>`).join(', ')}`,
        )
      }
      if (auxiliarIds.length) {
        pontosLinhas.push(
          `→ Auxiliares: **+${auxiliarPts} pts cada** — ${auxiliarIds.map(id => `<@${id}>`).join(', ')}`,
        )
      }
      if (!pontosLinhas.length) {
        pontosLinhas.push('⚠️ Nenhum recrutador/auxiliar mencionado — pontos não distribuídos.')
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Registro de Recrutamento')
        .setColor(config.branding.color)
        .addFields(
          { name: '👤 Recrutador', value: recrutadorDisplay, inline: true },
          { name: '🤝 Auxiliares', value: auxiliaresDisplay, inline: true },
          { name: '​', value: '​', inline: true },
          { name: '🆔 Recrutados', value: idLines || 'N/A', inline: false },
          {
            name: `📊 Válidos: ${validCount}/${recruitedIds.length}`,
            value: pontosLinhas.join('\n'),
            inline: false,
          },
        )
        .setFooter({
          text: `${config.branding.footerText} • Registrado por ${interaction.user.tag} • ${horaBrasilia}`,
        })
        .setTimestamp()

      // Enviar embed no canal de REC do servidor FTO
      try {
        const ftoGuild =
          client.guilds.cache.get(config.guilds.logs) ||
          (await client.guilds.fetch(config.guilds.logs).catch(() => null))
        const canalRec =
          ftoGuild?.channels.cache.get(config.logsChannels.rec) ||
          (await ftoGuild?.channels.fetch(config.logsChannels.rec).catch(() => null))

        if (canalRec) {
          await canalRec.send({ embeds: [embed] })
        } else {
          console.error('[REC] Canal de registro não encontrado:', config.logsChannels.rec)
        }
      } catch (err) {
        console.error('[REC] Erro ao enviar embed:', err)
      }

      await canal.send(
        `✅ **Registro concluído!** ${validCount} recrutado${validCount !== 1 ? 's' : ''} válido${validCount !== 1 ? 's' : ''}. Pontos distribuídos.\nEste canal será fechado em 15 segundos.`,
      )
      fecharCanal(canal, 15000)
    } catch (err) {
      console.error('[REC] Erro no fluxo de recrutamento:', err)
      await canal.send('❌ Ocorreu um erro inesperado. Canal será fechado em 10 segundos.').catch(() => {})
      fecharCanal(canal)
    }
  },
}
