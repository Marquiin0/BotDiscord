module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return

    const command = client.commands.get(interaction.commandName)
    if (!command) return

    try {
      await command.execute(interaction, client)
    } catch (error) {
      console.error(`Erro ao executar /${interaction.commandName}:`, error)
      const reply = { content: '❌ Ocorreu um erro ao executar este comando.', ephemeral: true }
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply).catch(() => {})
      } else {
        await interaction.reply(reply).catch(() => {})
      }
    }
  },
}
