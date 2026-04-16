const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dmcargo')
    .setDescription('Envia uma mensagem para todos os membros com um cargo específico.')
    .addRoleOption(option =>
      option
        .setName('cargo')
        .setDescription('O cargo cujos membros receberão a mensagem.')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('mensagem')
        .setDescription('A mensagem a ser enviada.')
        .setRequired(true),
    ),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
      !interaction.member.roles.cache.hasAny(...config.permissions.rhPlus)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const role = interaction.options.getRole('cargo')
    const mensagem = interaction.options.getString('mensagem')

    // Busca membros atualizados
    await interaction.guild.members.fetch()
    const members = role.members

    if (members.size === 0) {
      return await interaction.editReply({
        content: `⚠️ Nenhum membro encontrado com o cargo ${role}.`,
      })
    }

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📩 ${config.branding.name} - Mensagem para ${role.name}`)
      .setDescription(mensagem)
      .setFooter({
        text: `Enviado por ${interaction.user.displayName} | ${config.branding.footerText}`,
      })
      .setTimestamp()

    let enviados = 0
    let falhas = 0

    for (const [, member] of members) {
      try {
        await member.send({ embeds: [embed] })
        enviados++
      } catch {
        falhas++
      }
    }

    await interaction.editReply({
      content: `✅ Mensagem enviada!\n📤 Enviados: **${enviados}**\n❌ Falhas (DM fechada): **${falhas}**\n👥 Total com o cargo: **${members.size}**`,
    })
  },
}
