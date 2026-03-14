const {
  Events,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js')
const config = require('../config')
const { UserPontos, UserActions, Loja } = require('../database')
const { MessageFlags } = require('discord.js')

// Array de itens – deve ser idêntico ao usado em setuploja.js
const lojaItens = [
  { nome: 'Descalço 1 dia', valor: 200, cargo: '1477408727203053714', expiracaoDias: 1 },
  { nome: 'Pular estágio Polícia', valor: 200, cargo: '1477408727203053712' },
  { nome: '-3 dias promoção', valor: 300, cargo: '1477408727215898737' },
  { nome: 'Black para Unidade', valor: 300, cargo: '1477408727215898739' },
  { nome: 'Coturno Branco 1 semana', valor: 300, cargo: '1477408727203053715', expiracaoDias: 7 },
  { nome: 'Heli 1 semana', valor: 300, cargo: '1477408727203053717', expiracaoDias: 7 },
  { nome: '-5 dias promoção', valor: 400, cargo: '1477408727215898736' },
  { nome: 'GTM 1 semana', valor: 500, cargo: '1477408727215898738', expiracaoDias: 7 },
  { nome: 'Pular estágio Unidade', valor: 500, cargo: '1477408727203053711' },
  { nome: '-10 dias promoção', valor: 700, cargo: '1477408727215898735' },
  { nome: 'Remover ADV', valor: 1000, cargo: '1477408727203053713' },
  { nome: '-15 dias promoção (Premium)', valor: 1000, cargo: '1477408727203053718' },
]

// Objeto para armazenar temporariamente as compras pendentes (chave: userId)
const pendingPurchases = new Map()

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    // ----- Ações por Botões -----
    if (interaction.isButton()) {
      const customId = interaction.customId
      // Botão "Ver Pontos"
      if (customId === 'ver_pontos') {
        const userRecord = await UserPontos.findOne({
          where: { userId: interaction.user.id },
        })
        const pontos = userRecord ? userRecord.pontos : 0
        const pontosEmbed = new EmbedBuilder()
          .setTitle('💰 Seus Pontos')
          .setDescription(`Você possui \`\`\`${pontos} pts\`\`\``)
          .setImage(
            'https://media.discordapp.net/attachments/1405588312248287415/1466211722288431188/banner.png?ex=6989c353&is=698871d3&hm=96647c0dfa993d7e72df72206065ce77bed92277730af3851a3584def71428da&=&format=webp&quality=lossless&width=1522&height=856',
          )
          .setColor('#00AAFF')
        return interaction.reply({
          embeds: [pontosEmbed],
          flags: MessageFlags.Ephemeral,
        })
      }
      // Botão "Histórico de Compras"
      else if (customId === 'historico_compras') {
        const compras = await Loja.findAll({
          where: { userId: interaction.user.id },
        })
        if (!compras || compras.length === 0) {
          return interaction.reply({
            content: 'Você não possui histórico de compras.',
            flags: MessageFlags.Ephemeral,
          })
        }
        const listaCompras = compras
          .map(c => {
            let expStr = ''
            if (c.dataExpiracao) {
              expStr = ` (Expira em: ${new Date(c.dataExpiracao).toLocaleString('pt-BR')})`
            }
            return `• ${c.item} - ${c.valor} pts${expStr}`
          })
          .join('\n')
        const historicoEmbed = new EmbedBuilder()
          .setTitle('🛍 Histórico de Compras')
          .setDescription(`\`\`\`${listaCompras}\`\`\``)
          .setColor('#00FF00')
          .setTimestamp()
          .setFooter({ text: 'Loja do BIG LTDA' })
        return interaction.reply({
          embeds: [historicoEmbed],
          flags: MessageFlags.Ephemeral,
        })
      }
      // Botão "Transferir Pontos"
      else if (customId === 'transferir_pontos') {
        const modal = new ModalBuilder()
          .setCustomId('modal_transferir_pontos')
          .setTitle('Transferir Pontos')

        const destinatarioInput = new TextInputBuilder()
          .setCustomId('destinatario')
          .setLabel('ID do usuário de destino')
          .setPlaceholder('ID do Discord (ex: 233987539264995328)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)

        const pontosInput = new TextInputBuilder()
          .setCustomId('pontos_transferir')
          .setLabel('Quantidade de pontos')
          .setPlaceholder('Digite a quantidade de pontos a transferir')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)

        const mensagemInput = new TextInputBuilder()
          .setCustomId('mensagem_personalizada')
          .setLabel('Mensagem personalizada')
          .setPlaceholder('Digite uma mensagem para o destinatário')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)

        modal.addComponents(
          new ActionRowBuilder().addComponents(destinatarioInput),
          new ActionRowBuilder().addComponents(pontosInput),
          new ActionRowBuilder().addComponents(mensagemInput),
        )

        return interaction.showModal(modal)
      }
      // Botão de confirmação da compra
      else if (customId.startsWith('confirm_purchase_')) {
        await interaction.deferUpdate()

        const userId = customId.split('_')[2]

        if (interaction.user.id !== userId || !pendingPurchases.has(userId)) {
          return await interaction.editReply({
            content: '❌ Compra expirada ou não encontrada.',
            embeds: [],
            components: [],
          })
        }

        // ⏳ Feedback imediato
        await interaction.editReply({
          content: '⏳ Processando sua compra...',
          embeds: [],
          components: [],
        })

        const purchase = pendingPurchases.get(userId)
        pendingPurchases.delete(userId)

        const userRecord = await UserPontos.findOne({
          where: { userId: interaction.user.id },
        })
        if (!userRecord || userRecord.pontos < purchase.totalCost) {
          return await interaction.editReply({
            content:
              '❌ Você não possui pontos suficientes para realizar essa compra.',
          })
        }

        // 🔥 Processamento da compra
        userRecord.pontos -= purchase.totalCost
        await userRecord.save()

        await UserActions.create({
          userId: interaction.user.id,
          id_tipo: 'compra',
          nome_tipo: purchase.selectedItems.map(item => item.nome).join(', '),
          pontos: -purchase.totalCost,
          multiplicador: 1,
          pontosRecebidos: -purchase.totalCost,
        })

        for (const index of purchase.selectedIndices) {
          const item = lojaItens[index]
          let dataExpiracao = null

          if (item.expiracaoDias) {
            dataExpiracao = new Date(Date.now() + item.expiracaoDias * 86400000)
          }

          await Loja.create({
            userId: interaction.user.id,
            item: item.nome,
            valor: item.valor,
            dataExpiracao: dataExpiracao,
            cargo: item.cargo || null,
          })

          if (item.cargo) {
            try {
              const role = interaction.guild.roles.cache.get(item.cargo)
              if (role) {
                await interaction.member.roles.add(role)
              }
            } catch (err) {
              console.error(
                `Erro ao atribuir cargo para o item ${item.nome}:`,
                err,
              )
            }
          }

        }

        // 🔥 Log da compra
        const logEmbed = new EmbedBuilder()
          .setAuthor({
            name: `${config.branding.footerText} - Loja`,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTitle('🛒 Compra Realizada')
          .setDescription(
            `O usuário <@${interaction.user.id}> realizou uma compra na loja.`,
          )
          .addFields(
            {
              name: '📌 Itens Comprados',
              value: `\`\`\`${purchase.itemsList}\`\`\``,
              inline: false,
            },
            {
              name: 'Total gasto',
              value: `\`\`\`${purchase.totalCost} pts\`\`\``,
              inline: true,
            },
            {
              name: 'Pontos restantes',
              value: `\`\`\`${userRecord.pontos} pts\`\`\``,
              inline: true,
            },
          )
          .setColor('#00FF00')
          .setTimestamp()
          .setFooter({ text: `Loja Donater - ${config.branding.footerText}` })

        const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
        if (logsGuild) {
          const logChannel = logsGuild.channels.cache.get(config.logsChannels.loja)
          if (logChannel) {
            await logChannel.send({ embeds: [logEmbed] })
          }
        }

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Compra Realizada com Sucesso')
          .setDescription(
            `Sua compra foi concluída com sucesso!\n\nItens Comprados:\n\`\`\`${purchase.itemsList}\`\`\`\nTotal Gasto: \`\`\`${purchase.totalCost} pts\`\`\``,
          )
          .setColor('#00FF00')
          .setTimestamp()

        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle('🙏 Compra Confirmada')
            .setDescription(
              'Heh heh heh… Boa compra! Parabéns pela sua compra resgatada com os pontos. Volte sempre! 😊',
            )
            .addFields({
              name: '📌 Itens Comprados',
              value: `\`\`\`${purchase.itemsList}\`\`\``,
            })
            .setImage(
              'https://media1.tenor.com/m/OXMw7dldVwMAAAAd/david-rose-bbb.gif',
            )
            .setColor('#FFD700')
            .setTimestamp()

          await interaction.user.send({ embeds: [dmEmbed] })
        } catch (error) {
          console.error('❌ Não foi possível enviar DM para o usuário:', error)
        }

        // ✅ Finaliza editando o embed para sucesso
        await interaction.editReply({
          content: '',
          embeds: [successEmbed],
          components: [],
        })
      }

      // Botão de cancelamento da compra
      else if (customId.startsWith('cancel_purchase_')) {
        const userId = customId.split('_')[2]
        if (interaction.user.id !== userId) {
          return interaction.reply({
            content: 'Você não pode cancelar uma compra de outro usuário.',
            flags: MessageFlags.Ephemeral,
          })
        }
        pendingPurchases.delete(userId)
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Compra Cancelada')
          .setDescription('Sua compra foi cancelada com sucesso.')
          .setColor('#FF0000')
          .setTimestamp()
        return interaction.update({
          embeds: [cancelEmbed],
          components: [],
        })
      }
    }

    // ----- Modal de Transferência -----
    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'modal_transferir_pontos'
    ) {
      const destinatarioId =
        interaction.fields.getTextInputValue('destinatario')
      const pontosTransferir = parseInt(
        interaction.fields.getTextInputValue('pontos_transferir'),
      )
      const mensagemPersonalizada =
        interaction.fields.getTextInputValue('mensagem_personalizada') ||
        'Você recebeu uma transferência de pontos!'
      if (isNaN(pontosTransferir) || pontosTransferir <= 0) {
        return interaction.reply({
          content: 'Quantidade de pontos inválida.',
          flags: MessageFlags.Ephemeral,
        })
      }
      const remetenteRecord = await UserPontos.findOne({
        where: { userId: interaction.user.id },
      })
      if (!remetenteRecord || remetenteRecord.pontos < pontosTransferir) {
        return interaction.reply({
          content: 'Você não possui pontos suficientes para transferir.',
          flags: MessageFlags.Ephemeral,
        })
      }
      const member = await interaction.guild.members
        .fetch(destinatarioId)
        .catch(() => null)
      if (!member) {
        return interaction.reply({
          content: 'Usuário não foi encontrado no servidor.',
          flags: MessageFlags.Ephemeral,
        })
      }
      remetenteRecord.pontos -= pontosTransferir
      await remetenteRecord.save()
      let destinatarioRecord = await UserPontos.findOne({
        where: { userId: destinatarioId },
      })
      if (destinatarioRecord) {
        destinatarioRecord.pontos += pontosTransferir
        await destinatarioRecord.save()
      } else {
        await UserPontos.create({
          userId: destinatarioId,
          pontos: pontosTransferir,
        })
      }
      try {
        const transferEmbed = new EmbedBuilder()
          .setTitle('🔄 Transferência de Pontos Recebida')
          .setDescription(
            `**De:** <@${interaction.user.id}>\n` +
              `**Pontos:** ${pontosTransferir} pts\n` +
              `**Mensagem:** \`\`\`${mensagemPersonalizada}\`\`\``,
          )
          .setImage(
            'https://media1.tenor.com/m/nisaHYy8yAYAAAAd/besito-catlove.gif',
          )
          .setColor('#00AAFF')
          .setTimestamp()
          .setFooter({ text: `Loja Donater - ${config.branding.footerText}` })
        await member.send({ embeds: [transferEmbed] })
      } catch (error) {
        console.error('Não foi possível enviar DM para o destinatário:', error)
      }
      try {
        // IDs da outra guild e do canal de log nela
        const OTHER_GUILD_ID = config.guilds.logs
        const OTHER_LOG_CHANNEL_ID = config.logsChannels.loja

        // Obtém a outra guild através do client
        const otherGuild = interaction.client.guilds.cache.get(OTHER_GUILD_ID)
        if (otherGuild) {
          // Busca o canal de log na outra guild
          const logChannel = otherGuild.channels.cache.get(OTHER_LOG_CHANNEL_ID)
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle('🔄 Log de Transferência de Pontos')
              .addFields(
                {
                  name: '👤 Remetente',
                  value: `<@${interaction.user.id}>`,
                  inline: false,
                },
                {
                  name: '👤 Destinatário',
                  value: `<@${destinatarioId}>`,
                  inline: false,
                },
                {
                  name: '💰 Pontos Transferidos',
                  value: `\`\`\`${pontosTransferir} pts\`\`\``,
                  inline: true,
                },
                {
                  name: '💡 Mensagem',
                  value: `\`\`\`${mensagemPersonalizada}\`\`\``,
                  inline: true,
                },
              )
              .setColor('#1E90FF')
              .setTimestamp()
              .setFooter({ text: `Loja Donater - ${config.branding.footerText}` })
            await logChannel.send({ embeds: [logEmbed] })
          } else {
            console.error('Canal de log não encontrado na outra guild.')
          }
        } else {
          console.error('Outra guild não encontrada.')
        }
      } catch (error) {
        console.error('Erro ao enviar log de transferência:', error)
      }
      return interaction.reply({
        content: 'Transferência realizada com sucesso!',
        flags: MessageFlags.Ephemeral,
      })
    }

    // ----- Menu de Seleção (Compra) -----
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'select_loja_items'
    ) {
      // Os valores do menu já são 0-indexados!
      const selectedIndices = interaction.values.map(val => parseInt(val))

      // Verifica o limite para o item "5 Relatórios em seu nome 2x por patente"
      for (const index of selectedIndices) {
        const item = lojaItens[index]
        if (item.nome === '5 Relatórios em seu nome 2x por patente') {
          const count = await Loja.count({
            where: { userId: interaction.user.id, item: item.nome },
          })
          if (count >= 2) {
            return interaction.reply({
              content:
                'Você já comprou o máximo permitido deste item (2 unidades).',
              flags: MessageFlags.Ephemeral,
            })
          }
        }
      }

      const selectedItems = selectedIndices
        .map(index => lojaItens[index])
        .filter(item => item)
      if (selectedItems.length === 0) {
        return interaction.reply({
          content: 'Nenhum item válido foi selecionado.',
          flags: MessageFlags.Ephemeral,
        })
      }
      const totalCost = selectedItems.reduce((acc, item) => acc + item.valor, 0)
      const userRecord = await UserPontos.findOne({
        where: { userId: interaction.user.id },
      })
      if (!userRecord || userRecord.pontos < totalCost) {
        return interaction.reply({
          content:
            'Você não possui pontos suficientes para realizar essa compra.',
          flags: MessageFlags.Ephemeral,
        })
      }

      const itemsList = selectedItems
        .map(item => {
          if (item.expiracaoDias) {
            const exp = new Date(
              Date.now() + item.expiracaoDias * 86400000,
            ).toLocaleString('pt-BR')
            return `• ${item.nome} - Expira em: ${exp}`
          }
          return `• ${item.nome}`
        })
        .join('\n')

      // Armazena os detalhes da compra pendente para este usuário
      pendingPurchases.set(interaction.user.id, {
        selectedIndices,
        selectedItems,
        totalCost,
        itemsList,
      })

      const confirmButton = new ButtonBuilder()
        .setCustomId(`confirm_purchase_${interaction.user.id}`)
        .setLabel('Confirmar Compra')
        .setStyle(ButtonStyle.Success)
      const cancelButton = new ButtonBuilder()
        .setCustomId(`cancel_purchase_${interaction.user.id}`)
        .setLabel('Cancelar Compra')
        .setStyle(ButtonStyle.Danger)
      const actionRow = new ActionRowBuilder().addComponents(
        confirmButton,
        cancelButton,
      )

      const confirmEmbed = new EmbedBuilder()
        .setTitle('Confirmar Compra')
        .setDescription(
          `Você selecionou os seguintes itens:\n\`\`\`${itemsList}\`\`\`\nTotal: \`\`\`${totalCost} pts\`\`\`\n\nClique em **Confirmar Compra** para finalizar ou em **Cancelar Compra** para abortar.`,
        )
        .setColor('#FFA500')

      return interaction.reply({
        embeds: [confirmEmbed],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
