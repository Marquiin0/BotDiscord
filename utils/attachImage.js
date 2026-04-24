const path = require('path')
const { AttachmentBuilder } = require('discord.js')

/**
 * Cria um AttachmentBuilder a partir de um caminho local e retorna
 * o attachment + a URL attachment:// para usar em embeds.
 */
function attachImage(filePath) {
  const name = path.basename(filePath)
  const attachment = new AttachmentBuilder(filePath, { name })
  return { attachment, url: `attachment://${name}` }
}

module.exports = { attachImage }
