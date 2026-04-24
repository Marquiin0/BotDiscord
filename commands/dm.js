const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Envia uma mensagem no privado de um usuário.')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('O usuário que receberá a mensagem.')
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

    const user = interaction.options.getUser('usuario')
    const mensagem = interaction.options.getString('mensagem')

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📩 ${config.branding.name} - Mensagem`)
      .setDescription(mensagem)
      .setFooter({
        text: `Enviado por ${interaction.user.displayName} | ${config.branding.footerText}`,
      })
      .setTimestamp()

    try {
      await user.send({ embeds: [embed] })
      await interaction.reply({
        content: `✅ Mensagem enviada com sucesso para <@${user.id}>!`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (error) {
      await interaction.reply({
        content: '❌ Não foi possível enviar a mensagem. O usuário pode ter DMs desativadas.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
