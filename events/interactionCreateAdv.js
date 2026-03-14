const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js')
const config = require('../config')
const {
  Warning,
  PromotionRequests,
  PromotionRecords,
  PrisonReports,
  Ausencia,
} = require('../database')
// Importa os modelos necessários (caso ainda não estejam importados neste arquivo)
const { UserPontos, UserActions } = require('../database.js')
// Importa o arquivo JSON com os tipos de ação (ajuste o caminho se necessário)
const actionTypes = require('../utils/actionTypes.json') // ajuste o caminho conforme necessário
const { MessageFlags } = require('discord.js')

const rolesMap = {
  verbal: { id: config.roles.adv1, duration: 7 }, // 7 dias
  adv1: { id: config.roles.adv1, duration: 15 }, // 15 dias
  adv2: { id: config.roles.adv2, duration: 30 }, // 30 dias (exoneração)
}

const EXONERATION_ROLE = config.roles.recruta // Cargo que será aplicado na exoneração
const EXONERATION_CHANNEL = config.channels.exoneracaoLog // Canal onde será comunicada a exoneração

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (!interaction.isButton() && !interaction.isModalSubmit()) return

    const [action, userId] = interaction.customId.split('_')

    /** 🔹 Aplicação de Advertência **/
    if (action === 'advertir') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_advertir_${userId}`)
        .setTitle('⚠️ Aplicar Advertência')

      const roleInput = new TextInputBuilder()
        .setCustomId('tipo_adv')
        .setLabel('Tipo de Advertência (VERBAL, ADV1, ADV2)')
        .setPlaceholder('Digite VERBAL, ADV1 ou ADV2')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)

      const reasonInput = new TextInputBuilder()
        .setCustomId('motivo_adv')
        .setLabel('Motivo da Advertência')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)

      modal.addComponents(
        new ActionRowBuilder().addComponents(roleInput),
        new ActionRowBuilder().addComponents(reasonInput),
      )

      await interaction.showModal(modal)
    }

    /** 🔹 Processamento do Modal **/
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('modal_advertir')
    ) {
      console.log(`[DEBUG-ADV-HANDLER] Processando modal_advertir - customId: ${interaction.customId}`)
      const userId = interaction.customId.replace('modal_advertir_', '')
      const typeInput = interaction.fields
        .getTextInputValue('tipo_adv')
        .toLowerCase()
      const reason = interaction.fields.getTextInputValue('motivo_adv')
      const roleData = rolesMap[typeInput]

      if (!roleData) {
        return interaction.reply({
          content:
            '⚠️ Tipo de advertência inválido. Use: **VERBAL, ADV1 ou ADV2**.',
          flags: MessageFlags.Ephemeral,
        })
      }

      const member = await interaction.guild.members
        .fetch(userId)
        .catch(() => null)
      if (!member) {
        return interaction.reply({
          content: `⚠️ O oficial <@${userId}> não foi encontrado no servidor.`,
          flags: MessageFlags.Ephemeral,
        })
      }

      /** 🔹 Verificar se o usuário já tem a advertência ativa **/
      const existingWarning = await Warning.findOne({
        where: { userId, roleId: roleData.id },
      })

      if (existingWarning) {
        return interaction.reply({
          content: `⚠️ O oficial já possui uma advertência do tipo **${typeInput.toUpperCase()}** ativa.`,
          flags: MessageFlags.Ephemeral,
        })
      }

      const expirationDate = new Date()
      expirationDate.setDate(expirationDate.getDate() + roleData.duration) // Adiciona os dias correspondentes

      /** 🔹 Se não for ADV2, apenas aplica a advertência **/
      await member.roles.add(roleData.id)

      await Warning.create({
        userId: userId,
        roleId: roleData.id,
        reason: reason,
        timestamp: expirationDate,
        appliedBy: interaction.user.id, // ✅ Agora salva quem aplicou a advertência
      })

      const OTHER_GUILD_ID = config.guilds.logs
      const OTHER_LOG_CHANNEL_ID = config.logsChannels.corregedoria

      const logEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('📋 Log de Advertência')
        .setDescription(`Uma advertência foi aplicada.`)
        .addFields(
          {
            name: 'Aplicador',
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
          { name: 'Oficial Advertido', value: `<@${userId}>`, inline: true },
          { name: 'Motivo', value: reason, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: `${config.branding.footerText} CORREGEDORIA` })

      // Obter a outra guild através do client
      const otherGuild = interaction.client.guilds.cache.get(OTHER_GUILD_ID)
      if (otherGuild) {
        const logChannel = otherGuild.channels.cache.get(OTHER_LOG_CHANNEL_ID)
          || await otherGuild.channels.fetch(OTHER_LOG_CHANNEL_ID).catch(() => null)
        if (logChannel) {
          console.log('[DEBUG-ADV] Enviando ADV log para servidor de logs')
          await logChannel.send({ embeds: [logEmbed] })
        } else {
          console.error('Canal de corregedoria não encontrado no servidor de logs:', OTHER_LOG_CHANNEL_ID)
        }
      } else {
        console.error('Guild de logs não encontrada:', OTHER_GUILD_ID)
      }

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❗ Advertência Aplicada')
        .setDescription(`Uma advertência foi aplicada a <@${userId}>`)
        .addFields(
          { name: '👤 Oficial', value: `<@${userId}>`, inline: true },
          {
            name: '⚠️ Tipo de Advertência',
            value: `<@&${roleData.id}>`,
            inline: true,
          },
          { name: '📌 Motivo', value: reason, inline: false },
          {
            name: '📅 Expira em',
            value: `<t:${Math.floor(expirationDate.getTime() / 1000)}:D>`,
            inline: true,
          },
        )
        .setTimestamp()
        .setFooter({
          text: `${config.branding.footerText} CORREGEDORIA`,
          iconURL: 'https://i.imgur.com/rWT8kmE.png',
        })

      const advChannel = interaction.guild.channels.cache.get(
        config.channels.exoneracaoLog,
      )
      if (advChannel) advChannel.send({ embeds: [embed] })

      await interaction.reply({
        content: '✅ Advertência aplicada com sucesso!',
        flags: MessageFlags.Ephemeral,
      })

      let pointsToSubtract = 0
      if (typeInput === 'verbal') {
        pointsToSubtract = -100
      } else if (typeInput === 'adv1') {
        pointsToSubtract = -200
      } else if (typeInput === 'adv2') {
        pointsToSubtract = -300
      }

      let userPontosRecord = await UserPontos.findOne({ where: { userId } })
      if (userPontosRecord) {
        userPontosRecord.pontos += pointsToSubtract
        await userPontosRecord.save()
      } else {
        await UserPontos.create({
          userId,
          pontos: pointsToSubtract,
        })
      }

      await UserActions.create({
        userId,
        id_tipo: typeInput,
        nome_tipo: `Advertência ${typeInput.toUpperCase()}`,
        pontos: pointsToSubtract,
        multiplicador: 1,
        pontosRecebidos: pointsToSubtract,
      })
      // Após a criação do embed para o canal, crie um embed específico para DM:
      const dmEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❗ Advertência Aplicada')
        .setDescription(`Uma advertência foi aplicada a <@${userId}>`)
        .addFields(
          { name: '👤 Oficial', value: `<@${userId}>`, inline: true },
          // Exibe o tipo de advertência como texto (em letras maiúsculas)
          {
            name: '⚠️ Tipo de Advertência',
            value: `${typeInput.toUpperCase()}`,
            inline: true,
          },
          { name: '📌 Motivo', value: reason, inline: false },
          {
            name: '📅 Expira em',
            value: `<t:${Math.floor(expirationDate.getTime() / 1000)}:D>`,
            inline: true,
          },
        )
        .setTimestamp()
        .setFooter({
          text: `${config.branding.footerText} CORREGEDORIA`,
          iconURL: 'https://i.imgur.com/rWT8kmE.png',
        })

      // Criação do botão "Recorrer"
      const appealButton = new ButtonBuilder()
        .setLabel('⚖️ Recorrer')
        .setStyle(ButtonStyle.Link)
        .setURL(
          `https://discord.com/channels/${config.guilds.main}/${config.channels.tickets}`,
        )

      const dmRow = new ActionRowBuilder().addComponents(appealButton)

      // Envio da mensagem para o usuário no privado (DM)
      try {
        await member.send({
          content: `❗ Você recebeu uma advertência no servidor **${interaction.guild.name}**.`,
          embeds: [dmEmbed],
          components: [dmRow],
        })
      } catch (error) {
        console.log(
          `Não foi possível enviar a mensagem para ${member.user.tag}.`,
        )
      }
    }
  },
}

/** 🔹 Função para processar exoneração **/
async function handleExoneration(interaction, member, reason) {
  try {
    // 🔹 Removendo todos os registros do usuário nos bancos de dados
    await Warning.destroy({ where: { userId: member.id } })
    await PromotionRequests.destroy({ where: { userId: member.id } })
    await PromotionRecords.destroy({ where: { userId: member.id } })
    await PrisonReports.destroy({ where: { commanderId: member.id } })
    await Ausencia.destroy({ where: { userId: member.id } })

    // 🔹 Removendo todos os cargos e aplicando o novo cargo de exoneração
    const oldRoles = member.roles.cache.map(role => role.id)
    await member.roles.remove(oldRoles)
    await member.roles.add(EXONERATION_ROLE)

    // 🔹 Resetando o nickname (Opcional)
    await member.setNickname('')

    // 🔹 Enviando a ordem de exoneração no canal
    const today = new Date()
    const formattedDate = today.toLocaleDateString('pt-BR')

    const embed = new EmbedBuilder()
      .setTitle(`${config.branding.name} - Ordem de Exoneração - ${formattedDate}`)
      .setDescription(
        `É com profundo pesar que concedemos a seguinte ordem de exoneração:\n\n
                ❌ **Usuário Exonerado:** <@${member.id}>\n
                📌 **Motivo:** \`\`\`${reason}\`\`\`\n\n
                Embora esta seja uma despedida dolorosa, esperamos que possa ser encarada como uma oportunidade para reflexão pessoal e crescimento. Que leve consigo as lições aprendidas durante seu tempo de serviço e as utilize para moldar um futuro de responsabilidade e contribuição positiva para a sociedade.\n\n
                **Sofra a dor da disciplina ou sofra a dor do arrependimento.**`,
      )
      .setColor('#ff0000')
      .setTimestamp()

    const channel = interaction.guild.channels.cache.get(EXONERATION_CHANNEL)
    if (channel) channel.send({ embeds: [embed] })

    // Enviar log para o servidor de logs
    const logsGuild = interaction.client.guilds.cache.get(config.guilds.logs)
    if (logsGuild) {
      const logChannel = logsGuild.channels.cache.get(config.logsChannels.corregedoria)
      if (logChannel) await logChannel.send({ embeds: [embed] })
    }

    await interaction.reply({
      content: '✅ Exoneração aplicada. Todos os registros foram removidos.',
      flags: MessageFlags.Ephemeral,
    })

    try {
      await member.send({
        content: `❌ Você foi exonerado do servidor **${interaction.guild.name}**.`,
        embeds: [embed],
      })
    } catch (error) {
      console.log(`Não foi possível enviar mensagem para ${member.user.tag}.`)
    }
  } catch (error) {
    console.error('Erro ao processar exoneração:', error)
    await interaction.reply({
      content: '⚠️ Ocorreu um erro ao tentar exonerar o usuário.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
