const { EmbedBuilder, MessageFlags } = require('discord.js')
const config = require('../config')

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isButton()) return
    if (interaction.customId !== 'solicitar_set_batalhao') return
    if (interaction.deferred || interaction.replied) return

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const battalion = config.battalions.find(b => b.guildId === interaction.guildId)
    if (!battalion) {
      return interaction.editReply({ content: '❌ Este servidor não está configurado como batalhão.' })
    }

    const member = interaction.member
    if (!member) {
      return interaction.editReply({ content: '❌ Não foi possível identificar seu perfil no servidor.' })
    }

    // Verifica se já possui o cargo do batalhão
    if (member.roles.cache.has(battalion.roleId)) {
      return interaction.editReply({
        content: `✅ Você já possui o cargo **${battalion.roleName}** neste batalhão.`,
      })
    }

    // Adiciona cargo no batalhão
    try {
      await member.roles.add(battalion.roleId)
    } catch (err) {
      console.error(`[Batalhão] Erro ao adicionar cargo ${battalion.roleId} para ${interaction.user.id}:`, err)
      return interaction.editReply({
        content: `❌ Não foi possível atribuir o cargo **${battalion.roleName}**. Verifique as permissões do bot.`,
      })
    }

    // Sincroniza cargo no servidor principal
    let mainGranted = false
    try {
      const mainGuild = client.guilds.cache.get(config.guilds.main)
      if (mainGuild) {
        const mainMember = await mainGuild.members.fetch(interaction.user.id).catch(() => null)
        if (mainMember) {
          await mainMember.roles.add(battalion.mainRoleId)
          mainGranted = true
        }
      }
    } catch (err) {
      console.error(`[Batalhão] Erro ao sincronizar cargo principal para ${interaction.user.id}:`, err)
    }

    const lines = [
      `✅ Você recebeu o cargo **${battalion.roleName}** neste batalhão!`,
    ]

    if (mainGranted) {
      lines.push(`🎖️ Seu cargo de membro no servidor principal da **${config.branding.name}** também foi concedido.`)
    } else {
      lines.push(`⚠️ Não foi possível atribuir o cargo no servidor principal. Certifique-se de que você está no servidor **${config.branding.name}**.`)
    }

    await interaction.editReply({ content: lines.join('\n') })
  },
}
