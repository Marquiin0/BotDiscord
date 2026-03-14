const { EmbedBuilder, PermissionsBitField } = require('discord.js')
const { isValidImageURL } = require('../utils/isValidImageURL')
const { sendEphemeralReply } = require('../utils/sendEphemeralReply')
const { MessageFlags } = require('discord.js')
const config = require('../config')

module.exports = {
  data: {
    name: 'anuncio',
    permissions: PermissionsBitField.Flags.Administrator,
  },
  async execute(message, args, client) {
    try {
      if (message.content.toLowerCase().startsWith('/anuncio ')) {
        if (message.content.length > 2000) {
          await sendEphemeralReply(
            message,
            'Você excedeu o limite de 2000 caracteres',
          )
          return
        }

        if (
          !message.member.permissions.has(
            PermissionsBitField.Flags.Administrator,
          )
        ) {
          await sendEphemeralReply(
            message,
            'Você não tem permissão para usar este comando.',
          )
          return
        }

        let content = message.content.split('/anuncio ')[1]
        let imageURL = null

        const possibleURL = content.split(' ')[0]
        if (isValidImageURL(possibleURL)) {
          imageURL = possibleURL
          content = content.replace(possibleURL, '').trim()
        }

        const exampleEmbed = new EmbedBuilder()
          .setColor(config.branding.color)
          .setAuthor({
            name: `Anuncio ${config.branding.name}`,
          })
          .setDescription(content)
          .setTimestamp()
          .setFooter({
            text: `Atenciosamente, ${config.branding.footerText}`,
          })

        if (imageURL) {
          exampleEmbed.setImage(imageURL)
        } else if (message.attachments.first()) {
          exampleEmbed.setImage(message.attachments.first().url)
        }

        message.channel.send({ embeds: [exampleEmbed] })
        message.delete()
      }
    } catch (error) {
      console.error('Erro no evento messageCreate:', error)
    }
  },
}
