const { PatrolSession } = require('../database')
const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')
const moment = require('moment-timezone')

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isButton()) return
    if (interaction.deferred || interaction.replied) return

    const customId = interaction.customId

    // Botão: Ainda estou no jogo
    if (customId.startsWith('patrol_still_playing_')) {
      const sessionId = customId.replace('patrol_still_playing_', '')

      try {
        const session = await PatrolSession.findOne({
          where: { id: sessionId, discordId: interaction.user.id, exitTime: null },
        })

        if (!session) {
          return await interaction.reply({
            content: '⚠️ Sessão não encontrada ou já encerrada.',
            flags: MessageFlags.Ephemeral,
          })
        }

        // Próxima verificação em 3 horas
        await session.update({ nextCheckAt: moment().add(3, 'hours').toDate() })

        // Desabilitar botões da mensagem
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`patrol_done_playing_${session.id}`)
            .setLabel('Ainda estou no jogo')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎮')
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`patrol_done_crashed_${session.id}`)
            .setLabel('Crashei')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('💥')
            .setDisabled(true),
        )
        await interaction.message.edit({ components: [disabledRow] })

        await interaction.reply({
          content: '✅ Sessão confirmada! Suas horas continuam sendo contabilizadas. Próxima verificação em 3 horas.',
          flags: MessageFlags.Ephemeral,
        })

        console.log(`[PatrolCheck] ${interaction.user.tag} confirmou que ainda está no jogo (sessão ${sessionId})`)
      } catch (err) {
        console.error('[PatrolCheck] Erro ao processar still_playing:', err)
        await interaction.reply({
          content: '❌ Erro ao processar. Tente novamente.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {})
      }
      return
    }

    // Botão: Crashei
    if (customId.startsWith('patrol_crashed_')) {
      const sessionId = customId.replace('patrol_crashed_', '')

      try {
        const session = await PatrolSession.findOne({
          where: { id: sessionId, discordId: interaction.user.id, exitTime: null },
        })

        if (!session) {
          return await interaction.reply({
            content: '⚠️ Sessão não encontrada ou já encerrada.',
            flags: MessageFlags.Ephemeral,
          })
        }

        // Fechar sessão - conta 3 horas a partir do entryTime
        const exitTime = moment(session.entryTime).add(3, 'hours').toDate()
        const duration = 3.0

        await session.update({
          exitTime,
          duration,
          nextCheckAt: null,
        })

        // Desabilitar botões da mensagem
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`patrol_done_playing_${session.id}`)
            .setLabel('Ainda estou no jogo')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎮')
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`patrol_done_crashed_${session.id}`)
            .setLabel('Crashei')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('💥')
            .setDisabled(true),
        )
        await interaction.message.edit({ components: [disabledRow] })

        await interaction.reply({
          content: `✅ Sessão encerrada. Foram contabilizadas **3.0h** de patrulha. Quando voltar ao jogo, entre em toggle novamente para iniciar uma nova sessão.`,
          flags: MessageFlags.Ephemeral,
        })

        console.log(`[PatrolCheck] ${interaction.user.tag} reportou crash (sessão ${sessionId}, 3.0h contabilizadas)`)
      } catch (err) {
        console.error('[PatrolCheck] Erro ao processar crashed:', err)
        await interaction.reply({
          content: '❌ Erro ao processar. Tente novamente.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {})
      }
      return
    }
  },
}
