const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // ===== Botão: Solicitar Set → Abre modal =====
    if (interaction.isButton() && interaction.customId === 'solicitar_set_batalhao') {
      const battalion = config.battalions.find(b => b.guildId === interaction.guildId)
      if (!battalion) {
        return interaction.reply({
          content: '❌ Este servidor não está configurado como batalhão.',
          flags: MessageFlags.Ephemeral,
        })
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_set_batalhao')
        .setTitle('Solicitar Setagem')

      const nomeInput = new TextInputBuilder()
        .setCustomId('set_nome')
        .setLabel('Nome')
        .setPlaceholder('Digite seu nome completo')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)

      const idInput = new TextInputBuilder()
        .setCustomId('set_id')
        .setLabel('ID')
        .setPlaceholder('Digite seu ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)

      const recInput = new TextInputBuilder()
        .setCustomId('set_rec')
        .setLabel('Quem fez o REC?')
        .setPlaceholder('Digite o nome ou @ da pessoa')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)

      modal.addComponents(
        new ActionRowBuilder().addComponents(nomeInput),
        new ActionRowBuilder().addComponents(idInput),
        new ActionRowBuilder().addComponents(recInput),
      )

      return interaction.showModal(modal)
    }

    // ===== Modal: Submissão do formulário → Envia para aprovação =====
    if (interaction.isModalSubmit() && interaction.customId === 'modal_set_batalhao') {
      if (interaction.deferred || interaction.replied) return

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const battalion = config.battalions.find(b => b.guildId === interaction.guildId)
      if (!battalion) {
        return interaction.editReply({ content: '❌ Este servidor não está configurado como batalhão.' })
      }

      const nome = interaction.fields.getTextInputValue('set_nome')
      const id = interaction.fields.getTextInputValue('set_id')
      const rec = interaction.fields.getTextInputValue('set_rec')

      const approvalChannel = interaction.guild.channels.cache.get(battalion.approvalChannelId)
      if (!approvalChannel) {
        return interaction.editReply({ content: '❌ Canal de aprovação não encontrado.' })
      }

      const embed = new EmbedBuilder()
        .setColor(config.branding.color)
        .setTitle(`📋 Solicitação de Set — ${battalion.roleName}`)
        .addFields(
          { name: 'Solicitante', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Nome', value: nome, inline: true },
          { name: 'ID', value: id, inline: true },
          { name: 'Recrutado por', value: rec, inline: true },
        )
        .setFooter({ text: config.branding.footerText })
        .setTimestamp()

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aprovar_set_${interaction.user.id}`)
          .setLabel('✅ Aprovar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reprovar_set_${interaction.user.id}`)
          .setLabel('❌ Reprovar')
          .setStyle(ButtonStyle.Danger),
      )

      await approvalChannel.send({ embeds: [embed], components: [row] })

      await interaction.editReply({
        content: `✅ Sua solicitação de set no **${battalion.roleName}** foi enviada para aprovação!`,
      })
    }

    // ===== Botão: Aprovar set =====
    if (interaction.isButton() && interaction.customId.startsWith('aprovar_set_')) {
      if (interaction.deferred || interaction.replied) return

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const userId = interaction.customId.replace('aprovar_set_', '')
      const battalion = config.battalions.find(b => b.guildId === interaction.guildId)
      if (!battalion) {
        return interaction.editReply({ content: '❌ Este servidor não está configurado como batalhão.' })
      }

      const member = await interaction.guild.members.fetch(userId).catch(() => null)
      if (!member) {
        return interaction.editReply({ content: '❌ Membro não encontrado no servidor.' })
      }

      // Pegar nome e ID do embed original
      const embedFields = interaction.message.embeds[0]?.fields || []
      const nome = embedFields.find(f => f.name === 'Nome')?.value || ''
      const id = embedFields.find(f => f.name === 'ID')?.value || ''

      // Alterar nickname: [TAG] Nome | id (usa tag do batalhão se disponível)
      const nickTag = battalion.nickTag || '[EST]'
      try {
        await member.setNickname(`${nickTag} ${nome} | ${id}`)
      } catch (err) {
        console.error(`[Batalhão] Erro ao alterar nickname de ${userId}:`, err)
      }

      // Adiciona todos os cargos no batalhão
      try {
        for (const roleId of battalion.roleIds) {
          await member.roles.add(roleId)
        }
      } catch (err) {
        console.error(`[Batalhão] Erro ao adicionar cargos para ${userId}:`, err)
        return interaction.editReply({
          content: `❌ Não foi possível atribuir os cargos do **${battalion.roleName}**. Verifique as permissões do bot.`,
        })
      }

      // Sincroniza cargo no servidor principal
      let mainGranted = false
      try {
        const mainGuild = client.guilds.cache.get(config.guilds.main)
        if (mainGuild) {
          const mainMember = await mainGuild.members.fetch(userId).catch(() => null)
          if (mainMember) {
            await mainMember.roles.add(battalion.mainRoleId)
            mainGranted = true
          }
        }
      } catch (err) {
        console.error(`[Batalhão] Erro ao sincronizar cargo principal para ${userId}:`, err)
      }

      // Atualiza o embed original para mostrar que foi aprovado
      const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#00FF00')
        .addFields({ name: 'Status', value: `✅ Aprovado por <@${interaction.user.id}>` })

      await interaction.message.edit({ embeds: [originalEmbed], components: [] })

      const lines = [`✅ Set de <@${userId}> aprovado no **${battalion.roleName}**!`]
      if (mainGranted) {
        lines.push(`🎖️ Cargo sincronizado no servidor principal da **${config.branding.name}**.`)
      } else {
        lines.push(`⚠️ Não foi possível sincronizar o cargo no servidor principal.`)
      }

      await interaction.editReply({ content: lines.join('\n') })
    }

    // ===== Botão: Reprovar set =====
    if (interaction.isButton() && interaction.customId.startsWith('reprovar_set_')) {
      if (interaction.deferred || interaction.replied) return

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const userId = interaction.customId.replace('reprovar_set_', '')

      // Atualiza o embed original para mostrar que foi reprovado
      const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#FF0000')
        .addFields({ name: 'Status', value: `❌ Reprovado por <@${interaction.user.id}>` })

      await interaction.message.edit({ embeds: [originalEmbed], components: [] })

      await interaction.editReply({ content: `❌ Set de <@${userId}> reprovado.` })
    }
  },
}
