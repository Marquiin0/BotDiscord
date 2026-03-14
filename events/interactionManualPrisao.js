const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const config = require('../config')
const moment = require('moment-timezone')
const { Op } = require('sequelize')
const {
  PrisonReports,
  UserPontos,
  UserActions,
  UserMultiplicadores,
  Loja,
} = require('../database.js')
const actionTypes = require('../utils/actionTypes.json')

const activeReports = new Map()

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    /* ───────── 1) Botão → Modal ───────── */
    if (interaction.isButton() && interaction.customId === 'relatorio_prisao') {
      const userId = interaction.user.id
      if (activeReports.has(userId)) {
        return interaction.reply({
          content: '⚠️ Você já tem um relatório de prisão aberto.',
          flags: MessageFlags.Ephemeral,
        })
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_relatorio_prisao')
        .setTitle('🚔 Criar Relatório de Prisão')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('nome_suspeito')
              .setLabel('Nome do suspeito')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('id_suspeito')
              .setLabel('ID/Passaporte do suspeito')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('artigos_prisao')
              .setLabel('Artigos / Motivo da prisão')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('multa_prisao')
              .setLabel('Valor da multa')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('tempo_prisao')
              .setLabel('Tempo de prisão (em meses)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        )

      return interaction.showModal(modal)
    }

    /* ───────── 2) Modal Submetido ───────── */
    if (interaction.isModalSubmit() && interaction.customId === 'modal_relatorio_prisao') {
      await interaction.deferReply({ ephemeral: true })

      const userId = interaction.user.id
      const userName = interaction.member.displayName
      const nomeSuspeito = interaction.fields.getTextInputValue('nome_suspeito')
      const idSuspeito = interaction.fields.getTextInputValue('id_suspeito')
      const artigos = interaction.fields.getTextInputValue('artigos_prisao')
      const multa = interaction.fields.getTextInputValue('multa_prisao')
      const tempo = interaction.fields.getTextInputValue('tempo_prisao')

      const dataDisplay = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY')
      const horaDisplay = moment().tz('America/Sao_Paulo').format('HH:mm:ss')
      const dataDB = moment().tz('America/Sao_Paulo').format('YYYY-MM-DD HH:mm:ss')

      /* ── Boosts ── */
      let boostMultiplier = 1
      try {
        const boostRecords = await Loja.findAll({
          where: {
            userId,
            item: { [Op.in]: ['Boost 2x Relatórios por 1 dia', 'Boost 4x Relatórios por 1 dia'] },
          },
        })
        boostRecords.forEach(record => {
          if (record.item.includes('2x')) boostMultiplier += 1
          if (record.item.includes('4x')) boostMultiplier += 3
        })
      } catch (err) { /* ignora */ }

      /* ── DB ── */
      const report = await PrisonReports.create({
        commanderId: userId,
        commanderName: userName,
        suspectId: idSuspeito,
        suspectName: nomeSuspeito,
        articles: `${artigos}\nMulta: $${multa} | Tempo: ${tempo} meses`,
        participants: '',
        imageUrl: '',
        reportDate: dataDB,
        boostMultiplier,
      })

      /* ── Embed ── */
      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle(`🚔 Relatório de Prisão Nº${report.id} - ${dataDisplay}`)
        .addFields(
          { name: '📝 Suspeito', value: nomeSuspeito, inline: true },
          { name: '📌 ID do Suspeito', value: idSuspeito, inline: true },
          { name: '⚖️ Artigos', value: `${artigos}\nMulta: $${multa}\nTempo: ${tempo} meses` },
          { name: '👮 Oficial', value: `<@${userId}>` },
          { name: '👥 Participantes', value: 'Nenhum até o momento' },
        )
        .setFooter({ text: `Relatório enviado por: ${userName}` })

      /* ── Botão adicionar participante ── */
      const addBtn = new ButtonBuilder()
        .setCustomId(`add_participant_${report.id}_${userId}`)
        .setLabel('Adicionar participante')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Primary)

      const row = new ActionRowBuilder().addComponents(addBtn)

      const canalLog = interaction.guild.channels.cache.get(config.channels.prisaoLog)
      if (!canalLog) {
        return interaction.editReply({ content: '❌ Canal de log de prisões não encontrado.' })
      }

      const msg = await canalLog.send({ embeds: [embed], components: [row] })
      await report.update({ messageId: msg.id })

      /* ── Remove botões após 1 hora ── */
      setTimeout(async () => {
        const oldMsg = await canalLog.messages.fetch(msg.id).catch(() => null)
        if (oldMsg) await oldMsg.edit({ components: [] })
      }, 3600000)

      /* ── Pontos ── */
      const action = actionTypes.find(a => a.id_tipo === 'relatorio_prisao')
      if (action) {
        const multiplicador = (await UserMultiplicadores.findOne({ where: { userId } }))?.multiplicador || 1
        const pontosFinais = action.pontos_base * multiplicador

        const userPontos = await UserPontos.findOrCreate({
          where: { userId },
          defaults: { pontos: 0 },
        }).then(([u]) => u)

        userPontos.pontos += pontosFinais
        await userPontos.save()

        await UserActions.create({
          userId,
          id_tipo: action.id_tipo,
          nome_tipo: action.nome_tipo,
          pontos: action.pontos_base,
          multiplicador,
          pontosRecebidos: pontosFinais,
        })
      }

      activeReports.delete(userId)

      await interaction.editReply({
        content: `✅ Relatório de prisão Nº${report.id} criado com sucesso!`,
      })
    }
  },
}
