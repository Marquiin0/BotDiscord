const config = require('../config')
const { scheduleHierarchyUpdate, hierarchyRoleIds } = require('../utils/updateHierarchy')

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    // Atribuir cargo de visitante em guilds de batalhão configurados
    const battalion = config.battalions.find(b => b.guildId === member.guild.id && b.visitorRoleId)
    if (battalion) {
      try {
        await member.roles.add(battalion.visitorRoleId)
        console.log(`[Visitante] Cargo atribuído a ${member.user.tag} no ${battalion.roleName}`)
      } catch (err) {
        console.error(`[Visitante] Erro ao atribuir cargo a ${member.user.tag}:`, err)
      }
    }

    // Atualizar hierarquia se o membro entrou com cargo de hierarquia
    for (const id of hierarchyRoleIds) {
      if (member.roles.cache.has(id)) {
        scheduleHierarchyUpdate(member.guild)
        return
      }
    }
  },
}
