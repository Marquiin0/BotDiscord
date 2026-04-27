const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js')
const {
  handleCheckHoursInteraction,
  handleSairServicoInteraction,
} = require('../utils/painelHandlers.js')
const updateMemberIDs = require('../utils/updateMembersIDs')
const setupAusencia = require('../commands/setupaus')
const { MessageFlags } = require('discord.js')
const config = require('../config')

// Armazena dados do formulário (nome, id do jogador etc.)
const userFormData = new Map()

// IDs de cargo que serão adicionados ao recruta aprovado
const approvedRoleId = config.roles.shadow
const approvedRoleId2 = config.roles.membro

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isButton()) {
      if (interaction.deferred || interaction.replied) return

      // Aprovação
      // -----------------------------------------------------------------------------
      // BOTÕES: APROVAR • COPIAR MENÇÃO • RECUSAR
      // -----------------------------------------------------------------------------

      // APROVAR ---------------------------------------------------------------------
      if (interaction.customId.startsWith('register_user_')) {
        const userId = interaction.customId.split('_')[2]
        const member = await interaction.guild.members.fetch(userId)
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
        const approver = await interaction.guild.members.fetch(
          interaction.user.id,
        )

        // atualiza embed + botões
        const updatedEmbed = embed
          .setFooter({ text: `✅ Aprovado por ${approver.displayName}` })
          .setColor('#32CD32')

        const updatedButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('approved')
            .setLabel('✅ Aprovado')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('disabled_reject')
            .setLabel('❌ Recusar')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`copy_mention_${userId}`)
            .setLabel('📋 Copiar Menção')
            .setStyle(ButtonStyle.Primary),
        )

        await interaction.update({
          embeds: [updatedEmbed],
          components: [updatedButtons],
        })

        try {
          // dados do formulário
          const formData = userFormData.get(userId)
          if (!formData) {
            console.warn(`⚠️ Não há dados de formulário para o ID ${userId}.`)
            return
          }

          // cargos + apelido
          await member.setNickname(`[EST] ${formData.nome} | ${formData.id}`)
          await member.roles.add(approvedRoleId)
          await member.roles.add(approvedRoleId2)
          await member.roles.remove(config.roles.recruta)
          console.log('✅ Cargo aprovado e apelido alterado com sucesso.')

          await updateMemberIDs(interaction.guild)

          // -------------------------------------------------------------------------
          // ENVIAR DM DE INTEGRAÇÃO
          // -------------------------------------------------------------------------
          const dmEmbed = new EmbedBuilder()
            .setTitle('FUI RECRUTADO, O QUE DEVO FAZER?')
            .setDescription(
              `Parabéns, Estagiário! Você foi aprovado na **${config.branding.name}**.\n` +
                'Aqui está o passo-a-passo:\n\n' +
                '**1. Coloque o fardamento de estagiário:**\n\n' +
                '**ESTAGIÁRIO (MASCULINO)**\n' +
                '```chapeu  ; mascara -1 0; jaqueta 299 17; blusa 15 0; maos 0 0; calca 140 0; sapatos 42; acessorios -1 0; oculos  ; mochila -1 254; colete -1 0```\n\n' +
                '**ESTAGIÁRIA (FEMININO)**\n' +
                '```chapeu  ; mascara -1 0; jaqueta 428 17; blusa 6 0; maos 228 0; calca 139 0; sapatos 1 0; acessorios -1 0; oculos  ; mochila -1 0; colete -1 0```\n\n' +
                '**2.** Faça sua identificação em: <#1344482657970683966>\n' +
                '**3.** Faça seu curso básico MAA em: <#1348230765284163665>\n' +
                '**4.** Leia todas as informações básicas: <#1340418574023524372>\n' +
                '**5.** Inicie o patrulhamento e fique atento ao `/bd`!\n\n' +
                '__**Dicas úteis**__\n' +
                '- **Pegar armas:**  ```/painellegal```\n' +
                '- **Chat interno:** ```/bd mensagem```\n' +
                '- **Chat das duas polícias:** ```/pd2 mensagem```\n' +
                '- **Rádio para patrulha:** ```/radio 2```\n\n' +
                '> Aula de integração: https://youtu.be/jPJoJhirPLw?si=G6kkA7FTT9stj6X2',
            )
            .setColor(0xffffff)

          try {
            await member.send({ content: `<@${member.id}>`, embeds: [dmEmbed] })
            console.log(`✅ DM de integração enviada para ${member.user.tag}`)
          } catch (dmErr) {
            console.log(
              `⚠️ Falha ao enviar DM para ${member.user.tag}: ${dmErr.message}`,
            )
          }
        } catch (err) {
          console.error('❌ Erro ao processar aprovação:', err)
        }
      }

      // COPIAR MENÇÃO ---------------------------------------------------------------
      if (interaction.customId.startsWith('copy_mention_')) {
        const userId = interaction.customId.split('_')[2]
        await interaction.reply({
          content:
            '```' +
            `[DISCORD]: <@${userId}>\n` +
            `[ADICIONAR CARGO]: ${config.branding.shortName} POLICIAL\n` +
            `[TAG]: ${config.branding.shortName}` +
            '```',
          ephemeral: true,
        })
      }

      // RECUSAR ---------------------------------------------------------------------
      if (interaction.customId.startsWith('reject_user_')) {
        const userId = interaction.customId.split('_')[2]
        const member = await interaction.guild.members.fetch(userId)
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
        const approver = await interaction.guild.members.fetch(
          interaction.user.id,
        )

        // atualiza embed + botões
        const updatedEmbed = embed
          .setFooter({ text: `❌ Rejeitado por ${approver.displayName}` })
          .setColor('#FF0000')

        const updatedButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('disabled_approve')
            .setLabel('✅ Aprovar')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('rejected')
            .setLabel('❌ Rejeitado')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
        )

        await interaction.update({
          embeds: [updatedEmbed],
          components: [updatedButtons],
        })

        try {
          await member.send('⚠️ Sua solicitação de ingresso foi recusada.')
        } catch (_) {
          console.log(`⚠️ Não foi possível enviar DM para <@${userId}>.`)
        }
      }

      // Botões específicos
      if (interaction.customId === 'check_hours') {
        await handleCheckHoursInteraction(interaction)
      } else if (interaction.customId === 'sair_servico') {
        await handleSairServicoInteraction(interaction)
      }


      if (interaction.customId === 'startprova') {
        await showModal(interaction)
      }

      if (interaction.customId === 'sair_ausencia') {
        await setupAusencia.handleSairAusencia(interaction)
      }
    }

    // Select Menu
    else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_dias_ausencia') {
        await setupAusencia.handleSelectMenuInteraction(interaction)
      }
    }

    // Modal Submit
    else if (interaction.isModalSubmit()) {
      if (interaction.customId === 'prova_form') {
        const nome = interaction.fields.getTextInputValue('nome_input')
        const id = interaction.fields.getTextInputValue('id_input')

        userFormData.set(interaction.user.id, { nome, id })

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const userData = userFormData.get(interaction.user.id)
        if (userData) {
          const { nome, id } = userData
          const approvalChannel = client.channels.cache.get(
            config.channels.setagemAprovacao,
          )

          if (approvalChannel) {
            const embed = new EmbedBuilder()
              .setColor('#1E90FF')
              .setTitle('📜 Processo de Aprovação de Recruta')
              .setDescription(`📌 **Recruta:** <@${interaction.user.id}>`)
              .addFields(
                { name: '👤 Nome', value: nome, inline: true },
                { name: '🆔 ID', value: id, inline: true },
              )
              .setFooter({
                text: 'Clique em "Aprovar" ou "Recusar" para decidir.',
              })

            const approveButton = new ButtonBuilder()
              .setCustomId(`register_user_${interaction.user.id}`)
              .setLabel('✅ APROVAR')
              .setStyle(ButtonStyle.Success)

            const rejectButton = new ButtonBuilder()
              .setCustomId(`reject_user_${interaction.user.id}`)
              .setLabel('❌ RECUSAR')
              .setStyle(ButtonStyle.Danger)

            const row = new ActionRowBuilder().addComponents(
              approveButton,
              rejectButton,
            )

            await approvalChannel.send({
              content: `Novo recruta: <@${interaction.user.id}>`,
              embeds: [embed],
              components: [row],
            })

            console.log('✅ Mensagem com botões enviada com sucesso.')
          } else {
            console.error('⚠️ Canal de aprovação não encontrado!')
          }

          await interaction.editReply({
            content: 'Formulário enviado para a aprovação!',
            flags: MessageFlags.Ephemeral,
          })
        } else {
          await interaction.editReply({
            content: 'Não foi possível processar seus dados.',
            flags: MessageFlags.Ephemeral,
          })
        }
      } else if (interaction.customId === 'motivo_ausencia') {
        const command = client.commands.get('setupausencia')
        if (command && command.handleModalSubmit) {
          await command.handleModalSubmit(interaction)
        }
      }
    }
  },
}

// Função para exibir o modal
async function showModal(interaction) {
  try {
    const modal = new ModalBuilder()
      .setCustomId('prova_form')
      .setTitle('Formulário de Registro')

    const nomeInput = new TextInputBuilder()
      .setCustomId('nome_input')
      .setLabel('Qual seu nome')
      .setMaxLength(15)
      .setPlaceholder('(Ex: Campin/Satoro/Klaus)')
      .setStyle(TextInputStyle.Short)

    const idInput = new TextInputBuilder()
      .setCustomId('id_input')
      .setLabel('Qual é o seu ID?')
      .setPlaceholder('Utilize somente números')
      .setStyle(TextInputStyle.Short)

    const row1 = new ActionRowBuilder().addComponents(nomeInput)
    const row2 = new ActionRowBuilder().addComponents(idInput)

    modal.addComponents(row1, row2)
    await interaction.showModal(modal)
  } catch (error) {
    console.error('Erro ao mostrar o modal:', error)
  }
}
