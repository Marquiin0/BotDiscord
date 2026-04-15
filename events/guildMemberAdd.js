const config = require('../config')

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    // Verifica se o membro entrou em um servidor de batalhão com cargo de visitante configurado
    const battalion = config.battalions.find(b => b.guildId === member.guild.id && b.visitorRoleId)
    if (!battalion) return

    try {
      await member.roles.add(battalion.visitorRoleId)
      console.log(`[Visitante] Cargo de visitante atribuído a ${member.user.tag} no ${battalion.roleName}`)
    } catch (err) {
      console.error(`[Visitante] Erro ao atribuir cargo de visitante a ${member.user.tag}:`, err)
    }
  },
}
