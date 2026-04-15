const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('itemmisterioso')
    .setDescription('Sorteia o resultado do Item Misterioso para um usuário.')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuário que comprou o Item Misterioso')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!config.itemMisterioso.authorizedUsers.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply()

    const targetUser = interaction.options.getUser('usuario')
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null)

    if (!member) {
      return interaction.editReply({ content: '❌ Membro não encontrado no servidor.' })
    }

    const resultados = config.itemMisterioso.resultados

    // Sortear com base nos pesos
    const pesoTotal = resultados.reduce((sum, r) => sum + (r.peso || 1), 0)
    let random = Math.random() * pesoTotal
    let resultado = resultados[resultados.length - 1]
    for (const r of resultados) {
      random -= (r.peso || 1)
      if (random <= 0) {
        resultado = r
        break
      }
    }

    // Atribuir o cargo do resultado
    let cargoStatus = ''
    if (resultado.roleId) {
      try {
        const role = interaction.guild.roles.cache.get(resultado.roleId)
        if (role) {
          await member.roles.add(role)
          cargoStatus = `\n✅ Cargo <@&${resultado.roleId}> atribuído com sucesso.`
        }
      } catch (e) {
        console.error('Erro ao atribuir cargo do Item Misterioso:', e)
        cargoStatus = '\n⚠️ Não foi possível atribuir o cargo automaticamente.'
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🎲 Item Misterioso — Resultado')
      .setDescription(
        `**Comprador:** <@${targetUser.id}>\n` +
        `**Sorteado por:** <@${interaction.user.id}>\n\n` +
        `## ${resultado.emoji} ${resultado.nome}\n` +
        cargoStatus
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    await interaction.editReply({ embeds: [embed] })
  },
}
