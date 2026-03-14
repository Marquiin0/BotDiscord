const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require('discord.js')
const { MessageFlags } = require('discord.js')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupaposentadoria')
    .setDescription('Configura o painel de solicitação de aposentadoria.'),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      ) &&
      !interaction.memberPermissions.has(
        PermissionsBitField.Flags.UseApplicationCommands,
      )
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setTitle('🎖️ Solicitação de Aposentadoria')
      .setDescription(
        '👮 Selecione uma opção abaixo para gerenciar sua aposentadoria.',
      )
      .setColor('#FFD700')

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('solicitar_aposentadoria')
        .setLabel('📜 Solicitar Aposentadoria')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('sair_aposentadoria')
        .setLabel('🚪 Sair da Aposentadoria')
        .setStyle(ButtonStyle.Danger),
    )

    const channel = interaction.guild.channels.cache.get(config.channels.pedidos)
    if (channel) {
      await channel.send({ embeds: [embed], components: [row] })
      return interaction.reply({
        content: '✅ Painel de aposentadoria criado com sucesso.',
        flags: MessageFlags.Ephemeral,
      })
    } else {
      return interaction.reply({
        content: '❌ Erro: Canal não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
