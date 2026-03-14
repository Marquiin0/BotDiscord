
const { MessageFlags} = require('discord.js');
module.exports = {
  async sendEphemeralReply(message, content) {
    try {
      const botReply = await message.reply({
        content: content,
        flags: MessageFlags.Ephemeral,
      })

      await message
        .delete()
        .catch(err => console.error('Erro ao deletar a mensagem:', err))
      setTimeout(async () => {
        await botReply
          .delete()
          .catch(err =>
            console.error('Erro ao deletar a mensagem do bot:', err)
          )
      }, 5000)
    } catch (error) {
      console.error('Erro ao enviar resposta efêmera:', error)
    }
  },
}
