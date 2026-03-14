const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js')
const config = require('../config')
const { Aposentadoria } = require('../database')
const { MessageFlags } = require('discord.js')

const APOSENTADORIA_CANAL = config.channels.pedidos // Canal de aposentadorias aprovadas e revisões
const CARGO_APOSENTADO = config.roles.aposentado // Cargo de aposentado
const CARGOS_MINIMOS = [
  // Cargos que **não** podem solicitar aposentadoria
  config.ranks.EST.roleId, // EST
  config.ranks.SD.roleId,  // SD
]

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (!interaction.isButton() && !interaction.isModalSubmit()) return

    /** 📌 Abrir Modal de Aposentadoria **/
    if (
      interaction.isButton() &&
      interaction.customId === 'solicitar_aposentadoria'
    ) {
      const member = interaction.member

      // Verifica se o usuário tem um cargo abaixo de 3º Sargento
      if (CARGOS_MINIMOS.some(roleId => member.roles.cache.has(roleId))) {
        return interaction.reply({
          content:
            '🚫 **Apenas policiais com 3º Sargento ou superior podem solicitar aposentadoria.**',
          flags: MessageFlags.Ephemeral,
        })
      }

      // Verifica se o usuário já tem uma aposentadoria ativa ou pendente
      const existingAposentadoria = await Aposentadoria.findOne({
        where: { userId: interaction.user.id, status: ['Ativo', 'Pendente'] },
      })
      if (existingAposentadoria) {
        return interaction.reply({
          content:
            '⚠️ **Você já possui uma solicitação de aposentadoria pendente ou ativa.**',
          flags: MessageFlags.Ephemeral,
        })
      }

      const modal = new ModalBuilder()
        .setCustomId(`motivo_aposentadoria_${interaction.user.id}`)
        .setTitle('📩 Solicitação de Aposentadoria')

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_input')
        .setLabel('📌 Motivo da aposentadoria:')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(
          'Explique detalhadamente o motivo da sua aposentadoria...'
        )
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(motivoInput))

      return await interaction.showModal(modal)
    }

    if (interaction.customId === 'sair_aposentadoria') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const aposentadoriaAtiva = await Aposentadoria.findOne({
        where: { userId: interaction.user.id, status: 'Ativo' },
      })

      if (!aposentadoriaAtiva) {
        return interaction.editReply({
          content: '⚠️ **Você não tem uma aposentadoria ativa.**',
          flags: MessageFlags.Ephemeral,
        })
      }

      // Atualiza o status da aposentadoria para "Inativo"
      await Aposentadoria.update(
        { status: 'Inativo' },
        { where: { userId: interaction.user.id } }
      )

      // Remove o cargo de aposentado
      await interaction.member.roles.remove(CARGO_APOSENTADO)
      // 🔹 Adiciona novamente o cargo membro ao sair da aposentadoria
      await interaction.member.roles
        .add(config.roles.membro)
        .catch(console.error)

      // 🔹 Reseta o nickname para o nome padrão do Discord
      try {
        await interaction.member.setNickname(null) // Define como "null" para resetar o nome
      } catch (error) {
        console.error(
          `Erro ao restaurar o nickname de ${interaction.user.id}:`,
          error
        )
      }
      await Aposentadoria.destroy({ where: { userId: interaction.user.id } })

      const aposentadoriaChannel =
        interaction.guild.channels.cache.get(APOSENTADORIA_CANAL)
      if (!aposentadoriaChannel) {
        console.error('Erro: Canal de aposentadoria não encontrado.')
        return interaction.editReply({
          content:
            '❌ Erro ao processar a solicitação. Tente novamente mais tarde.',
          flags: MessageFlags.Ephemeral,
        })
      }

      try {
        const message = await aposentadoriaChannel.messages.fetch(
          aposentadoriaAtiva.messageId
        )
        if (!message) {
          console.error(
            `Erro: Mensagem da aposentadoria não encontrada para o oficial ${interaction.user.id}`
          )
          return interaction.editReply({
            content: '❌ Erro ao encontrar o registro da aposentadoria.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const updatedEmbed = new EmbedBuilder()
          .setTitle('📜 Aposentadoria Finalizada')
          .setColor('#808080') // Cinza para indicar status inativo
          .setDescription(
            `🗓 **Data de Saída da Aposentadoria:** ${new Date().toLocaleDateString(
              'pt-BR'
            )}`
          )
          .addFields([
            {
              name: '👤 Ex-Aposentado',
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
            { name: '📜 Status', value: '**Inativo** ⚫', inline: true },
          ])
          .setThumbnail(interaction.user.displayAvatarURL())

        await message.edit({ embeds: [updatedEmbed] })

        return interaction.editReply({
          content: '✅ **Você saiu da aposentadoria com sucesso.**',
          flags: MessageFlags.Ephemeral,
        })
      } catch (error) {
        console.error(`Erro ao atualizar a mensagem da aposentadoria: ${error}`)
        return interaction.editReply({
          content: '❌ Erro ao atualizar o status da aposentadoria.',
          flags: MessageFlags.Ephemeral,
        })
      }
    }

    /** 📌 Processamento do Modal **/
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('motivo_aposentadoria_')
    ) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const motivo = interaction.fields.getTextInputValue('motivo_input')
      const hoje = new Date()
      const requestDate = hoje.toISOString()

      const aposentadoriaChannel =
        interaction.guild.channels.cache.get(APOSENTADORIA_CANAL)

      if (!aposentadoriaChannel) {
        console.error('Erro: Canal de aposentadoria não encontrado.')
        return interaction.editReply({
          content:
            '❌ Erro ao processar a solicitação. Tente novamente mais tarde.',
          flags: MessageFlags.Ephemeral,
        })
      }

      try {
        const embed = new EmbedBuilder()
          .setTitle('📜 Nova Solicitação de Aposentadoria')
          .setColor('#FFA500')
          .setDescription(
            `📅 **Data do Pedido:** ${hoje.toLocaleDateString(
              'pt-BR'
            )}\n\n📌 **Motivo:**\n\`\`\`${motivo}\`\`\``
          )
          .addFields(
            {
              name: '👤 Solicitante',
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
            { name: '📜 Status', value: '**Pendente** ⏳', inline: true }
          )
          .setThumbnail(interaction.user.displayAvatarURL())

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`aprovar_aposentadoria_${interaction.user.id}`)
            .setLabel('✅ Aprovar')
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(`recusar_aposentadoria_${interaction.user.id}`)
            .setLabel('❌ Recusar')
            .setStyle(ButtonStyle.Danger)
        )

        const message = await aposentadoriaChannel.send({
          embeds: [embed],
          components: [row],
        })

        await Aposentadoria.create({
          userId: interaction.user.id,
          userName: interaction.user.username,
          requestDate,
          motivo: motivo,
          status: 'Pendente',
          messageId: message.id,
          channelId: aposentadoriaChannel.id,
        })

        return interaction.editReply({
          content:
            '✅ **Sua solicitação de aposentadoria foi enviada para análise.**',
          flags: MessageFlags.Ephemeral,
        })
      } catch (error) {
        console.error(
          `Erro ao processar a solicitação de aposentadoria: ${error}`
        )
        return interaction.editReply({
          content:
            '❌ Ocorreu um erro ao processar sua solicitação. Tente novamente mais tarde.',
          flags: MessageFlags.Ephemeral,
        })
      }
    }

    /** 📌 Aprovar Aposentadoria **/
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('aprovar_aposentadoria_')
    ) {
      await interaction.deferUpdate()

      const userId = interaction.customId.split('_')[2]
      const aposentadoria = await Aposentadoria.findOne({
        where: { userId, status: 'Pendente' },
      })

      if (!aposentadoria) return

      const member = await interaction.guild.members
        .fetch(userId)
        .catch(() => null)
      if (!member) return

      await Aposentadoria.update({ status: 'Ativo' }, { where: { userId } })
      await member.roles.add(CARGO_APOSENTADO)

      const hoje = new Date().toLocaleDateString('pt-BR')
      await member.roles.remove(config.roles.membro).catch(console.error)

      // 🔹 Captura o nome original antes da alteração e salva no banco de dados
      const nomeOriginal = member.nickname || member.user.username
      await Aposentadoria.update({ nomeOriginal }, { where: { userId } })

      // 🔹 Substitui apenas a tag dentro dos colchetes para `[APO]`, mantendo o resto do nome igual
      const updatedNickname = nomeOriginal.replace(/\[.*?\]/, '[APO]')
      const finalNickname =
        updatedNickname === nomeOriginal
          ? `[APO] ${nomeOriginal}`
          : updatedNickname

      try {
        await member.setNickname(finalNickname)
      } catch (error) {
        console.error(`Erro ao alterar o nickname de ${userId}:`, error)
      }

      // ✅ Atualiza o embed no canal de aposentadoria
      const aposentadoriaChannel =
        interaction.guild.channels.cache.get(APOSENTADORIA_CANAL)
      const message = await aposentadoriaChannel.messages.fetch(
        aposentadoria.messageId
      )
      const updatedEmbed = new EmbedBuilder()
        .setTitle('🎖️ Policial Aposentado')
        .setColor('#32CD32') // Verde para indicar status ativo
        .setDescription(
          `🗓 **Data da Aposentadoria:** ${hoje}\n\n📌 **Motivo:**\n\`\`\`${aposentadoria.motivo}\`\`\``
        )
        .addFields([
          {
            name: '👤 Policial Aposentado',
            value: `<@${userId}>`,
            inline: true,
          },
          { name: '📜 Status', value: '**Ativo** ✅', inline: true },
          {
            name: '👮 Aprovado por',
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
        ])
        .setThumbnail(interaction.user.displayAvatarURL())

      await message.edit({ embeds: [updatedEmbed], components: [] })
    }

    /** 📌 Recusar Aposentadoria **/
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('recusar_aposentadoria_')
    ) {
      await interaction.deferUpdate()

      const userId = interaction.customId.split('_')[2]
      await Aposentadoria.update({ status: 'Recusado' }, { where: { userId } })

      const aposentadoriaChannel =
        interaction.guild.channels.cache.get(APOSENTADORIA_CANAL)
      const aposentadoria = await Aposentadoria.findOne({ where: { userId } })
      const message = await aposentadoriaChannel.messages.fetch(
        aposentadoria.messageId
      )
      await Aposentadoria.destroy({ where: { userId: interaction.user.id } })
      const updatedEmbed = new EmbedBuilder()
        .setTitle('📜 Solicitação de Aposentadoria')
        .setColor('#FF0000') // Vermelho para indicar recusado
        .setFields([
          { name: '👤 Solicitante', value: `<@${userId}>`, inline: true },
          { name: '📜 Status', value: '**Recusado** ❌', inline: true },
          {
            name: '👮 Recusado por',
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
        ])
        .setThumbnail(interaction.user.displayAvatarURL())

      await message.edit({ embeds: [updatedEmbed], components: [] })

      try {
        await interaction.guild.members.fetch(userId).then(async member => {
          await member.send(
            `❌ Sua solicitação de aposentadoria no servidor **${interaction.guild.name}** foi recusada.`
          )
        })
      } catch (error) {
        console.log(
          `⚠️ Não foi possível enviar mensagem privada para <@${userId}>. Provavelmente o DM está fechado.`
        )
      }
    }
  },
}
