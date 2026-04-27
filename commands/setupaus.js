const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
} = require('discord.js')
const { Ausencia } = require('../database')
const { MessageFlags } = require('discord.js')
const path = require('path')
const config = require('../config')
const { attachImage } = require('../utils/attachImage')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupausencia')
    .setDescription('Configura um sistema de ausência para usuários.'),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
      !interaction.memberPermissions.has(PermissionsBitField.Flags.UseApplicationCommands)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🌴 ${config.branding.name} — Solicitação de Ausência`)
      .setDescription(
        '📅 Selecione abaixo quantos dias você precisará ficar afastado.\n\n' +
        'Após escolher, será aberto um modal para você informar o **motivo**.\n' +
        'Use o botão **Sair de Ausência** para cancelar uma ausência ativa.'
      )
      .setColor(config.branding.color)
      .setFooter({ text: config.branding.footerText })
    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_dias_ausencia')
        .setPlaceholder('Selecione a quantidade de dias')
        .addOptions(
          { label: '☝️ 1 dia', value: '1' },
          { label: '✌️ 2 dias', value: '2' },
          { label: '👌 3 dias', value: '3' },
          { label: '🖐️ 5 dias', value: '5' },
          { label: '🖐️🖐️ 10 dias', value: '10' },
          { label: '🖐️🖐️🖐️ 15 dias', value: '15' }
        )
    )

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('sair_ausencia')
        .setLabel('🚪 Sair de Ausência')
        .setStyle(ButtonStyle.Secondary)
    )

    // Envia o componente para o canal específico
    const channel = interaction.guild.channels.cache.get(config.channels.ausencia)
    if (channel) {
      await channel.send({ embeds: [embed], components: [selectMenu, row], files: [banner.attachment] })
      await interaction.reply({
        content: 'Componentes de ausência enviados para o canal especificado.',
        flags: MessageFlags.Ephemeral,
      })
    } else {
      await interaction.reply({
        content: 'Erro: Não foi possível encontrar o canal.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },

  // ===================================================================
  // Quando o usuário seleciona a quantidade de dias
  // ===================================================================
  async handleSelectMenuInteraction(interaction) {
    const selectedDays = parseInt(interaction.values[0])

    const now = new Date()
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())) // Primeiro dia da semana (domingo)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6) // Último dia da semana (sábado)

    console.log(
      `[DEBUG] Verificando ausências existentes para o usuário: ${interaction.user.id}`
    )

    const existingEntries = await Ausencia.findAll({
      where: {
        userId: interaction.user.id,
        status: 'Ativa',
      },
    })

    console.log(
      `[DEBUG] Total de ausências ativas encontradas: ${existingEntries.length}`
    )
    if (existingEntries.length > 0) {
      console.log(`[DEBUG] Usuário já possui uma ausência ativa.`)
      return interaction.reply({
        content:
          'Você já possui uma ausência ativa nesta semana. Não é possível registrar outra até a próxima semana.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const modal = new ModalBuilder()
      .setCustomId('motivo_ausencia')
      .setTitle('Motivo da Ausência')

    const motivoInput = new TextInputBuilder()
      .setCustomId('motivo_input')
      .setLabel('Informe o motivo da sua ausência:')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Escreva o motivo da ausência aqui...')
      .setRequired(true)

    const motivoActionRow = new ActionRowBuilder().addComponents(motivoInput)
    modal.addComponents(motivoActionRow)

    // Armazenamos a quantidade de dias no client para recuperar no modal
    interaction.client.ausenciaDias = selectedDays

    await interaction.showModal(modal)
  },

  // ===================================================================
  // Quando o usuário clica em 'Sair de Ausência'
  // ===================================================================
  async handleSairAusencia(interaction) {
    try {
      const ausenciaAtiva = await Ausencia.findOne({
        where: {
          userId: interaction.user.id,
          status: 'Ativa',
        },
      })

      if (!ausenciaAtiva) {
        console.log(
          `[DEBUG] Nenhuma ausência ativa encontrada para o usuário: ${interaction.user.id}`
        )
        return interaction.reply({
          content: 'Você não tem uma ausência ativa no momento.',
          flags: MessageFlags.Ephemeral,
        })
      }

      // Atualiza banco de dados para 'Inativo'
      await Ausencia.update(
        { status: 'Inativo' },
        {
          where: {
            userId: interaction.user.id,
            status: 'Ativa',
          },
        }
      )

      // Remove cargo de ausência
      await interaction.member.roles.remove(config.roles.ausencia)

      // Caso queira atualizar a mensagem original (no canal de ausências):
      const channel = interaction.guild.channels.cache.get(
        ausenciaAtiva.channelId
      )
      if (channel) {
        try {
          const message = await channel.messages.fetch(ausenciaAtiva.messageId)
          if (message) {
            const startDateLocal = new Date(
              ausenciaAtiva.startDate
            ).toLocaleDateString('pt-BR')
            const endDateLocal = new Date(
              ausenciaAtiva.endDate
            ).toLocaleDateString('pt-BR')
            const updatedEmbed = new EmbedBuilder()
              .setTitle('✅ Retorno de Ausência (Encerrou)')
              .setColor('#FF0000') // Vermelho para status Inativo
              .setDescription(
                `O oficial <@${ausenciaAtiva.userId}> retornou de ausência e está novamente ativo.`
              )
              .addFields(
                {
                  name: '👤 QRA',
                  value: ausenciaAtiva.userName
                    ? `<@${ausenciaAtiva.userId}> - ${ausenciaAtiva.userName}`
                    : `<@${ausenciaAtiva.userId}>`,
                  inline: true,
                },
                {
                  name: '📅 Período',
                  value: `${startDateLocal} → ${endDateLocal}`,
                  inline: true,
                },
                {
                  name: '📝 Motivo',
                  value: ausenciaAtiva.motivo || 'Não especificado',
                  inline: false,
                }
              )
              .setThumbnail(
                interaction.user.displayAvatarURL({ dynamic: true })
              )
              .setFooter({
                text: 'Status: Inativo • Encerrou',
                iconURL:
                  'https://cdn-icons-png.flaticon.com/512/5974/5974771.png',
              })
              .setTimestamp()
            await message.edit({ embeds: [updatedEmbed] })
          }
        } catch (error) {
          console.error(`[DEBUG] Erro ao buscar ou editar a mensagem: ${error}`)
        }
      }

      // Envia um aviso ephemeral ao usuário que saiu da ausência
      await interaction.reply({
        content: 'Você saiu da ausência com sucesso.',
        flags: MessageFlags.Ephemeral,
      })

      // =============================
      // Loga no canal de ausência log que o usuário saiu de ausência
      // =============================
      const logChannel = interaction.guild.channels.cache.get(
        config.channels.ausenciaLog
      )
      if (logChannel) {
        const startDateLocal = new Date(
          ausenciaAtiva.startDate
        ).toLocaleDateString('pt-BR')
        const endDateLocal = new Date(ausenciaAtiva.endDate).toLocaleDateString(
          'pt-BR'
        )

        const embed = new EmbedBuilder()
          .setTitle('✅ Retorno de Ausência')
          .setColor('#FF0000')
          .setDescription(
            `O oficial <@${interaction.user.id}> **retornou da ausência** e está novamente ativo.`
          )
          .addFields(
            {
              name: '👤 **QRA**',
              value: `<@${interaction.user.id}> - ${
                ausenciaAtiva.userName || 'Não informado'
              }`,
              inline: true,
            },
            {
              name: '📅 **Período**',
              value: `🗓️ ${startDateLocal} → ${endDateLocal}`,
              inline: true,
            },
            {
              name: '📝 **Motivo**',
              value: `🗒️ ${ausenciaAtiva.motivo || 'Não especificado'}`,
              inline: false,
            }
          )
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setFooter({
            text: 'Status: Inativo • Ausência finalizada',
            iconURL: 'https://cdn-icons-png.flaticon.com/512/5974/5974771.png',
          })
          .setTimestamp()

        await logChannel.send({ embeds: [embed] })
      }

      // Log de ausência cancelada na guild de logs
      try {
        const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
        const logChannelLogs = logsGuild?.channels.cache.get(config.logsChannels.ausencia)
        if (logChannelLogs) {
          const startDateLog = new Date(ausenciaAtiva.startDate).toLocaleDateString('pt-BR')
          const endDateLog = new Date(ausenciaAtiva.endDate).toLocaleDateString('pt-BR')
          const logEmbed = new EmbedBuilder()
            .setTitle('📋 Log de Ausência - Cancelada')
            .setColor('#FF0000')
            .addFields(
              { name: '👤 Oficial', value: `<@${interaction.user.id}>`, inline: true },
              { name: '⏱️ Duração', value: `${startDateLog} → ${endDateLog}`, inline: true },
              { name: '📝 Motivo', value: ausenciaAtiva.motivo || 'Não especificado', inline: false },
              { name: '📅 Data início', value: startDateLog, inline: true },
              { name: '📅 Data fim', value: endDateLog, inline: true },
            )
            .setFooter({ text: config.branding.footerText })
            .setTimestamp()
          await logChannelLogs.send({ embeds: [logEmbed] })
        }
      } catch (err) {
        console.error('[LOG] Erro ao enviar log de ausência cancelada:', err)
      }
    } catch (error) {
      console.error('Erro ao processar a interação de sair de ausência:', error)
      interaction.reply({
        content: 'Ocorreu um erro ao tentar sair da ausência.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },

  // ===================================================================
  // Quando o usuário submete o Modal "motivo_ausencia"
  // ===================================================================
  async handleModalSubmit(interaction) {
    if (interaction.customId === 'motivo_ausencia') {
      const motivo = interaction.fields.getTextInputValue('motivo_input')
      const diasAusencia = interaction.client.ausenciaDias
      const hoje = new Date()
      const fimAusencia = new Date()
      fimAusencia.setDate(hoje.getDate() + diasAusencia)

      const startDate = hoje.toISOString()
      const endDate = fimAusencia.toISOString()
      const startDateLocal = hoje.toLocaleDateString('pt-BR')
      const endDateLocal = fimAusencia.toLocaleDateString('pt-BR')

      // Cria o embed para registrar a ausência (status Ativo)
      const absenceEmbed = new EmbedBuilder()
        .setTitle(`🌴 ${config.branding.name} — Ausência Registrada`)
        .setColor(config.branding.color)
        .setDescription(`O membro <@${interaction.user.id}> está oficialmente em ausência.`)
        .addFields(
          {
            name: '👤 QRA',
            value: `<@${interaction.user.id}> - ${interaction.user.username}`,
            inline: true,
          },
          {
            name: '📅 Período',
            value: `${startDateLocal} → ${endDateLocal}`,
            inline: true,
          },
          {
            name: '⏱️ Duração',
            value: `${diasAusencia} dia(s)`,
            inline: true,
          },
          {
            name: '📝 Motivo',
            value: motivo || 'Não especificado',
            inline: false,
          }
        )
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setFooter({
          text: `${config.branding.footerText} • Status: Ativo`,
          iconURL: 'https://cdn-icons-png.flaticon.com/512/845/845646.png',
        })
        .setTimestamp()

      // Envia o embed no canal de ausência log
      const absenceChannel = interaction.guild.channels.cache.get(
        config.channels.ausenciaLog
      )
      if (absenceChannel) {
        const absenceMessage = await absenceChannel.send({
          embeds: [absenceEmbed],
        })

        // Cria o registro no banco de dados
        await Ausencia.create({
          userId: interaction.user.id,
          userName: interaction.user.username,
          startDate,
          endDate,
          motivo: motivo,
          messageId: absenceMessage.id,
          channelId: absenceChannel.id,
          status: 'Ativa',
        })

        // Adiciona o cargo de ausência ao usuário
        await interaction.member.roles.add(config.roles.ausencia)
        await interaction.reply({
          content: 'Sua ausência foi registrada com sucesso.',
          flags: MessageFlags.Ephemeral,
        })

        // Log de ausência criada na guild de logs
        try {
          const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
          const logChannelLogs = logsGuild?.channels.cache.get(config.logsChannels.ausencia)
          if (logChannelLogs) {
            const logEmbed = new EmbedBuilder()
              .setTitle('📋 Log de Ausência - Criada')
              .setColor('#00FF00')
              .addFields(
                { name: '👤 Oficial', value: `<@${interaction.user.id}>`, inline: true },
                { name: '⏱️ Duração', value: `${diasAusencia} dia(s)`, inline: true },
                { name: '📝 Motivo', value: motivo || 'Não especificado', inline: false },
                { name: '📅 Data início', value: startDateLocal, inline: true },
                { name: '📅 Data fim', value: endDateLocal, inline: true },
              )
              .setFooter({ text: config.branding.footerText })
              .setTimestamp()
            await logChannelLogs.send({ embeds: [logEmbed] })
          }
        } catch (err) {
          console.error('[LOG] Erro ao enviar log de ausência criada:', err)
        }

        // Ao término do período, atualiza o embed para "Inativo" e remove o cargo
        setTimeout(async () => {
          await interaction.member.roles
            .remove(config.roles.ausencia)
            .catch(() => {})
          await Ausencia.update(
            { status: 'Inativo' },
            {
              where: { userId: interaction.user.id, startDate },
            }
          ).catch(() => {})
          try {
            const msg = await absenceChannel.messages.fetch(absenceMessage.id)
            if (msg) {
              const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
                .setColor('#FF0000') // Vermelho para "Inativo"
                .setFooter({
                  text: `${config.branding.footerText} • Status: Inativo • Expirado`,
                  iconURL:
                    'https://cdn-icons-png.flaticon.com/512/845/845646.png',
                })
                .setTimestamp()
              await msg.edit({ embeds: [updatedEmbed] })
            }
          } catch (error) {
            console.error(
              `[DEBUG] Erro ao atualizar a mensagem após expiração: ${error}`
            )
          }
        }, diasAusencia * 24 * 60 * 60 * 1000)
      } else {
        await interaction.reply({
          content: 'Erro: Não foi possível encontrar o canal de ausência.',
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}
