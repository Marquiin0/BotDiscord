const { Warning } = require('../database.js') // Importando o modelo
const { EmbedBuilder } = require('discord.js')
const { Sequelize } = require('sequelize')
const config = require('../config')

async function checkExpiredWarnings(client) {
  const expiredWarnings = await Warning.findAll({
    where: {
      timestamp: {
        [Sequelize.Op.lte]: new Date(), // Expiradas até a data atual
      },
    },
  })

  const channel = client.channels.cache.get(config.channels.exoneracaoLog) // Canal para enviar o embed

  for (const warning of expiredWarnings) {
    const guild = client.guilds.cache.get(config.guilds.main) // ID do seu servidor
    if (!guild) continue

    let member
    try {
      member = await guild.members.fetch(warning.userId)
    } catch (error) {
      console.error(
        `Erro ao buscar o membro ${warning.userId}: ${error.message}`,
      )
      // Remover o registro do warning, já que o membro não foi encontrado na guilda
      await Warning.destroy({
        where: {
          userId: warning.userId,
          roleId: warning.roleId,
        },
      })
      continue
    }

    // Remover o cargo de advertência, se o membro possuir
    const roleAdv = await guild.roles.fetch(warning.roleId).catch(err => {
      console.error(`Erro ao buscar o cargo ${warning.roleId}: ${err.message}`)
      return null
    })
    if (roleAdv && member.roles.cache.has(roleAdv.id)) {
      await member.roles
        .remove(roleAdv.id)
        .catch(err =>
          console.error(
            `Erro ao remover o cargo ${roleAdv.id} de ${member.id}: ${err.message}`,
          ),
        )
    }

    // Remover o registro da advertência do banco de dados
    await Warning.destroy({
      where: {
        userId: warning.userId,
        roleId: warning.roleId,
      },
    })

    // // Criar e enviar o embed de expiração da advertência
    // const expiredEmbed = new EmbedBuilder()
    //     .setColor('#00ff00')
    //     .setTitle('✅ Advertência Expirada')
    //     .setDescription(`A advertência de <@${member.id}> foi expirada e removida.`)
    //     .addFields(
    //         { name: '👤 Usuário', value: `<@${member.id}>`, inline: true },
    //         { name: '⚠️ Tipo de Advertência', value: `<@&${warning.roleId}>`, inline: true },
    //         { name: '📌 Motivo', value: warning.reason }
    //     )
    //     .setTimestamp()
    //     .setFooter({
    //         text: `${config.branding.footerText} CORREGEDORIA`,
    //     });

    // if (channel) {
    //     channel.send({ embeds: [expiredEmbed] }).catch(err => console.error(`Erro ao enviar embed no canal: ${err.message}`));
    // }

    // Enviar mensagem direta para o usuário (opcional)
    try {
      await member.send({ embeds: [expiredEmbed] })
    } catch (error) {
      console.log(
        `⚠️ Não foi possível enviar a mensagem para ${member.user.tag}.`,
      )
    }
  }
}

module.exports = checkExpiredWarnings
