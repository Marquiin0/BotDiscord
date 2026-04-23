const { scheduleHierarchyUpdate, hierarchyRoleIds } = require('../utils/updateHierarchy')

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    for (const id of hierarchyRoleIds) {
      if (oldMember.roles.cache.has(id) !== newMember.roles.cache.has(id)) {
        scheduleHierarchyUpdate(newMember.guild)
        return
      }
    }
  },
}
