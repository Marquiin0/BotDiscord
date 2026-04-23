const { scheduleHierarchyUpdate, hierarchyRoleIds } = require('../utils/updateHierarchy')

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    for (const id of hierarchyRoleIds) {
      if (member.roles.cache.has(id)) {
        scheduleHierarchyUpdate(member.guild)
        return
      }
    }
  },
}
