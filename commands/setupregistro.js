const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, MessageFlags } = require('discord.js')
const path = require('path')
const config = require('../config')
const { attachImage } = require('../utils/attachImage')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupregistro')
    .setDescription('Configura o embed de registro no Discord de FTO.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral })
    }

    const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
    if (!logsGuild) return interaction.reply({ content: '❌ Guild de logs não encontrada.', flags: MessageFlags.Ephemeral })

    const channel = logsGuild.channels.cache.get(config.logsChannels.registro)
    if (!channel) return interaction.reply({ content: '❌ Canal de registro não encontrado.', flags: MessageFlags.Ephemeral })

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📋 ${config.branding.name} - Faça Registro no Discord de FTO`)
      .setDescription(
        'Para acessar o servidor e participar dos cursos, é necessário fazer seu registro.\n\n' +
        '**Ao clicar no botão abaixo, preencha as informações solicitadas:**\n\n' +
        '> 📝 **Nome** — Nome do seu personagem\n' +
        '> 🆔 **ID** — ID do seu personagem\n' +
        '> 🏛️ **Unidade** — Sua unidade (SOG, SWAT, STE ou Nenhuma)\n' +
        '> 🎖️ **Patente** — Sua patente atual na corporação\n\n' +
        '⚠️ **Atenção:** Preencha corretamente. Registros com informações incorretas serão recusados.',
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('registrar_fto')
        .setLabel('📋 Fazer Registro')
        .setStyle(ButtonStyle.Primary),
    )

    await channel.send({ embeds: [embed], components: [buttons], files: [banner.attachment] })
    await interaction.reply({ content: `✅ Embed de registro enviado no canal <#${config.logsChannels.registro}>.`, flags: MessageFlags.Ephemeral })
  },
}
