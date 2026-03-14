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
  ApreensaoReports,
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
    if (interaction.isButton() && interaction.customId === 'relatorio_apreensao') {
      const userId = interaction.user.id
      if (activeReports.has(userId)) {
        return interaction.reply({
          content: '⚠️ Você já tem um relatório de apreensão aberto.',
          flags: MessageFlags.Ephemeral,
        })
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_relatorio_apreensao')
        .setTitle('📦 Criar Relatório de Apreensão')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('nome_apreendido')
              .setLabel('Nome do apreendido')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('id_apreendido')
              .setLabel('ID do apreendido')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('itens_apreendidos')
              .setLabel('Itens apreendidos')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('valor_apreensao')
              .setLabel('Valor da apreensão')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        )

      return interaction.showModal(modal)
    }

    /* ───────── 2) Modal Submetido ───────── */
    if (interaction.isModalSubmit() && interaction.customId === 'modal_relatorio_apreensao') {
      await interaction.deferReply({ ephemeral: true })

      const userId = interaction.user.id
      const userName = interaction.member.displayName
      const nomeApreendido = interaction.fields.getTextInputValue('nome_apreendido')
      const idApreendido = interaction.fields.getTextInputValue('id_apreendido')
      const itens = interaction.fields.getTextInputValue('itens_apreendidos')
      const valor = interaction.fields.getTextInputValue('valor_apreensao')

      const dataDisplay = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY')
      const horaDisplay = moment().tz('America/Sao_Paulo').format('HH:mm:ss')
      const dataDB = moment().tz('America/Sao_Paulo').toDate()

      /* ── Boosts ── */
      let boostMultiplier = 1
      try {
        const boostRecords = await Loja.findAll({
          where: {
            userId,
            item: { [Op.in]: ['Boost 2x Relatórios por 1 dia', 'Boost 4x Relatórios por 1 dia'] },
          },
        })
        let boostSum = 0
        for (const record of boostRecords) {
          if (record.item.includes('2x')) boostSum += 2
          if (record.item.includes('4x')) boostSum += 4
        }
        if (boostSum > 0) boostMultiplier = boostSum
      } catch (err) { /* ignora */ }

      /* ── DB ── */
      const relatorios = []
      for (let i = 0; i < boostMultiplier; i++) {
        relatorios.push({
          commanderId: userId,
          commanderName: userName,
          participants: i === 0 ? idApreendido : '',
          imageUrl: '',
          reportDate: dataDB,
          boostMultiplier,
        })
      }

      let novosRelatorios
      try {
        novosRelatorios = await ApreensaoReports.bulkCreate(relatorios)
      } catch (err) {
        console.error('Erro ao salvar relatórios de apreensão:', err)
        return interaction.editReply({ content: '❌ Erro ao salvar relatório.' })
      }

      const relatorioPrincipal = novosRelatorios[0]
      const numeroRelatorio = relatorioPrincipal.id

      /* ── Embed ── */
      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle(`📦 Relatório de Apreensão Nº${numeroRelatorio} - ${dataDisplay}`)
        .addFields(
          { name: '👮 Enviado por', value: `<@${userId}>`, inline: true },
          { name: '👤 Apreendido', value: `${nomeApreendido} (ID ${idApreendido})`, inline: true },
          { name: '📦 Itens', value: itens, inline: false },
          { name: '💰 Valor', value: valor, inline: true },
          { name: '🕒 Data e Hora', value: `${dataDisplay} às ${horaDisplay}`, inline: true },
        )
        .setFooter({ text: `Relatório enviado por: ${userName}` })

      const canalLog = interaction.guild.channels.cache.get(config.channels.apreensaoLog)
      if (!canalLog) {
        return interaction.editReply({ content: '❌ Canal de log de apreensões não encontrado.' })
      }

      const sent = await canalLog.send({ embeds: [embed] })
      await relatorioPrincipal.update({ messageId: sent.id })

      /* ── Pontos ── */
      const action = actionTypes.find(a => a.id_tipo === 'relatorio_apreensao')
      if (action) {
        const multRec = await UserMultiplicadores.findOne({ where: { userId } })
        const multiplicador = multRec ? multRec.multiplicador : 1
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
        content: `✅ Relatório de apreensão Nº${numeroRelatorio} criado com sucesso!`,
      })
    }
  },
}
