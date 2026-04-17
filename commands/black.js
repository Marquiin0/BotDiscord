const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js')
const { Blacklist } = require('../database')
const config = require('../config')

// Mapeamento: cargo de command → dados da unidade
const UNIT_COMMAND_MAP = {
  '1477408727253647559': { name: 'S.W.A.T', mainRoleId: '1481720985743921455' },
  '1477408727253647561': { name: 'S.O.G', mainRoleId: '1477408727253647556' },
  '1477408727253647560': { name: 'S.T.E', mainRoleId: '1477408727253647555' },
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('black')
    .setDescription('Remove um membro de uma unidade e aplica blacklist de 7 dias.')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('O membro que será removido da unidade')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('motivo')
        .setDescription('Motivo da remoção/blacklist')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('unidade')
        .setDescription('Unidade (obrigatório para IA+)')
        .addChoices(
          { name: 'S.W.A.T', value: 'S.W.A.T' },
          { name: 'S.O.G', value: 'S.O.G' },
          { name: 'S.T.E', value: 'S.T.E' },
        )
        .setRequired(false),
    ),

  async execute(interaction) {
    const isUnitCommand = interaction.member.roles.cache.hasAny(...config.permissions.unitCommands)
    const isIAPlus = interaction.member.roles.cache.hasAny(...config.permissions.iaPlus)

    if (!isUnitCommand && !isIAPlus && !interaction.member.permissions.has('Administrator')) {
      return interaction.reply({
        content: '❌ Apenas comandos de unidade e IA+ podem usar este comando.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const targetUser = interaction.options.getUser('usuario')
    const motivo = interaction.options.getString('motivo')
    const unidadeChoice = interaction.options.getString('unidade')

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null)
    if (!member) {
      return interaction.reply({
        content: '❌ Membro não encontrado no servidor.',
        flags: MessageFlags.Ephemeral,
      })
    }

    // Determinar de qual unidade remover
    let unitName = null
    let mainRoleId = null

    if (isIAPlus && !isUnitCommand) {
      // IA+ precisa escolher a unidade
      if (!unidadeChoice) {
        return interaction.reply({
          content: '❌ Como IA+, você precisa especificar a unidade com a opção `unidade`.',
          flags: MessageFlags.Ephemeral,
        })
      }
      unitName = unidadeChoice
      const bat = config.battalions.find(b => b.roleName === unidadeChoice)
      if (!bat) {
        return interaction.reply({
          content: '❌ Unidade não encontrada.',
          flags: MessageFlags.Ephemeral,
        })
      }
      mainRoleId = bat.mainRoleId
    } else {
      // Command de unidade — determinar qual pela role
      if (unidadeChoice) {
        // Se escolheu manualmente, usar essa
        unitName = unidadeChoice
        const bat = config.battalions.find(b => b.roleName === unidadeChoice)
        if (bat) mainRoleId = bat.mainRoleId
      } else {
        // Determinar pela role de command
        for (const [roleId, data] of Object.entries(UNIT_COMMAND_MAP)) {
          if (interaction.member.roles.cache.has(roleId)) {
            unitName = data.name
            mainRoleId = data.mainRoleId
            break
          }
        }
      }
    }

    if (!unitName || !mainRoleId) {
      return interaction.reply({
        content: '❌ Não foi possível determinar a unidade. Especifique com a opção `unidade`.',
        flags: MessageFlags.Ephemeral,
      })
    }

    // Verificar se o membro tem o cargo da unidade
    if (!member.roles.cache.has(mainRoleId)) {
      return interaction.reply({
        content: `❌ <@${targetUser.id}> não faz parte da unidade **${unitName}**.`,
        flags: MessageFlags.Ephemeral,
      })
    }

    // Verificar se já está na blacklist
    const existingBlacklist = await Blacklist.findOne({ where: { userId: targetUser.id } })
    if (existingBlacklist) {
      return interaction.reply({
        content: `❌ <@${targetUser.id}> já está na blacklist de unidades (expira em ${new Date(existingBlacklist.expirationDate).toLocaleDateString('pt-BR')}).`,
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      // 1. Remover cargo da unidade
      await member.roles.remove(mainRoleId).catch(console.error)

      // 2. Adicionar cargo de blacklist
      await member.roles.add(config.roles.blacklistUnidade).catch(console.error)

      // 3. Salvar no BD (7 dias)
      const expirationDate = new Date()
      expirationDate.setDate(expirationDate.getDate() + 7)

      await Blacklist.create({
        userId: targetUser.id,
        unitName,
        reason: motivo,
        appliedBy: interaction.user.id,
        expirationDate,
      })

      // 4. Enviar embed no canal de black unidades
      const blackChannel = interaction.guild.channels.cache.get(config.channels.blackUnidades)
      if (blackChannel) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('🚫 Blacklist de Unidade')
          .setDescription('Um membro foi removido de sua unidade e colocado na blacklist.')
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: '👤 Membro', value: `<@${targetUser.id}>`, inline: true },
            { name: '🛡️ Unidade', value: unitName, inline: true },
            { name: '👮 Removido por', value: `<@${interaction.user.id}>`, inline: true },
            { name: '📝 Motivo', value: motivo, inline: false },
            { name: '⏰ Duração', value: '7 dias', inline: true },
            { name: '📅 Expira em', value: expirationDate.toLocaleDateString('pt-BR'), inline: true },
          )
          .addFields({
            name: '\u200b',
            value: 'O membro está impedido de ingressar em qualquer unidade durante o período de blacklist.',
          })
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()

        await blackChannel.send({
          content: `<@${targetUser.id}>`,
          embeds: [embed],
        })
      }

      // 5. DM ao membro
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle(`🚫 ${config.branding.name} - Blacklist de Unidade`)
          .setDescription(
            `Você foi removido(a) da unidade **${unitName}** e colocado(a) na blacklist de unidades.\n\n` +
            `**Motivo:** ${motivo}\n\n` +
            `**Duração:** 7 dias\n` +
            `**Expira em:** ${expirationDate.toLocaleDateString('pt-BR')}\n\n` +
            `Durante este período, você não poderá ingressar em nenhuma unidade.`,
          )
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()

        await member.send({ embeds: [dmEmbed] }).catch(() => {})
      } catch (e) { /* DM fechada */ }

      await interaction.editReply({
        content: `✅ <@${targetUser.id}> foi removido(a) da **${unitName}** e colocado(a) na blacklist por 7 dias.`,
      })
    } catch (error) {
      console.error('Erro ao executar /black:', error)
      await interaction.editReply({
        content: '❌ Ocorreu um erro ao aplicar a blacklist.',
      })
    }
  },
}
