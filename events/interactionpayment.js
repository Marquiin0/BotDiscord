const { Events, EmbedBuilder, AttachmentBuilder } = require('discord.js')
const axios = require('axios')
const { UserPontos, UserActions } = require('../database') // Ajuste conforme sua estrutura

const ACCESS_TOKEN =
  'APP_USR-3416748002451653-031301-9298b5509f9fdeb6b5a6e638087bbef4-295571394'
const WEBHOOK_URL = 'https://c431-158-247-122-78.ngrok-free.app/webhook'
const { MessageFlags } = require('discord.js')
const config = require('../config')

// Função auxiliar para consultar o status do pagamento
async function checkPaymentStatus(paymentId) {
  try {
    const response = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      },
    )
    return response.data
  } catch (err) {
    console.error('Erro ao checar status do pagamento:', err)
    return null
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (
      !interaction.isStringSelectMenu() ||
      interaction.customId !== 'select_pagamento_produto'
    )
      return

    global.activePayments = global.activePayments || {}
    global.paymentMessages = global.paymentMessages || {}

    // Se o usuário já possui um pagamento ativo, cancela-o e atualiza a mensagem antiga
    if (global.activePayments[interaction.user.id]) {
      clearInterval(global.activePayments[interaction.user.id].interval)
      const oldPaymentId = global.activePayments[interaction.user.id].paymentId
      if (global.paymentMessages[oldPaymentId]) {
        try {
          const { channelId, messageId, embed } =
            global.paymentMessages[oldPaymentId]
          const channel = interaction.client.channels.cache.get(channelId)
          if (channel) {
            const message = await channel.messages.fetch(messageId)
            if (message) {
              const updatedEmbed = embed
                .setDescription(
                  '⚠️ Este QR Code foi cancelado por outro pagamento.',
                )
                .setImage(null)
              await message.edit({ embeds: [updatedEmbed], files: [] })
            }
          }
        } catch (err) {
          if (err.code !== 10008) {
            console.error(
              'Erro ao atualizar mensagem do pagamento cancelado:',
              err,
            )
          }
        }
        delete global.paymentMessages[oldPaymentId]
      }
      delete global.activePayments[interaction.user.id]
    }

    const selectedValue = interaction.values[0]
    const amount = parseFloat(selectedValue)
    if (isNaN(amount)) {
      return interaction.reply({
        content: 'Valor inválido selecionado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const idempotencyKey =
      Date.now().toString() + '-' + Math.random().toString(36).substring(2, 15)
    const payload = {
      transaction_amount: amount,
      description: `Pagamento via Pix - Produto de R$${amount.toFixed(2)}`,
      payment_method_id: 'pix',
      payer: { email: 'cliente@exemplo.com' },
      notification_url: WEBHOOK_URL,
    }

    try {
      const response = await axios.post(
        'https://api.mercadopago.com/v1/payments',
        payload,
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idempotencyKey,
          },
        },
      )

      const data = response.data
      const paymentId = data.id
      let imageUrl
      let files = []
      const qrCodeBase64 =
        data.point_of_interaction?.transaction_data?.qr_code_base64
      const qrCode = data.point_of_interaction?.transaction_data?.qr_code
      if (qrCodeBase64) {
        const buffer = Buffer.from(qrCodeBase64, 'base64')
        const attachment = new AttachmentBuilder(buffer, { name: 'qr.png' })
        imageUrl = 'attachment://qr.png'
        files.push(attachment)
      } else if (qrCode) {
        imageUrl = qrCode
      } else {
        return interaction.reply({
          content: 'Não foi possível gerar o QR Code Pix.',
          flags: MessageFlags.Ephemeral,
        })
      }

      const copyText = qrCode || 'QR Code não disponível como texto'
      const paymentEmbed = new EmbedBuilder()
        .setTitle('💳 QR Code Pix Gerado')
        .setDescription(
          `Para pagar R$${amount.toFixed(
            2,
          )}, escaneie o QR Code abaixo.\nVocê tem 5 minutos para efetuar o pagamento.`,
        )
        .setImage(imageUrl)
        .addFields({ name: 'Copia e Cola', value: `\`\`\`${copyText}\`\`\`` })
        .setColor('#00FF00')
        .setFooter({ text: `${config.branding.footerText} - Doação Donater Pontos` })
        .setTimestamp()

      await interaction.reply({
        embeds: [paymentEmbed],
        files,
        flags: MessageFlags.Ephemeral,
      })
      const replyMessage = await interaction.fetchReply()
      global.paymentMessages[paymentId] = {
        channelId: replyMessage.channel.id,
        messageId: replyMessage.id,
        embed: paymentEmbed,
      }

      let elapsed = 0
      const interval = setInterval(async () => {
        elapsed += 15 * 1000
        const paymentStatusData = await checkPaymentStatus(paymentId)
        console.debug('Status do pagamento:', paymentStatusData?.status)
        if (!paymentStatusData) return
        if (paymentStatusData.status === 'approved') {
          clearInterval(interval)
          try {
            let pointsAwarded = 0
            let productLabel = ''
            if (amount === 5) {
              pointsAwarded = 100
              productLabel = '🔸 Donater 100 - R$10,00'
            } else if (amount === 10) {
              pointsAwarded = 300
              productLabel = '🔹 Donater 300 - R$20,00'
            } else if (amount === 30) {
              pointsAwarded = 1000
              productLabel = '🔺 Donater 1000 - R$30,00'
            } else if (amount === 50) {
              pointsAwarded = 2000
              productLabel = '▪️ Donater 2000 - R$50,00'
            } else if (amount === 100) {
              pointsAwarded = 5000
              productLabel = '▫️ Donater 5000 - R$100,00'
            }

            let userRecord = await UserPontos.findOne({
              where: { userId: interaction.user.id },
            })
            if (userRecord) {
              userRecord.pontos += pointsAwarded
              await userRecord.save()
            } else {
              userRecord = await UserPontos.create({
                userId: interaction.user.id,
                pontos: pointsAwarded,
              })
            }
            await UserActions.create({
              userId: interaction.user.id,
              id_tipo: 'compra',
              nome_tipo: productLabel,
              pontos: pointsAwarded,
              multiplicador: 1,
              pontosRecebidos: pointsAwarded,
            })
            const updatedEmbed = paymentEmbed
              .setTitle('✅ QR Code Pix Aprovado')
              .setDescription('✅ Seu pagamento foi aprovado com sucesso!')
              .setImage(null)
              .spliceFields(0, 1)
            await interaction.editReply({ embeds: [updatedEmbed], files: [] })
            await interaction.followUp({
              content: '✅ Seu pagamento foi aprovado com sucesso!',
              flags: MessageFlags.Ephemeral,
            })
            try {
              const dmEmbed = new EmbedBuilder()
                .setTitle('🙏 Compra Confirmada')
                .setDescription(
                  `Obrigado por sua compra!\nSeu pagamento foi aprovado e você recebeu **${pointsAwarded} pontos**.\nVolte sempre!`,
                )
                .setImage(
                  'https://media1.tenor.com/m/D1OWoFNgBUgAAAAd/scrooge-mcduck-money.gif',
                )
                .setColor('#FFD700')
                .setTimestamp()
              await interaction.user.send({ embeds: [dmEmbed] })
            } catch (dmError) {
              console.error(
                'Não foi possível enviar DM para o usuário:',
                dmError,
              )
            }
            try {
              const logChannel = interaction.client.channels.cache.get(
                '1344442671812575242',
              )
              if (logChannel) {
                const logEmbed = new EmbedBuilder()
                  .setTitle('🛒 Log de Pagamento')
                  .addFields(
                    {
                      name: '👤 Comprador',
                      value: `<@${interaction.user.id}>`,
                      inline: false,
                    },
                    {
                      name: '📌 Produto Comprado',
                      value: `\`\`\`${productLabel}\`\`\``,
                      inline: false,
                    },
                    {
                      name: 'Pontos recebidos',
                      value: `\`\`\`${pointsAwarded} pts\`\`\``,
                      inline: true,
                    },
                    {
                      name: 'Pontos totais',
                      value: `\`\`\`${userRecord.pontos} pts\`\`\``,
                      inline: true,
                    },
                  )
                  .setColor('#1E90FF')
                  .setTimestamp()
                  .setFooter({ text: `${config.branding.footerText} - Logs de Pagamento` })
                await logChannel.send({ embeds: [logEmbed] })
              }
            } catch (logError) {
              console.error('Erro ao enviar log de pagamento:', logError)
            }

            delete global.activePayments[interaction.user.id]
            delete global.paymentMessages[paymentId]
          } catch (err) {
            console.error(
              'Erro ao atualizar mensagem de pagamento aprovado:',
              err,
            )
          }
        } else if (elapsed >= 5 * 60 * 1000) {
          clearInterval(interval)
          try {
            const updatedEmbed = paymentEmbed
              .setTitle('❌ QR Code Pix Expirado')
              .setDescription(
                '⚠️ Seu pagamento não foi concluído ou expirou. Por favor, gere um novo QR Code.',
              )
              .setImage(null)
              .spliceFields(0, 1)
            await interaction.editReply({ embeds: [updatedEmbed], files: [] })
            await interaction.followUp({
              content:
                '⚠️ Seu pagamento não foi concluído ou expirou. Por favor, gere um novo QR Code.',
              flags: MessageFlags.Ephemeral,
            })
          } catch (err) {
            console.error('Erro ao enviar followUp de pagamento expirado:', err)
          }
          delete global.activePayments[interaction.user.id]
          delete global.paymentMessages[paymentId]
        }
      }, 15 * 1000)

      global.activePayments[interaction.user.id] = { paymentId, interval }
    } catch (error) {
      console.error('Erro completo:', error)
      if (error.response) {
        console.error(
          'Error Response Data:',
          JSON.stringify(error.response.data, null, 2),
        )
        console.error(
          'Error Response Headers:',
          JSON.stringify(error.response.headers, null, 2),
        )
        if (error.response.data && error.response.data.errors) {
          console.error(
            'Errors Array:',
            JSON.stringify(error.response.data.errors, null, 2),
          )
        }
      }
      const errorDetails = error.response
        ? `Status: ${error.response.status}, Dados: ${JSON.stringify(
            error.response.data,
            null,
            2,
          )}`
        : error.message
      return interaction.reply({
        content: `Ocorreu um erro ao gerar o QR Code Pix. Detalhes do erro: ${errorDetails}`,
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
