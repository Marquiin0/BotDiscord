const { SetagemConfig } = require('../database')
const { MessageFlags } = require('discord.js')

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (!interaction.isModalSubmit()) return
    if (interaction.customId !== 'modal_configurar_setagem') return

    const welcomeMessage = interaction.fields.getTextInputValue('setagem_welcome_message')

    await SetagemConfig.upsert({
      key: 'welcomeMessage',
      value: welcomeMessage,
    })

    await interaction.reply({
      content: '✅ Mensagem de boas-vindas da setagem atualizada com sucesso!',
      flags: MessageFlags.Ephemeral,
    })
  },
}
