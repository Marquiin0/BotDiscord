const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

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

    // Helper para formatar requisitos de uma patente
    function formatReqs(key) {
      const req = reqs[key]
      if (!req) return null
      if (req.indicacao) {
        return `🏛️ Indicação do Alto Comando\n📅 ${req.dias} Dias no cargo`
      }

      const lines = []
      if (req.cursoMAA) lines.push('📋 Curso MAA aprovado')
      if (req.apreensaoAcao > 0) lines.push(`🔫 ${req.apreensaoAcao} Relatórios de Apreensão/Ação`)
      if (req.prisao > 0) lines.push(`🚔 ${req.prisao} Relatórios de Prisão`)
      if (req.horasPatrulha > 0) lines.push(`⏰ ${req.horasPatrulha}h de Patrulha`)
      if (req.cursosAcao > 0) lines.push(`🎓 ${req.cursosAcao} Cursos de Ação`)
      if (req.semAdvertencia) lines.push('⚠️ 0 Advertências ativas')
      lines.push(`📅 ${req.dias} Dias no cargo`)
      return lines.join('\n')
    }

    // ═══════════ Embed 1: Praças ═══════════
    const embedPracas = new EmbedBuilder()
      .setColor('#2ECC71')
      .setTitle('🎖️ Requisitos de Promoção — Praças')
      .setDescription('Requisitos necessários para subir de patente nas praças.')
      .addFields(
        { name: `━━━ ${reqs.EST.label} ━━━`, value: formatReqs('EST'), inline: false },
        { name: `━━━ ${reqs.SD.label} ━━━`, value: formatReqs('SD'), inline: false },
        { name: `━━━ ${reqs.CB.label} ━━━`, value: formatReqs('CB'), inline: false },
      )
      .setFooter({ text: config.branding.footerText })

    // ═══════════ Embed 2: Graduados ═══════════
    const embedGraduados = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('🎖️ Requisitos de Promoção — Graduados')
      .setDescription('Requisitos necessários para subir de patente nos graduados.')
      .addFields(
        { name: `━━━ ${reqs['3SGT'].label} ━━━`, value: formatReqs('3SGT'), inline: false },
        { name: `━━━ ${reqs['2SGT'].label} ━━━`, value: formatReqs('2SGT'), inline: false },
        { name: `━━━ ${reqs['1SGT'].label} ━━━`, value: formatReqs('1SGT'), inline: false },
        { name: `━━━ ${reqs.STEN.label} ━━━`, value: formatReqs('STEN'), inline: false },
      )
      .setFooter({ text: config.branding.footerText })

    // ═══════════ Embed 3: Oficiais ═══════════
    const embedOficiais = new EmbedBuilder()
      .setColor('#F1C40F')
      .setTitle('🎖️ Requisitos de Promoção — Oficiais')
      .setDescription('Requisitos necessários para subir de patente nos oficiais.')
      .addFields(
        { name: `━━━ ${reqs.ASP.label} ━━━`, value: formatReqs('ASP'), inline: false },
        { name: `━━━ ${reqs['2TEN'].label} ━━━`, value: formatReqs('2TEN'), inline: false },
        { name: `━━━ ${reqs['1TEN'].label} ━━━`, value: formatReqs('1TEN'), inline: false },
        { name: `━━━ ${reqs.CAP.label} ━━━`, value: formatReqs('CAP'), inline: false },
      )
      .setFooter({ text: config.branding.footerText })

    // ═══════════ Embed 4: Alto Comando ═══════════
    const embedAlto = new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('🎖️ Requisitos de Promoção — Alto Comando')
      .setDescription('Patentes de alto comando requerem indicação.')
      .addFields(
        { name: `━━━ ${reqs.MAJ.label} ━━━`, value: formatReqs('MAJ'), inline: false },
        { name: `━━━ ${reqs.TCOR.label} ━━━`, value: formatReqs('TCOR'), inline: false },
        { name: '━━━ COR em diante ━━━', value: '🏛️ Nomeação direta pelo Alto Comando', inline: false },
      )
      .setFooter({ text: `${config.branding.footerText} • Requisitos de Promoção` })
      .setTimestamp()

    await channel.send({ embeds: [embedPracas, embedGraduados, embedOficiais, embedAlto] })

    await interaction.editReply({
      content: `✅ Requisitos de promoção enviados no canal <#${config.channels.requisitos}>.`,
    })
  },
}
