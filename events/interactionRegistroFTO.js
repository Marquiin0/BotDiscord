const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return

    // ==================== BOTÃO REGISTRAR FTO ====================
    if (interaction.isButton() && interaction.customId === 'registrar_fto') {
      const modal = new ModalBuilder()
        .setCustomId('modal_registro_fto')
        .setTitle('Registro - Discord de FTO')

      const nomeInput = new TextInputBuilder()
        .setCustomId('registro_nome')
        .setLabel('Nome do seu personagem')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Marcos Silva')
        .setRequired(true)

      const idInput = new TextInputBuilder()
        .setCustomId('registro_id')
        .setLabel('ID do seu personagem')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 1516')
        .setRequired(true)

      const unidadeInput = new TextInputBuilder()
        .setCustomId('registro_unidade')
        .setLabel('Unidade (SOG, SWAT, STE ou Nenhuma)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: SOG')
        .setRequired(true)

      const patenteInput = new TextInputBuilder()
        .setCustomId('registro_patente')
        .setLabel('Sua patente atual')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Soldado')
        .setRequired(true)

      modal.addComponents(
        new ActionRowBuilder().addComponents(nomeInput),
        new ActionRowBuilder().addComponents(idInput),
        new ActionRowBuilder().addComponents(unidadeInput),
        new ActionRowBuilder().addComponents(patenteInput),
      )

      return interaction.showModal(modal)
    }

    // ==================== MODAL REGISTRO FTO ====================
    if (interaction.isModalSubmit() && interaction.customId === 'modal_registro_fto') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const nome = interaction.fields.getTextInputValue('registro_nome')
      const id = interaction.fields.getTextInputValue('registro_id')
      const unidade = interaction.fields.getTextInputValue('registro_unidade')
      const patente = interaction.fields.getTextInputValue('registro_patente')

      const guild = interaction.client.guilds.cache.get(config.guilds.logs)
      if (!guild) return interaction.editReply({ content: '❌ Erro interno.' })

      const approvalChannel = guild.channels.cache.get(config.logsChannels.aceitarRegistro)
      if (!approvalChannel) return interaction.editReply({ content: '❌ Canal de aprovação não encontrado.' })

      const embed = new EmbedBuilder()
        .setColor(config.branding.color)
        .setTitle('📋 Novo Registro - Discord de FTO')
        .setDescription('Um novo registro foi enviado para aprovação.')
        .addFields(
          { name: '👤 Oficial', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📝 Nome', value: nome, inline: true },
          { name: '🆔 ID', value: id, inline: true },
          { name: '🏛️ Unidade', value: unidade, inline: true },
          { name: '🎖️ Patente', value: patente, inline: true },
        )
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: config.branding.footerText })
        .setTimestamp()

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aceitar_registro_${interaction.user.id}`)
          .setLabel('✅ Aceitar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`recusar_registro_${interaction.user.id}`)
          .setLabel('❌ Recusar')
          .setStyle(ButtonStyle.Danger),
      )

      await approvalChannel.send({ embeds: [embed], components: [buttons] })
      return interaction.editReply({ content: '✅ Seu registro foi enviado para aprovação! Aguarde a análise.' })
    }

    // ==================== ACEITAR REGISTRO ====================
    if (interaction.isButton() && interaction.customId.startsWith('aceitar_registro_')) {
      const hasAdmin = interaction.member.permissions.has('Administrator')
      const hasRole = config.permissions.rhPlus.some(r => interaction.member.roles.cache.has(r))
      if (!hasAdmin && !hasRole) {
        return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral })
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const userId = interaction.customId.split('_')[2]

      // Extrair dados do embed original
      const originalEmbed = interaction.message.embeds[0]
      const fields = originalEmbed.fields || []
      const nome = fields.find(f => f.name === '📝 Nome')?.value || 'Desconhecido'
      const idPersonagem = fields.find(f => f.name === '🆔 ID')?.value || '0'
      const unidade = fields.find(f => f.name === '🏛️ Unidade')?.value || ''

      // Buscar patente real do server principal
      let patenteTag = 'EST'
      try {
        const mainGuild = interaction.client.guilds.cache.get(config.guilds.main)
        if (mainGuild) {
          const mainMember = await mainGuild.members.fetch(userId).catch(() => null)
          if (mainMember) {
            for (const key of config.rankOrder) {
              if (mainMember.roles.cache.has(config.ranks[key].roleId)) {
                patenteTag = config.ranks[key].tag
                break
              }
            }
          }
        }
      } catch (err) {
        console.error('[Registro FTO] Erro ao buscar patente do server principal:', err)
      }

      // Setar nickname e cargos no server de logs
      try {
        const targetMember = await interaction.guild.members.fetch(userId)
        if (targetMember) {
          // Setar nickname: [TAG] Nome | ID (mesma tag do server principal)
          const nickname = `${patenteTag} ${nome} | ${idPersonagem}`
          await targetMember.setNickname(nickname).catch(err => console.error('[Registro FTO] Erro nickname:', err))

          // Dar cargo de policial
          if (interaction.guild.roles.cache.has(config.ftoRoles.policial)) {
            await targetMember.roles.add(config.ftoRoles.policial).catch(err => console.error('[Registro FTO] Erro cargo policial:', err))
          } else {
            console.error(`[Registro FTO] Cargo policial ${config.ftoRoles.policial} não encontrado no guild`)
          }

          // Dar cargo da unidade
          const unidadeLower = unidade.toLowerCase().trim()
          const unitRoleMap = { sog: config.ftoRoles.sog, swat: config.ftoRoles.swat, ste: config.ftoRoles.ste }
          for (const [unitKey, roleId] of Object.entries(unitRoleMap)) {
            if (unidadeLower.includes(unitKey) && roleId) {
              if (interaction.guild.roles.cache.has(roleId)) {
                await targetMember.roles.add(roleId).catch(err => console.error(`[Registro FTO] Erro cargo ${unitKey}:`, err))
              } else {
                console.error(`[Registro FTO] Cargo ${unitKey} ${roleId} não encontrado no guild`)
              }
              break
            }
          }

          console.log(`[Registro FTO] Membro ${userId} aceito: ${patenteTag} ${nome} | ${idPersonagem}, unidade: ${unidade}`)
        } else {
          console.error(`[Registro FTO] Membro ${userId} não encontrado no guild`)
        }
      } catch (err) {
        console.error('[Registro FTO] Erro ao setar membro:', err)
      }

      // Edita embed para aceito
      const newEmbed = EmbedBuilder.from(originalEmbed)
        .setColor(0x2ECC71)
        .addFields({ name: '✅ Aceito por', value: `<@${interaction.user.id}>`, inline: true })

      const disabledButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('aceito_disabled').setLabel('✅ Aceito').setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId('recusado_disabled').setLabel('❌ Recusar').setStyle(ButtonStyle.Danger).setDisabled(true),
      )

      await interaction.message.edit({ embeds: [newEmbed], components: [disabledButtons] })

      // DM para o usuário
      try {
        const user = await interaction.client.users.fetch(userId)
        const dmEmbed = new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('✅ Registro Aceito!')
          .setDescription(`Seu registro no **Discord de FTO** da **${config.branding.name}** foi **aceito**!\n\nVocê já pode acessar o servidor normalmente.`)
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()
        await user.send({ embeds: [dmEmbed] })
      } catch (e) {
        console.error('DM falhou ao aceitar registro:', e)
      }

      return interaction.editReply({ content: '✅ Registro aceito com sucesso!' })
    }

    // ==================== RECUSAR REGISTRO (abre modal) ====================
    if (interaction.isButton() && interaction.customId.startsWith('recusar_registro_')) {
      const hasAdmin = interaction.member.permissions.has('Administrator')
      const hasRole = config.permissions.rhPlus.some(r => interaction.member.roles.cache.has(r))
      if (!hasAdmin && !hasRole) {
        return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral })
      }

      const userId = interaction.customId.split('_')[2]

      const modal = new ModalBuilder()
        .setCustomId(`modal_recusar_registro_${userId}`)
        .setTitle('Recusar Registro')

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_recusa_registro')
        .setLabel('Motivo da recusa')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(motivoInput))
      return interaction.showModal(modal)
    }

    // ==================== MODAL RECUSAR REGISTRO ====================
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_recusar_registro_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const userId = interaction.customId.split('_')[3]
      const motivo = interaction.fields.getTextInputValue('motivo_recusa_registro')

      // Edita embed para recusado
      const originalEmbed = interaction.message.embeds[0]
      const newEmbed = EmbedBuilder.from(originalEmbed)
        .setColor(0xFF0000)
        .addFields(
          { name: '❌ Recusado por', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📌 Motivo', value: motivo, inline: false },
        )

      const disabledButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('aceito_disabled').setLabel('✅ Aceitar').setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId('recusado_disabled').setLabel('❌ Recusado').setStyle(ButtonStyle.Danger).setDisabled(true),
      )

      await interaction.message.edit({ embeds: [newEmbed], components: [disabledButtons] })

      // DM para o usuário
      try {
        const user = await interaction.client.users.fetch(userId)
        const dmEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Registro Recusado')
          .setDescription(
            `Seu registro no **Discord de FTO** da **${config.branding.name}** foi **recusado**.\n\n` +
            `**Motivo:** ${motivo}\n\n` +
            `Você pode tentar se registrar novamente corrigindo as informações.`
          )
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()
        await user.send({ embeds: [dmEmbed] })
      } catch (e) {
        console.error('DM falhou ao recusar registro:', e)
      }

      return interaction.editReply({ content: '✅ Registro recusado com sucesso!' })
    }
  },
}
