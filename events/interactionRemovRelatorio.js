const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js')
const config = require('../config')
const {
  PrisonReports,
  ActionReports,
  ApreensaoReports,
} = require('../database.js')
const { Op } = require('sequelize')
const {
  UserPontos,
  UserActions,
  UserMultiplicadores,
} = require('../database.js')
const { MessageFlags } = require('discord.js')

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    // ─────────────────────────────────────────────────────────
    // 1) Botão "retirar_relatorio_<targetId>"
    //    -> Mostra modal para escolher tipo (acao/prisao/apreensao) e id.
    // ─────────────────────────────────────────────────────────
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('retirar_relatorio_')
    ) {
      const parts = interaction.customId.split('_')
      // Exemplo: ["retirar", "relatorio", "<targetId>"]
      const targetId = parts[2]

      const modal = new ModalBuilder()
        .setCustomId(`modal_retirar_relatorio_${targetId}`)
        .setTitle('Retirar Relatório')

      const tipoRelatorioInput = new TextInputBuilder()
        .setCustomId('tipo_relatorio')
        .setLabel('Tipo de Relatório (acao, prisao, apreensao)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: apreensao')
        .setRequired(true)

      const idRelatorioInput = new TextInputBuilder()
        .setCustomId('id_relatorio')
        .setLabel('ID do Relatório')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 407')
        .setRequired(true)

      const actionRow1 = new ActionRowBuilder().addComponents(
        tipoRelatorioInput
      )
      const actionRow2 = new ActionRowBuilder().addComponents(idRelatorioInput)
      modal.addComponents(actionRow1, actionRow2)

      console.log(
        `DEBUG: Mostrando modal de retirada de relatório para targetId ${targetId}`
      )
      await interaction.showModal(modal)
    }

    // ─────────────────────────────────────────────────────────
    // 2) Modal "modal_retirar_relatorio_<targetId>" submetido
    // ─────────────────────────────────────────────────────────
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('modal_retirar_relatorio_')
    ) {
      const parts = interaction.customId.split('_')
      // Exemplo: ["modal", "retirar", "relatorio", "<targetId>"]
      const targetId = parts[3]

      const tipoRelatorio = interaction.fields
        .getTextInputValue('tipo_relatorio')
        .toLowerCase()
        .trim()
      const idRelatorio = parseInt(
        interaction.fields.getTextInputValue('id_relatorio')
      )

      if (isNaN(idRelatorio) || idRelatorio <= 0) {
        return interaction.reply({
          content: '❌ ID de relatório inválido. Insira um número válido.',
          flags: MessageFlags.Ephemeral,
        })
      }

      let model
      switch (tipoRelatorio) {
        case 'acao':
          model = ActionReports
          break
        case 'prisao':
          model = PrisonReports
          break
        case 'apreensao':
          model = ApreensaoReports
          break
        default:
          return interaction.reply({
            content:
              '❌ Tipo de relatório inválido. Escolha entre "acao", "prisao" ou "apreensao".',
            flags: MessageFlags.Ephemeral,
          })
      }

      // Valida se o relatório pertence ao usuário target de duas formas:
      // - commanderId = targetId
      // - ou o targetId está em "participants"
      const condition = {
        id: idRelatorio,
        [Op.or]: [
          { commanderId: targetId },
          { participants: { [Op.like]: `%${targetId}%` } },
        ],
      }

      try {
        // Busca o relatório
        const report = await model.findOne({ where: condition })
        if (!report) {
          console.log(
            `DEBUG: Relatório ${idRelatorio} não encontrado ou não pertence a ${targetId}.`
          )
          return interaction.reply({
            content: `⚠️ Relatório ID ${idRelatorio} do tipo ${tipoRelatorio} não encontrado ou não pertence ao usuário selecionado.`,
            flags: MessageFlags.Ephemeral,
          })
        }

        // Pega a imagem se houver
        let imageUrl = report.imageUrl
        if (imageUrl) {
          imageUrl = imageUrl.trim()
          console.log(
            `DEBUG: imageUrl do relatório ${idRelatorio}: ${imageUrl}`
          )
        }

        // Exclui a mensagem do canal de relatórios (para "apreensao", "prisao" e "acao")
        if (
          tipoRelatorio === 'apreensao' ||
          tipoRelatorio === 'prisao' ||
          tipoRelatorio === 'acao'
        ) {
          let reportChannelId
          if (tipoRelatorio === 'apreensao') {
            reportChannelId = config.channels.apreensaoLog
          } else if (tipoRelatorio === 'prisao') {
            reportChannelId = config.channels.prisaoLog
          } else if (tipoRelatorio === 'acao') {
            reportChannelId = config.channels.acoesLog
          }
          const reportChannel =
            interaction.guild.channels.cache.get(reportChannelId)

          if (reportChannel && report.messageId) {
            try {
              console.log(
                `DEBUG: Tentando buscar mensagem com ID ${report.messageId} no canal ${reportChannelId}`
              )
              const msgToDelete = await reportChannel.messages.fetch(
                report.messageId
              )
              if (msgToDelete) {
                console.log(`DEBUG: Mensagem encontrada, deletando...`)
                await msgToDelete.delete()
              }
            } catch (err) {
              console.error(
                `Erro ao deletar a mensagem do relatório ${tipoRelatorio} pelo messageId ${report.messageId}:`,
                err
              )
            }
          } else {
            console.log(
              `DEBUG: Canal de relatórios ou messageId não encontrado para relatório ${idRelatorio} (${tipoRelatorio}).`
            )
          }
        }

        // Cria o Attachment p/ log (caso tenha imagemUrl)
        let file
        if (imageUrl) {
          file = new AttachmentBuilder(imageUrl, { name: 'relatorio.png' })
        }

        // Exclui o relatório do banco
        await report.destroy()
        console.log(
          `DEBUG: Relatório ${idRelatorio} (tipo: ${tipoRelatorio}) excluído do banco.`
        )

        // ------------- Ajusta Pontos -------------
        let baseRemovalPoints = 0
        if (tipoRelatorio === 'apreensao') {
          baseRemovalPoints = 6
        } else if (tipoRelatorio === 'prisao') {
          baseRemovalPoints = 11
        } else if (tipoRelatorio === 'acao') {
          baseRemovalPoints = 15
        }

        // Obtém o multiplicador do target (usuário dono do relatório)
        const targetMultiplierRecord = await UserMultiplicadores.findOne({
          where: { userId: targetId },
        })
        const targetMultiplier = targetMultiplierRecord
          ? targetMultiplierRecord.multiplicador
          : 1
        // Calcule o valor negativo a ser aplicado:
        const removalPoints = -(baseRemovalPoints * targetMultiplier)

        // Atualiza o total de pontos do targetId
        let userPoints = await UserPontos.findOne({
          where: { userId: targetId },
        })
        if (userPoints) {
          userPoints.pontos += removalPoints // removalPoints é negativo
          await userPoints.save()
        } else {
          await UserPontos.create({
            userId: targetId,
            pontos: removalPoints,
          })
        }

        // Cria log de "remoção de relatório" no UserActions
        await UserActions.create({
          userId: targetId,
          id_tipo: `remover_${tipoRelatorio}`,
          nome_tipo: `Remoção de relatório ${tipoRelatorio}`,
          pontos: -removalPoints,
          multiplicador: 1,
          pontosRecebidos: -removalPoints,
        })

        // 2) Se for "acao" ou "prisao", também remove 5 pontos dos participantes
        if (tipoRelatorio === 'acao' || tipoRelatorio === 'prisao') {
          const participantsStr = report.participants || ''
          const commanderId = report.commanderId || null

          const participantsArr = participantsStr
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)

          for (const participantId of participantsArr) {
            if (participantId === String(commanderId)) {
              continue
            }

            let partPoints = await UserPontos.findOne({
              where: { userId: participantId },
            })
            if (partPoints) {
              partPoints.pontos -= 5
              await partPoints.save()
            } else {
              await UserPontos.create({
                userId: participantId,
                pontos: -5,
              })
            }

            await UserActions.create({
              userId: participantId,
              id_tipo: `remover_participante_${tipoRelatorio}`,
              nome_tipo: `Remoção de participação em relatório ${tipoRelatorio}`,
              pontos: -5,
              multiplicador: 1,
              pontosRecebidos: -5,
            })
          }
        }

        // Responde ao autor do comando
        await interaction.reply({
          content: `✅ Relatório ID ${idRelatorio} do tipo ${tipoRelatorio} foi removido e pontos ajustados.`,
          flags: MessageFlags.Ephemeral,
        })
        const OTHER_GUILD_ID = config.guilds.logs;
        const OTHER_LOG_CHANNEL_ID = config.logsChannels.ticket;
        // LOG: Envia no canal de logs
        const otherGuild = interaction.client.guilds.cache.get(OTHER_GUILD_ID);
        if (otherGuild) {
          // Busca o canal de logs na outra guild
          const logChannel = otherGuild.channels.cache.get(OTHER_LOG_CHANNEL_ID);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setTitle('🗑️ Remoção de Relatório')
              .setColor('#FF5555')
              .setDescription('Um oficial removeu um relatório do sistema.')
              .addFields(
                {
                  name: '👤 Quem Removeu',
                  value: `<@${interaction.user.id}>`,
                  inline: true,
                },
                {
                  name: '📄 Tipo de Relatório',
                  value: tipoRelatorio,
                  inline: true,
                },
                {
                  name: '🆔 ID do Relatório',
                  value: `${idRelatorio}`,
                  inline: true,
                },
                {
                  name: '📌 Relatório de/para',
                  value: `<@${targetId}>`,
                  inline: true,
                }
              )
              .setThumbnail(
                interaction.user.displayAvatarURL({ dynamic: true })
              )
              .setFooter({
                text: 'Logs de remoção registrados',
                iconURL:
                  'https://cdn-icons-png.flaticon.com/512/1828/1828843.png',
              })
              .setTimestamp();

            if (file) {
              embed.setImage('attachment://relatorio.png');
              await logChannel.send({ embeds: [embed], files: [file] });
            } else {
              await logChannel.send({ embeds: [embed] });
            }

            console.log(
              `DEBUG: Log de remoção de relatório enviado p/ canal ${logChannel.id}`
            );
          } else {
            console.log(
              `DEBUG: Canal de logs não encontrado na outra guild (ID: ${OTHER_LOG_CHANNEL_ID}).`
            );
          }
        } else {
          console.log(
            `DEBUG: Outra guild não encontrada (ID: ${OTHER_GUILD_ID}).`
          );
        }
      } catch (error) {
        console.error('Erro ao remover relatório:', error);
        return interaction.reply({
          content:
            '❌ Ocorreu um erro ao tentar remover o relatório. Tente novamente mais tarde.',
          flags: MessageFlags.Ephemeral,
        });
      }}}}
