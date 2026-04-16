/*
 * Arquivo: interactionIdentificacao.js (versão com sobrescrita obrigatória)
 *
 * Objetivo:
 *   - Grava ou sobrescreve o registro de Identificação do usuário
 *     (se existir qualquer registro, ele será atualizado; caso contrário, criado).
 *   - Demais requisitos originais permanecem iguais.
 */
const { handleCopyMentions } = require('../utils/identificationExpiryUtils.js')
const config = require('../config')

const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js')

const moment = require('moment-timezone')
const fs = require('fs')
const path = require('path')
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args))

// Model
const { Identificacao } = require('../database.js')

// Diretório e URL de anexos
const ATTACHMENTS_DIR = path.join(__dirname, '..', 'attachments', 'identificacoes')
const STATIC_BASE_URL =
  process.env.STATIC_BASE_URL ||
  'https://www.bpolpolice.com.br/transcripts/attachments/identificacoes'

// Guild/Channel para logar negações
const LOG_GUILD_ID = config.guilds.logs
const LOG_CHANNEL_ID = config.logsChannels.identificacao

// Garante que o diretório exista
fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true })

// Mapa para impedir múltiplas identificações simultâneas
const activeIdentifications = new Map()

// IDs dos cargos autorizados a negar
const ALLOWED_ROLES = config.permissions.corregedoria

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Lida com "copy mentions" se for o caso
    if (await handleCopyMentions(interaction)) return

    /***********************************************************
     * 1) Botão "identificar_se"
     ***********************************************************/
    if (interaction.isButton() && interaction.customId === 'identificar_se') {
      if (interaction.deferred || interaction.replied) return
      const userId = interaction.user.id
      const displayName = interaction.member.displayName

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      // Bloqueia se já existe processo em andamento
      if (activeIdentifications.has(userId)) {
        return interaction.editReply({
          content:
            '⚠️ Você já possui uma identificação em andamento. Aguarde finalizar ou feche a anterior.',
        })
      }

      // Busca qualquer registro existente (não filtra status)
      let registroExistente = null
      const agora = moment().tz('America/Sao_Paulo')

      try {
        registroExistente = await Identificacao.findOne({ where: { userId } })
      } catch (error) {
        console.error('Erro ao consultar Identificacao:', error)
        return interaction.editReply({
          content:
            '❌ Ocorreu um erro ao verificar sua identificação no banco de dados.',
        })
      }

      // Se ativo e <7 dias, bloqueia; se ≥10 dias, marca como expirado
      if (registroExistente && registroExistente.status === 'ativo') {
        const diasPassados = agora.diff(
          moment(registroExistente.dataRegistro),
          'days',
        )

        if (diasPassados < 7) {
          const expiraEm = 7 - diasPassados
          const expiraTimestamp = moment(registroExistente.dataRegistro)
            .add(7, 'days')
            .unix()

          const embedNegacao = new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Você já possui uma identificação ativa!')
            .setDescription(
              `Sua identificação atual expirará em <t:${expiraTimestamp}:R> (daqui a **${expiraEm}** dia(s)).\n\n` +
                'Você só poderá fazer uma nova identificação após esse prazo.',
            )
            .setFooter({ text: 'Identificação ainda válida' })

          return interaction.editReply({ embeds: [embedNegacao] })
        }

        if (diasPassados >= 10) {
          try {
            await registroExistente.update({ status: 'expirado' })
          } catch (e) {
            console.error('Falha ao expirar identificação automaticamente:', e)
          }
        }
      }

      /***********************************************************
       * Cria canal temporário para upload
       ***********************************************************/
      let channel
      try {
        channel = await interaction.guild.channels.create({
          name: `identificacao-${displayName}`,
          parent: config.categories.tickets, // ID da categoria
          type: 0, // texto
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
              id: userId,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.AttachFiles,
              ],
            },
          ],
        })
      } catch (error) {
        console.error('Erro ao criar canal de identificação:', error)
        return interaction.editReply({
          content: '❌ Ocorreu um erro ao criar a sala de identificação.',
        })
      }

      activeIdentifications.set(userId, channel.id)

      await interaction.editReply({
        content: `✅ Sala de identificação criada: <#${channel.id}>. Siga as instruções lá.`,
      })

      await channel.send({
        content:
          `👋 **${displayName}**, envie agora a **imagem do seu personagem** (como anexo) ` +
          'para concluir a identificação. Se não enviar em 1 minuto, a sala será fechada automaticamente.',
      })

      const filter = msg => msg.author.id === userId && msg.attachments.size > 0
      const collector = channel.createMessageCollector({
        filter,
        max: 1,
        time: 60000,
      })

      collector.on('collect', async msg => {
        const attachment = msg.attachments.first()
        if (!attachment) return channel.send('⚠️ Nenhuma imagem encontrada.')

        /***********************************************************
         * Download & Save
         ***********************************************************/
        let publicUrl
        try {
          const response = await fetch(attachment.url)
          if (!response.ok) throw new Error('URL inacessível')
          const buffer = Buffer.from(await response.arrayBuffer())

          const ext = path.extname(attachment.name) || '.png'
          const fileName = `ident_${userId}_${Date.now()}${ext}`
          const localPath = path.join(ATTACHMENTS_DIR, fileName)
          await fs.promises.writeFile(localPath, buffer)

          publicUrl = `${STATIC_BASE_URL}/${fileName}`
        } catch (error) {
          console.error('Erro ao salvar imagem:', error)
          return channel.send('⚠️ Erro ao salvar a imagem. Tente novamente.')
        }

        /***********************************************************
         * Grava/Sobrescreve no BD
         ***********************************************************/
        const dataRegistro = agora.toDate()
        const dataExpiracao = moment(dataRegistro).add(7, 'days').toDate()
        let mensagemFinal

        try {
          if (registroExistente) {
            // sobrescreve registro existente
            Object.assign(registroExistente, {
              userName: displayName,
              fotoUrl: publicUrl,
              dataRegistro,
              dataExpiracao,
              status: 'ativo',
            })
            await registroExistente.save()
            mensagemFinal = `🪪 O oficial <@${userId}> **atualizou** sua identificação!`
          } else {
            // cria novo registro
            registroExistente = await Identificacao.create({
              userId,
              userName: displayName,
              fotoUrl: publicUrl,
              dataRegistro,
              dataExpiracao,
              status: 'ativo',
            })
            mensagemFinal = `🪪 O oficial <@${userId}> **realizou** sua identificação!`
          }
        } catch (error) {
          console.error('Erro BD:', error)
          return channel.send('❌ Erro ao salvar no banco de dados.')
        }

        /***********************************************************
         * Atribuir cargo de identificado
         ***********************************************************/
        try {
          const member = interaction.guild.members.cache.get(userId) ||
            await interaction.guild.members.fetch(userId).catch(() => null)
          if (member) {
            await member.roles.add(config.roles.identificado).catch(console.error)
            await member.roles.remove(config.roles.naoIdentificado).catch(console.error)
          }
        } catch (err) {
          console.error('Erro ao atribuir cargo de identificado:', err)
        }

        /***********************************************************
         * Limpeza & Embed final
         ***********************************************************/
        activeIdentifications.delete(userId)
        await channel.delete().catch(console.error)

        const registroUnix = Math.floor(dataRegistro.getTime() / 1000)
        const expiracaoUnix = Math.floor(dataExpiracao.getTime() / 1000)

        const file = new AttachmentBuilder(
          path.join(ATTACHMENTS_DIR, path.basename(publicUrl)),
          { name: 'identificacao.png' },
        )

        const embed = new EmbedBuilder()
          .setColor('#2f3136')
          .setTitle(`🪪 Identificação de ${displayName}`)
          .addFields({
            name: '📅 Informações:',
            value:
              `**Data do Registro:** <t:${registroUnix}:F>\n` +
              `**Expira:** <t:${expiracaoUnix}:R>`,
          })
          .setImage('attachment://identificacao.png')
          .setFooter({ text: '🆔 Identificação concluída com sucesso' })

        const denyButton = new ButtonBuilder()
          .setCustomId(`negar_identificacao_${registroExistente.id}`)
          .setLabel('❌')
          .setStyle(ButtonStyle.Secondary)

        const row = new ActionRowBuilder().addComponents(denyButton)

        const canalIdentificacao = interaction.guild.channels.cache.get(
          config.channels.identificacaoLog,
        )
        if (!canalIdentificacao) return

        const sentMessage = await canalIdentificacao.send({
          content: mensagemFinal,
          embeds: [embed],
          files: [file],
          components: [row],
        })

        await registroExistente.update({ messageId: sentMessage.id })

        // Log de identificação aceita na guild de logs
        try {
          const logGuild = await interaction.client.guilds
            .fetch(LOG_GUILD_ID)
            .catch(() => null)
          if (logGuild) {
            const logChannel =
              logGuild.channels.cache.get(LOG_CHANNEL_ID) ||
              (await logGuild.channels.fetch(LOG_CHANNEL_ID).catch(() => null))
            if (logChannel && logChannel.isTextBased()) {
              const logFiles = []
              const fotoName = path.basename(publicUrl || '')
              const localFoto = path.join(ATTACHMENTS_DIR, fotoName)
              if (fs.existsSync(localFoto)) {
                logFiles.push(
                  new AttachmentBuilder(localFoto, { name: 'ident_aceita.png' }),
                )
              }

              const embedLogAceita = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setAuthor({
                  name: `${config.branding.footerText} - Log de Identificações`,
                  iconURL: interaction.guild.iconURL() ?? undefined,
                })
                .setTitle('📸 Identificação Aceita')
                .addFields(
                  {
                    name: '👤 Oficial',
                    value: `<@${userId}>`,
                    inline: true,
                  },
                  {
                    name: '📅 Data Registro',
                    value: `<t:${registroUnix}:F>`,
                    inline: true,
                  },
                  {
                    name: '⏰ Data Expiração',
                    value: `<t:${expiracaoUnix}:F>`,
                    inline: true,
                  },
                )
                .setFooter({
                  text: `Sistema de Identificações - ${config.branding.footerText}`,
                  iconURL: interaction.client.user.displayAvatarURL(),
                })
                .setTimestamp()

              if (logFiles.length > 0) {
                embedLogAceita.setImage('attachment://ident_aceita.png')
              } else if (publicUrl) {
                embedLogAceita.setImage(publicUrl)
              }

              await logChannel.send({ embeds: [embedLogAceita], files: logFiles })
            }
          }
        } catch (err) {
          console.error('Erro ao enviar log de identificação aceita:', err)
        }
      })

      collector.on('end', async collected => {
        if (collected.size === 0) {
          activeIdentifications.delete(userId)
          try {
            await channel.send(
              '⏰ Tempo esgotado. Fechando a sala de identificação...',
            )
            setTimeout(() => channel.delete().catch(console.error), 3000)
          } catch (error) {
            console.error('Erro ao fechar canal após timeout:', error)
          }
        }
      })
    }

    /***********************************************************
     * 2) Botão "negar_identificacao_<registroId>"
     ***********************************************************/
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('negar_identificacao_')
    ) {
      const member = interaction.guild.members.cache.get(interaction.user.id)
      const hasAdmin = member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      )
      const hasAllowedRole = ALLOWED_ROLES.some(role =>
        member.roles.cache.has(role),
      )

      if (!hasAdmin && !hasAllowedRole) {
        return interaction.reply({
          content: '❌ Você não tem permissão para negar identificações.',
          flags: MessageFlags.Ephemeral,
        })
      }

      const registroId = interaction.customId.split('_')[2]

      const modal = new ModalBuilder()
        .setCustomId(`modal_negar_identificacao_${registroId}`)
        .setTitle('Negar Identificação')

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_negacao')
        .setLabel('Motivo da negação:')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(motivoInput))
      return interaction.showModal(modal)
    }

    /***********************************************************
     * 3) Modal "modal_negar_identificacao_<registroId>"
     ***********************************************************/
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('modal_negar_identificacao_')
    ) {
      const registroId = interaction.customId.split('_')[3]
      const motivo = interaction.fields.getTextInputValue('motivo_negacao')

      const member = interaction.guild.members.cache.get(interaction.user.id)
      const hasAdmin = member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      )
      const hasAllowedRole = ALLOWED_ROLES.some(role =>
        member.roles.cache.has(role),
      )

      if (!hasAdmin && !hasAllowedRole) {
        return interaction.reply({
          content: '❌ Você não tem permissão para negar identificações.',
          flags: MessageFlags.Ephemeral,
        })
      }

      // Busca registro
      let registro
      try {
        registro = await Identificacao.findOne({
          where: { id: registroId },
        })
      } catch (error) {
        console.error('Erro BD:', error)
      }

      if (!registro) {
        return interaction.reply({
          content: '⚠️ Registro não encontrado no banco de dados.',
          flags: MessageFlags.Ephemeral,
        })
      }

      // Remove mensagem original
      try {
        const canalIdent = interaction.guild.channels.cache.get(
          config.channels.identificacaoLog,
        )
        if (canalIdent && registro.messageId) {
          const msg = await canalIdent.messages
            .fetch(registro.messageId)
            .catch(() => null)
          if (msg) await msg.delete()
        }
      } catch (error) {
        console.error('Erro ao deletar mensagem de identificação:', error)
      }

      /***********************************************************
       * Log da negação
       ***********************************************************/
      ;(async () => {
        try {
          const logGuild = await interaction.client.guilds
            .fetch(LOG_GUILD_ID)
            .catch(() => null)
          if (!logGuild) return
          const logChannel =
            logGuild.channels.cache.get(LOG_CHANNEL_ID) ||
            (await logGuild.channels.fetch(LOG_CHANNEL_ID).catch(() => null))
          if (!logChannel || !logChannel.isTextBased()) return

          const embedLog = new EmbedBuilder()
            .setColor(0xff0000)
            .setAuthor({
              name: `${config.branding.footerText} - Log de Identificações`,
              iconURL: interaction.guild.iconURL() ?? undefined,
            })
            .setTitle('🚫 Identificação Negada')
            .setDescription(
              [
                `**👤 Oficial:** <@${registro.userId}>`,
                `**🛡️ Revisor:** <@${interaction.user.id}>`,
              ].join('\n'),
            )
            .addFields(
              {
                name: '📄 Motivo',
                value: `\`\`\`\n${motivo}\n\`\`\``,
                inline: false,
              },
              {
                name: '🆔 Registro',
                value: `\`${registro.id}\``,
                inline: true,
              },
              {
                name: '⏰ Data',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true,
              },
            )
            .setFooter({
              text: `Sistema de Identificações - ${config.branding.footerText}`,
              iconURL: interaction.client.user.displayAvatarURL(),
            })

          const files = []
          const fotoName = path.basename(registro.fotoUrl || '')
          const localFoto = path.join(ATTACHMENTS_DIR, fotoName)
          if (fs.existsSync(localFoto)) {
            files.push(
              new AttachmentBuilder(localFoto, {
                name: 'ident_negada.png',
              }),
            )
            embedLog.setImage('attachment://ident_negada.png')
          } else if (registro.fotoUrl) {
            embedLog.setImage(registro.fotoUrl)
          }

          await logChannel.send({ embeds: [embedLog], files })
        } catch (err) {
          console.error('Erro ao enviar log de negação:', err)
        }
      })()

      /***********************************************************
       * DM ao usuário
       ***********************************************************/
      try {
        const user = await interaction.client.users.fetch(registro.userId)

        const embedNegado = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('🚫 Identificação Negada')
          .setDescription('Sua identificação foi **recusada**.')
          .addFields(
            {
              name: '👤 Oficial',
              value: `<@${registro.userId}>`,
              inline: true,
            },
            {
              name: '🛡️ Revisor',
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
            {
              name: '📌 Motivo',
              value: `\`\`\`\n${motivo}\n\`\`\``,
              inline: false,
            },
            {
              name: '📅 Próximos passos',
              value:
                'Se precisar de esclarecimentos sobre a negativa, clique no botão abaixo para abrir um ticket.',
              inline: false,
            },
          )
          .setFooter({
            text: `${config.branding.footerText} - CORREGEDORIA`,
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTimestamp()

        const ticketButton = new ButtonBuilder()
          .setLabel('Abrir Ticket')
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${config.guilds.main}/${config.channels.tickets}`,
          )
          .setEmoji('🎟️')

        const dmRow = new ActionRowBuilder().addComponents(ticketButton)

        await user.send({
          embeds: [embedNegado],
          components: [dmRow],
        })
      } catch (error) {
        console.error('DM falhou:', error)
      }

      /***********************************************************
       * Remover cargo identificado e dar não identificado
       ***********************************************************/
      try {
        const targetMember = interaction.guild.members.cache.get(registro.userId) ||
          await interaction.guild.members.fetch(registro.userId).catch(() => null)
        if (targetMember) {
          await targetMember.roles.remove(config.roles.identificado).catch(console.error)
          await targetMember.roles.add(config.roles.naoIdentificado).catch(console.error)
        }
      } catch (err) {
        console.error('Erro ao remover cargo de identificado:', err)
      }

      /***********************************************************
       * Remove do banco
       ***********************************************************/
      try {
        await registro.destroy()
      } catch (error) {
        console.error('Erro ao remover registro:', error)
        return interaction.reply({
          content: '❌ Não foi possível remover o registro do banco.',
          flags: MessageFlags.Ephemeral,
        })
      }

      return interaction.reply({
        content:
          '✅ A identificação foi negada com sucesso e o registro removido.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
