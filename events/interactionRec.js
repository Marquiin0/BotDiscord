const { EmbedBuilder, MessageFlags } = require('discord.js')
const config = require('../config')
const { UserPontos, UserActions, MemberID } = require('../database')
const moment = require('moment-timezone')

const EST_ROLE_ID = config.ranks.EST?.roleId ?? '1477408727236874244'
const POINTS_RECRUTADOR = 25
const POINTS_AUXILIAR = 10

function parseMentions(text) {
  const ids = []
  const regex = /<@!?(\d+)>/g
  let m
  while ((m = regex.exec(text)) !== null) ids.push(m[1])
  return ids
}

function parseIds(text) {
  return text
    .split(/[\s,;\n]+/)
    .map(s => s.trim())
    .filter(s => /^\d+$/.test(s))
}

async function validateRecruitId(id, mainGuild) {
  try {
    const record = await MemberID.findOne({ where: { discordId: id } })
    if (record) {
      const member = await mainGuild.members.fetch(record.memberId).catch(() => null)
      if (!member) return { valid: false, reason: 'não está no servidor' }
      if (!member.roles.cache.has(EST_ROLE_ID)) return { valid: false, reason: 'sem cargo EST' }
      return { valid: true }
    }

    // Fallback: busca por nickname
    await mainGuild.members.fetch()
    const found = mainGuild.members.cache.find(m => {
      const match = m.displayName.match(/\|\s*(\d+)/)
      return match && match[1] === id
    })
    if (!found) return { valid: false, reason: 'ID não encontrado' }
    if (!found.roles.cache.has(EST_ROLE_ID)) return { valid: false, reason: 'sem cargo EST' }
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

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isModalSubmit()) return
    if (interaction.customId !== 'modal_registrar_rec') return

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const recrutadorRaw = interaction.fields.getTextInputValue('rec_recrutador')
    const auxiliaresRaw = interaction.fields.getTextInputValue('rec_auxiliares') || ''
    const idsRaw = interaction.fields.getTextInputValue('rec_ids')

    const recrutadorIds = parseMentions(recrutadorRaw)
    const auxiliarIds = parseMentions(auxiliaresRaw)
    const recruitedIds = parseIds(idsRaw)

    if (recruitedIds.length === 0) {
      return interaction.editReply({
        content: '❌ Nenhum ID válido encontrado no campo "IDs dos Recrutados".',
      })
    }

    const mainGuild = client.guilds.cache.get(config.guilds.main)
      || await client.guilds.fetch(config.guilds.main).catch(() => null)

    if (!mainGuild) {
      return interaction.editReply({ content: '❌ Não foi possível acessar o servidor principal.' })
    }

    // Validar cada ID recrutado
    const results = await Promise.all(
      recruitedIds.map(async id => ({ id, ...(await validateRecruitId(id, mainGuild)) })),
    )
    const validCount = results.filter(r => r.valid).length

    if (validCount === 0) {
      const listaIds = results.map(r => `\`${r.id}\` ❌ (${r.reason})`).join('\n')
      return interaction.editReply({
        content: `❌ Nenhum ID foi validado. Nenhum ponto distribuído.\n\n${listaIds}`,
      })
    }

    // Distribuir pontos
    const recrutadorPts = validCount * POINTS_RECRUTADOR
    const auxiliarPts = validCount * POINTS_AUXILIAR

    for (const uid of recrutadorIds) {
      await addPoints(
        uid,
        recrutadorPts,
        'rec_recrutador',
        `Recrutamento (${validCount} recrutado${validCount !== 1 ? 's' : ''})`,
      ).catch(e => console.error(`[REC] Erro ao adicionar pontos recrutador ${uid}:`, e))
    }

    for (const uid of auxiliarIds) {
      await addPoints(
        uid,
        auxiliarPts,
        'rec_auxiliar',
        `Recrutamento Auxiliar (${validCount} recrutado${validCount !== 1 ? 's' : ''})`,
      ).catch(e => console.error(`[REC] Erro ao adicionar pontos auxiliar ${uid}:`, e))
    }

    // Montar embed
    const idList = results
      .map(r => `\`${r.id}\` ${r.valid ? '✅' : `❌ (${r.reason})`}`)
      .join('  |  ')

    const recrutadorDisplay = recrutadorIds.length
      ? recrutadorIds.map(id => `<@${id}>`).join(', ')
      : recrutadorRaw || 'N/A'

    const auxiliaresDisplay = auxiliarIds.length
      ? auxiliarIds.map(id => `<@${id}>`).join(', ')
      : 'Nenhum'

    const horaBrasilia = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY [às] HH:mm')

    const pontosLinhas = []
    if (recrutadorIds.length) {
      pontosLinhas.push(`→ Recrutador: **+${recrutadorPts} pts** (${recrutadorIds.map(id => `<@${id}>`).join(', ')})`)
    }
    if (auxiliarIds.length) {
      pontosLinhas.push(`→ Auxiliares: **+${auxiliarPts} pts cada** (${auxiliarIds.map(id => `<@${id}>`).join(', ')})`)
    }
    if (!pontosLinhas.length) {
      pontosLinhas.push('Recrutador não mencionado — pontos não distribuídos.')
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Registro de Recrutamento')
      .setColor(config.branding.color)
      .addFields(
        { name: '👤 Recrutador', value: recrutadorDisplay, inline: true },
        { name: '🤝 Auxiliares', value: auxiliaresDisplay, inline: true },
        { name: '​', value: '​', inline: true },
        { name: '🆔 IDs dos Recrutados', value: idList || 'N/A', inline: false },
        {
          name: `📊 Recrutados válidos: ${validCount}/${recruitedIds.length}`,
          value: pontosLinhas.join('\n'),
          inline: false,
        },
      )
      .setFooter({ text: `${config.branding.footerText} • Registrado por ${interaction.user.tag} • ${horaBrasilia}` })
      .setTimestamp()

    // Enviar para o canal de REC no servidor FTO
    try {
      const ftoGuild = client.guilds.cache.get(config.guilds.logs)
        || await client.guilds.fetch(config.guilds.logs).catch(() => null)
      const canal = ftoGuild?.channels.cache.get(config.logsChannels.rec)
        || await ftoGuild?.channels.fetch(config.logsChannels.rec).catch(() => null)

      if (canal) {
        await canal.send({ embeds: [embed] })
      } else {
        console.error('[REC] Canal de registro não encontrado:', config.logsChannels.rec)
      }
    } catch (err) {
      console.error('[REC] Erro ao enviar embed:', err)
    }

    await interaction.editReply({ content: `✅ Registro enviado! ${validCount} recrutado${validCount !== 1 ? 's' : ''} validado${validCount !== 1 ? 's' : ''}, pontos distribuídos.` })
  },
}
