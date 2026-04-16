const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const path = require('path')
const config = require('../config')
const { attachImage } = require('../utils/attachImage')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('requisitos')
    .setDescription('Envia os requisitos de promoção para cada patente no canal de requisitos.'),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const channel = interaction.guild.channels.cache.get(config.channels.requisitos)
    if (!channel) {
      return interaction.editReply({ content: '❌ Canal de requisitos não encontrado.' })
    }

    const reqs = config.promotionRequirements

    // Formata os requisitos de cada patente em texto compacto
    function formatReqs(key) {
      const req = reqs[key]
      if (!req) return ''
      if (req.indicacao) {
        return `> 🏛️ Indicação do Alto Comando\n> 📅 ${req.dias} Dias no cargo`
      }

      const lines = []
      if (req.cursoMAA) lines.push('📋 Curso MAA')
      if (req.apreensaoAcao > 0) lines.push(`🔫 ${req.apreensaoAcao} Rel. Apreensão/Ação`)
      if (req.prisao > 0) lines.push(`🚔 ${req.prisao} Rel. Prisão`)
      if (req.horasPatrulha > 0) lines.push(`⏰ ${req.horasPatrulha}h Patrulha`)
      if (req.cursosAcao > 0) lines.push(`🎓 ${req.cursosAcao} Cursos de Ação`)
      if (req.semAdvertencia) lines.push('⚠️ 0 Advertências')
      lines.push(`📅 ${req.dias} Dias no cargo`)
      return lines.map(l => `> ${l}`).join('\n')
    }

    // Monta a description completa
    const sections = [
      '**━━━━━━━━ PRAÇAS ━━━━━━━━**\n',
      `**🎖️ ${reqs.EST.label}**\n${formatReqs('EST')}\n`,
      `**🎖️ ${reqs.SD.label}**\n${formatReqs('SD')}\n`,
      `**🎖️ ${reqs.CB.label}**\n${formatReqs('CB')}\n`,

      '**━━━━━━━ GRADUADOS ━━━━━━━**\n',
      `**🎖️ ${reqs['3SGT'].label}**\n${formatReqs('3SGT')}\n`,
      `**🎖️ ${reqs['2SGT'].label}**\n${formatReqs('2SGT')}\n`,
      `**🎖️ ${reqs['1SGT'].label}**\n${formatReqs('1SGT')}\n`,
      `**🎖️ ${reqs.STEN.label}**\n${formatReqs('STEN')}\n`,

      '**━━━━━━━ OFICIAIS ━━━━━━━**\n',
      `**🎖️ ${reqs.ASP.label}**\n${formatReqs('ASP')}\n`,
      `**🎖️ ${reqs['2TEN'].label}**\n${formatReqs('2TEN')}\n`,
      `**🎖️ ${reqs['1TEN'].label}**\n${formatReqs('1TEN')}\n`,
      `**🎖️ ${reqs.CAP.label}**\n${formatReqs('CAP')}\n`,

      '**━━━━━ ALTO COMANDO ━━━━━**\n',
      `**🎖️ ${reqs.MAJ.label}**\n${formatReqs('MAJ')}\n`,
      `**🎖️ ${reqs.TCOR.label}**\n${formatReqs('TCOR')}\n`,
      `**🎖️ COR em diante**\n> 🏛️ Nomeação direta pelo Alto Comando`,
    ]

    const embed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`🎖️ ${config.branding.name} - Requisitos de Promoção`)
      .setDescription(
        'Confira abaixo os requisitos necessários para subir de patente.\n\n' +
        sections.join('\n'),
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
    embed.setImage(banner.url)

    await channel.send({ embeds: [embed], files: [banner.attachment] })

    await interaction.editReply({
      content: `✅ Requisitos de promoção enviados no canal <#${config.channels.requisitos}>.`,
    })
  },
}
