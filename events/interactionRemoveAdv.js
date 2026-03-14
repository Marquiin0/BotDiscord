/**
 * Arquivo: interactionRemoveAdv.js
 * Este script lida com a remoção de advertências (roles) de usuários,
 * usando modais para especificar o tipo de advertência e o motivo.
 *
 * Obs.: Para evitar conflitos com outros botões que usem o prefixo "remover_",
 * renomeamos este para "removerAdv_" tanto no botão quanto no modal.
 */

const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js')
const config = require('../config')
const { Warning } = require('../database')
const { UserPontos, UserActions } = require('../database.js')
const { MessageFlags } = require('discord.js')

const rolesMap = {
  verbal: { id: config.roles.adv1, name: 'ADV VERBAL' },
  adv1: { id: config.roles.adv1, name: 'ADV 1' },
  adv2: { id: config.roles.adv2, name: 'ADV 2' },
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (!interaction.isButton() && !interaction.isModalSubmit()) return

    // Usamos o prefixo "removerAdv_" para evitar conflitos
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('removerAdv_')
    ) {
      const userId = interaction.customId.substring('removerAdv_'.length)
      const modal = new ModalBuilder()
        .setCustomId(`modal_removerAdv_${userId}`)
        .setTitle('🔄 Remover Advertência')

      const roleInput = new TextInputBuilder()
        .setCustomId('tipo_adv')
        .setLabel('Tipo de Advertência (VERBAL, ADV1, ADV2)')
        .setPlaceholder('Digite VERBAL, ADV1 ou ADV2')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)

      const reasonInput = new TextInputBuilder()
        .setCustomId('motivo_remocao')
        .setLabel('Motivo da Remoção')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)

      modal.addComponents(
        new ActionRowBuilder().addComponents(roleInput),
        new ActionRowBuilder().addComponents(reasonInput),
      )

      await interaction.showModal(modal)
      return
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('modal_removerAdv_')
    ) {
      const userId = interaction.customId.replace('modal_removerAdv_', '')
      const typeInput = interaction.fields
        .getTextInputValue('tipo_adv')
        .toLowerCase()
      const reason = interaction.fields.getTextInputValue('motivo_remocao')
      const roleData = rolesMap[typeInput]

      if (!roleData) {
        return interaction.reply({
          content:
            '⚠️ Tipo de advertência inválido. Use: **VERBAL, ADV1 ou ADV2**.',
          flags: MessageFlags.Ephemeral,
        })
      }

      const member = await interaction.guild.members
        .fetch(userId)
        .catch(() => null)
      if (!member) {
        return interaction.reply({
          content: `⚠️ O usuário <@${userId}> não foi encontrado no servidor.`,
          flags: MessageFlags.Ephemeral,
        })
      }

      const existingWarning = await Warning.findOne({
        where: { userId, roleId: roleData.id },
      })
      if (!existingWarning) {
        return interaction.reply({
          content: `⚠️ O usuário **não possui** uma advertência ativa do tipo **${roleData.name}**.`,
          flags: MessageFlags.Ephemeral,
        })
      }

      // Remove o cargo do membro e o registro no banco
      await member.roles.remove(roleData.id)
      await Warning.destroy({ where: { userId, roleId: roleData.id } })

      // Define a devolução dos pontos conforme o tipo:
      // ADV VERBAL: +100, ADV 1: +200, ADV 2: +300
      let pointsToReturn = 0
      if (typeInput === 'verbal') {
        pointsToReturn = 100
      } else if (typeInput === 'adv1') {
        pointsToReturn = 200
      } else if (typeInput === 'adv2') {
        pointsToReturn = 300
      }

      // Atualiza o total de pontos do usuário no banco
      let userPontosRecord = await UserPontos.findOne({ where: { userId } })
      if (userPontosRecord) {
        userPontosRecord.pontos += pointsToReturn
        await userPontosRecord.save()
      } else {
        await UserPontos.create({
          userId,
          pontos: pointsToReturn,
        })
      }

      // Registra a ação de retorno de pontos no UserActions
      await UserActions.create({
        userId,
        id_tipo: typeInput,
        nome_tipo: `Remoção de Advertência ${roleData.name}`,
        pontos: pointsToReturn,
        multiplicador: 1,
        pontosRecebidos: pointsToReturn,
      })

      // Cria o embed para o canal de advertências
      const removalEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🔄 Advertência Removida')
        .setDescription(`A advertência de <@${userId}> foi removida.`)
        .addFields(
          { name: '👤 Oficial', value: `<@${userId}>`, inline: true },
          {
            name: '⚠️ Tipo de Advertência',
            value: `<@&${roleData.id}>`,
            inline: true,
          },
          { name: '📌 Motivo', value: reason, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: `${config.branding.footerText} CORREGEDORIA` })

      // IDs da outra guild e do canal de log nela
      const OTHER_GUILD_ID = config.guilds.logs
      const OTHER_LOG_CHANNEL_ID = config.logsChannels.corregedoria

      // Cria o embed para o canal de logs sem o campo de tipo
      const logEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📋 Log de Remoção de Advertência')
        .setDescription('Uma advertência foi removida.')
        .addFields(
          {
            name: 'Removido por',
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
          { name: 'Oficial', value: `<@${userId}>`, inline: true },
          { name: '📌 Motivo', value: reason, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: `${config.branding.footerText} CORREGEDORIA` })

      // Obtém a outra guild pelo client
      const otherGuild = interaction.client.guilds.cache.get(OTHER_GUILD_ID)
      if (otherGuild) {
        const logChannel = otherGuild.channels.cache.get(OTHER_LOG_CHANNEL_ID)
          || await otherGuild.channels.fetch(OTHER_LOG_CHANNEL_ID).catch(() => null)
        if (logChannel) {
          await logChannel.send({ embeds: [logEmbed] })
        } else {
          console.error('Canal de corregedoria não encontrado no servidor de logs:', OTHER_LOG_CHANNEL_ID)
        }
      } else {
        console.error('Guild de logs não encontrada:', OTHER_GUILD_ID)
      }

      // Cria o embed de confirmação para feedback ao moderador e para DM
      const confirmEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🔄 Advertência Removida')
        .setDescription(`A advertência de <@${userId}> foi removida.`)
        .addFields(
          { name: '👤 Oficial', value: `<@${userId}>`, inline: true },
          {
            name: '⚠️ Tipo de Advertência',
            value: `<@&${roleData.id}>`,
            inline: true,
          },
          { name: '📌 Motivo', value: reason, inline: false },
        )
        .setTimestamp()
        .setFooter({
          text: `${config.branding.footerText} CORREGEDORIA`,
          iconURL:
            'https://media.discordapp.net/attachments/1405588312248287415/1466211750314512626/perfil.png?ex=6989c35a&is=698871da&hm=b15ab858c2376178da396902d4bd4d9b62619450951e30f2471a029b38e63edc&=&format=webp&quality=lossless&width=960&height=960',
        })

      try {
        await member.send({
          content: `🔄 Sua advertência no servidor **${interaction.guild.name}** foi removida.`,
          embeds: [confirmEmbed],
        })
      } catch (error) {
        console.log(
          `Não foi possível enviar a mensagem para ${member.user.tag}.`,
        )
      }

      await interaction.reply({
        content: '✅ Advertência removida com sucesso!',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
