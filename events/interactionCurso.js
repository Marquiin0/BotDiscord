const {
  Events,
  EmbedBuilder,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} = require('discord.js')
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args))
const moment = require('moment-timezone')
const { MessageFlags } = require('discord.js')

const { Course } = require('../database')
const { Inscricao } = require('../database')
const config = require('../config')

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    // Processa apenas interações de botões
    if (!interaction.isButton()) return

    // Usaremos um prefixo exclusivo para interações de cursos
    const validPrefixes = [
      'curso_inscrever_',
      'curso_aprovar_',
      'curso_recusar_',
      'curso_finalizarCurso_',
    ]
    if (!validPrefixes.some(prefix => interaction.customId.startsWith(prefix)))
      return

    // Remove o prefixo "curso_" para separar as partes
    const customId = interaction.customId.replace(/^curso_/, '')
    // Espera-se que o customId fique no formato: "inscrever_<courseId>_<userParam>"
    const [action, courseId, userParam] = customId.split('_')

    // ============================================================
    // BOTÃO: INSCREVER
    // ============================================================
    if (action === 'inscrever') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      try {
        const course = await Course.findOne({ where: { courseId } })
        if (!course) {
          return interaction.editReply({
            content: 'Curso não encontrado no banco.',
          })
        }
        const jaInscrito = await Inscricao.findOne({
          where: { userId: interaction.user.id, courseId },
        })
        // Impede inscrição se já estiver aprovado ou pendente
        if (jaInscrito?.status === 'APROVADO') {
          return interaction.editReply({
            content: 'Você já está APROVADO para participar deste curso.',
          })
        }
        if (jaInscrito?.status === 'PENDENTE') {
          return interaction.editReply({
            content: 'Você já enviou comprovante e está em análise.',
          })
        }
        const aprovadosCount = await Inscricao.count({
          where: { courseId, status: 'APROVADO' },
        })
        if (aprovadosCount >= course.vagas) {
          return interaction.editReply({
            content: `O curso **${course.nome}** já atingiu o limite de vagas. Desculpe!`,
          })
        }
        if (!jaInscrito) {
          await Inscricao.create({
            userId: interaction.user.id,
            courseId,
            status: 'PENDENTE',
          })
        }
        // Cria canal para envio do comprovante
        const ticketChannel = await interaction.guild.channels.create({
          name: `comprovante-${interaction.user.username}`,
          type: ChannelType.GuildText,
          parent: config.categories.tickets,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AttachFiles,
              ],
            },
          ],
        })
        await interaction.editReply({
          content: `Canal criado! Envie seu comprovante em <#${ticketChannel.id}> (você tem 2 minutos).`,
        })
        ticketChannel.send({
          content: `👋 <@${interaction.user.id}>, envie **aqui** seu comprovante de pagamento ao PIX GNSPolice (100K) (imagem/anexo).`,
        })
        const filter = m =>
          m.author.id === interaction.user.id && m.attachments.size > 0
        const collector = ticketChannel.createMessageCollector({
          filter,
          max: 1,
          time: 2 * 60 * 1000,
        })
        collector.on('collect', async msg => {
          collector.stop('recebido')
          const attachment = msg.attachments.first()
          if (!attachment) return
          try {
            const response = await fetch(attachment.url)
            if (!response.ok) throw new Error('URL da imagem não acessível')
          } catch (error) {
            console.error('Erro ao acessar imagem:', error)
            return
          }
          await ticketChannel.delete().catch(() => {})
          await Inscricao.update(
            { comprovanteUrl: attachment.url },
            { where: { userId: interaction.user.id, courseId } },
          )
          const canalVerificacao = interaction.guild.channels.cache.get(
            config.channels.cursoComprovantes,
          )
          if (!canalVerificacao) {
            console.error('Canal de verificação não encontrado.')
            return
          }
          const cursoAtual = await Course.findOne({ where: { courseId } })
          const inscricaoAtual = await Inscricao.findOne({
            where: { userId: interaction.user.id, courseId },
          })
          const dataAtual = moment()
            .tz('America/Sao_Paulo')
            .format('DD/MM/YYYY HH:mm')
          const file = new AttachmentBuilder(attachment.url, {
            name: 'comprovante.png',
          })
          const embed = new EmbedBuilder()
            .setColor('#00CC99')
            .setTitle(`🧾 Comprovante Recebido – ${cursoAtual.nome}`)
            .setDescription(
              `**Usuário:** <@${inscricaoAtual.userId}>\n` +
                `**Curso:** ${cursoAtual.nome}\n` +
                `**Data/Horário do Curso:** ${cursoAtual.data} às ${cursoAtual.horario}\n` +
                `**Status atual:** ${inscricaoAtual.status}\n\n` +
                `**CourseID:** \`${courseId}\`\n` +
                `**Recebido em:** ${dataAtual}`,
            )
            .setImage('attachment://comprovante.png')
            .setFooter({ text: config.branding.footerText })
            .setTimestamp()
          const approveBtn = new ButtonBuilder()
            .setCustomId(`curso_aprovar_${courseId}_${inscricaoAtual.userId}`)
            .setLabel('Aprovar')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
          const denyBtn = new ButtonBuilder()
            .setCustomId(`curso_recusar_${courseId}_${inscricaoAtual.userId}`)
            .setLabel('Recusar')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
          const row = new ActionRowBuilder().addComponents(approveBtn, denyBtn)
          await canalVerificacao.send({
            embeds: [embed],
            files: [file],
            components: [row],
          })
        })
        collector.on('end', async (collected, reason) => {
          // Se o usuário não enviar o comprovante em 2 minutos,
          // exclui a sala e cancela a inscrição (removendo-a do banco)
          if (reason !== 'recebido') {
            await ticketChannel.delete().catch(() => {})
            await Inscricao.destroy({
              where: { userId: interaction.user.id, courseId },
            })
          }
        })
      } catch (error) {
        console.error(error)
        return interaction.editReply({ content: 'Erro ao inscrever.' })
      }
      return
    }
    const membernick = await interaction.guild.members.fetch(
      interaction.user.id,
    )

    // ============================================================
    // BOTÃO: APROVAR
    // ============================================================
    if (action === 'aprovar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      try {
        const userId = userParam
        const inscricao = await Inscricao.findOne({
          where: { userId, courseId },
        })
        const course = await Course.findOne({ where: { courseId } })
        if (!inscricao || !course) {
          return interaction.editReply({ content: 'Dados não encontrados.' })
        }
        const aprovadosCount = await Inscricao.count({
          where: { courseId, status: 'APROVADO' },
        })
        if (aprovadosCount >= course.vagas) {
          return interaction.editReply({
            content: `O curso **${course.nome}** já está lotado. Não é possível aprovar.`,
          })
        }
        inscricao.status = 'APROVADO'
        await inscricao.save()
        try {
          const userDM = await interaction.client.users.fetch(userId)
          const dmEmbed = new EmbedBuilder()
            .setColor('#00AA00')
            .setTitle(`🟢 Aprovado para participação do curso – ${course.nome}`)
            .setDescription(
              `🗓 **Data:** ${course.data}\n` +
                `🕒 **Horário:** ${course.horario}\n` +
                `📍 **Local:** ${course.local}\n` +
                `\nParabéns! Sua inscrição foi aprovada. Compareça no dia e horário combinado!\n`,
            )
            .setFooter({ text: config.branding.footerText })
            .setTimestamp()
          await userDM.send({ embeds: [dmEmbed] })
        } catch (dmError) {
          console.error(`Falha ao enviar DM para ${userId}:`, dmError)
        }
        const oldMessage = interaction.message
        const oldEmbed = oldMessage.embeds[0]
        if (!oldEmbed) {
          return interaction.editReply({
            content: 'Embed original não encontrado.',
          })
        }
        const newEmbed = EmbedBuilder.from(oldEmbed)
          .setTitle(`🟢 Comprovante Recebido – ${course.nome}`)
          .setDescription(
            `**Usuário:** <@${inscricao.userId}>\n` +
              `**Curso:** ${course.nome}\n` +
              `**Data/Horário do Curso:** ${course.data} às ${course.horario}\n` +
              `**Status atual:** APROVADO\n\n` +
              `**CourseID:** \`${courseId}\``,
          )
          .setColor('#00AA00')
          .setFooter({ text: `Aprovado por: ${membernick.displayName} | ${config.branding.footerText}` })
        const oldActionRow = oldMessage.components[0]
        const newActionRow = new ActionRowBuilder()
        oldActionRow.components.forEach(comp => {
          if (comp.customId === `curso_aprovar_${courseId}_${userId}`) {
            newActionRow.addComponents(
              ButtonBuilder.from(comp)
                .setLabel('Aprovado')
                .setEmoji('✅')
                .setDisabled(true),
            )
          } else if (comp.customId === `curso_recusar_${courseId}_${userId}`) {
            newActionRow.addComponents(
              ButtonBuilder.from(comp)
                .setLabel('Recusar')
                .setEmoji('❌')
                .setDisabled(true),
            )
          }
        })
        await oldMessage.edit({
          embeds: [newEmbed],
          components: [newActionRow],
          attachments: [...oldMessage.attachments.values()],
        })
        await updateCourseEmbed(interaction, course.courseId)
        return interaction.editReply({
          content: `✅ <@${userId}> foi **APROVADO** no curso **${course.nome}**!`,
        })
      } catch (error) {
        console.error(error)
        return interaction.editReply({ content: 'Erro ao aprovar.' })
      }
      return
    }

    // ============================================================
    // BOTÃO: RECUSAR
    // ============================================================
    if (action === 'recusar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      try {
        const userId = userParam
        const inscricao = await Inscricao.findOne({
          where: { userId, courseId },
        })
        const course = await Course.findOne({ where: { courseId } })
        if (!inscricao || !course) {
          return interaction.editReply({ content: 'Dados não encontrados.' })
        }
        inscricao.status = 'RECUSADO'
        await inscricao.save()
        try {
          const userDM = await interaction.client.users.fetch(userId)
          const dmEmbed = new EmbedBuilder()
            .setColor('#AA0000')
            .setTitle(`🔴 Recusado no curso – ${course.nome}`)
            .setDescription(
              `Infelizmente, sua inscrição foi recusada.\n\n` +
                `🗓 **Data:** ${course.data}\n` +
                `🕒 **Horário:** ${course.horario}\n` +
                `📍 **Local:** ${course.local}\n\n` +
                `Em caso de dúvidas, procure o instrutor responsável!`,
            )
            .setFooter({ text: config.branding.footerText })
            .setTimestamp()
          await userDM.send({ embeds: [dmEmbed] })
        } catch (dmError) {
          console.error(`Falha ao enviar DM para ${userId}:`, dmError)
        }
        const oldMessage = interaction.message
        const oldEmbed = oldMessage.embeds[0]
        if (!oldEmbed) {
          return interaction.editReply({
            content: 'Embed original não encontrado.',
          })
        }
        const newEmbed = EmbedBuilder.from(oldEmbed)
          .setTitle(`🔴 Comprovante Recebido – ${course.nome}`)
          .setDescription(
            `**Usuário:** <@${inscricao.userId}>\n` +
              `**Curso:** ${course.nome}\n` +
              `**Data/Horário do Curso:** ${course.data} às ${course.horario}\n` +
              `**Status atual:** RECUSADO\n\n` +
              `**CourseID:** \`${courseId}\``,
          )
          .setColor('#AA0000')
          .setFooter({ text: `Recusado por: ${membernick.displayName} | ${config.branding.footerText}` })
        const oldActionRow = oldMessage.components[0]
        const newActionRow = new ActionRowBuilder()
        oldActionRow.components.forEach(comp => {
          if (comp.customId === `curso_recusar_${courseId}_${userId}`) {
            newActionRow.addComponents(
              ButtonBuilder.from(comp)
                .setLabel('Recusado')
                .setEmoji('❌')
                .setDisabled(true),
            )
          } else if (comp.customId === `curso_aprovar_${courseId}_${userId}`) {
            newActionRow.addComponents(
              ButtonBuilder.from(comp)
                .setLabel('Aprovar')
                .setEmoji('✅')
                .setDisabled(true),
            )
          }
        })
        await oldMessage.edit({
          embeds: [newEmbed],
          components: [newActionRow],
          attachments: [...oldMessage.attachments.values()],
        })
        await updateCourseEmbed(interaction, course.courseId)
        return interaction.editReply({
          content: `❌ <@${userId}> foi **RECUSADO** no curso **${course.nome}**.`,
        })
      } catch (error) {
        console.error(error)
        return interaction.editReply({ content: 'Erro ao recusar.' })
      }
      return
    }

    // ============================================================
    // BOTÃO: FINALIZAR CURSO
    // ============================================================
    if (action === 'finalizarCurso') {
      if (
        !interaction.member.permissions.has(
          PermissionFlagsBits.Administrator,
        ) &&
        !config.permissions.curso.some(roleId => interaction.member.roles.cache.has(roleId))
      ) {
        return interaction.reply({
          content: 'Você não tem permissão para clicar neste botão.',
          ephemeral: true,
        })
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      try {
        const course = await Course.findOne({ where: { courseId } })
        if (!course) {
          return interaction.editReply({ content: 'Curso não encontrado.' })
        }
        const oldChannel = interaction.client.channels.cache.get(
          course.channelId,
        )
        if (!oldChannel) {
          return interaction.editReply({
            content: 'Não encontrei o canal original do curso.',
          })
        }
        const oldMessage = await oldChannel.messages
          .fetch(course.messageId)
          .catch(() => null)
        if (!oldMessage) {
          return interaction.editReply({
            content: 'Não encontrei a mensagem do curso.',
          })
        }
        const oldEmbed = oldMessage.embeds[0]
        if (!oldEmbed) {
          return interaction.editReply({
            content: 'Embed do curso não encontrado.',
          })
        }
        const newEmbed = EmbedBuilder.from(oldEmbed)
          .setTitle(`📕 Inscrições Fechadas – ${course.nome}`)
          .setColor('#FF0000')
        const oldActionRows = oldMessage.components
        const newComponents = []
        for (const row of oldActionRows) {
          const newRow = new ActionRowBuilder()
          for (const comp of row.components) {
            if (comp.customId?.startsWith('curso_inscrever_')) {
              newRow.addComponents(ButtonBuilder.from(comp).setDisabled(true))
            } else if (comp.customId === interaction.customId) {
              newRow.addComponents(
                ButtonBuilder.from(comp)
                  .setLabel('Finalizado')
                  .setEmoji('🔒')
                  .setDisabled(true),
              )
            } else {
              newRow.addComponents(ButtonBuilder.from(comp).setDisabled(true))
            }
          }
          newComponents.push(newRow)
        }
        await oldMessage.edit({
          embeds: [newEmbed],
          components: newComponents,
          attachments: [...oldMessage.attachments.values()],
        })
        const aprovados = await Inscricao.findAll({
          where: { courseId, status: 'APROVADO' },
        })
        if (!aprovados || aprovados.length === 0) {
          return interaction.editReply({
            content: `Ninguém foi aprovado para participar do curso **${course.nome}**.`,
          })
        }
        const lista = aprovados.map(a => `<@${a.userId}>`).join('\n')
        const embedFinal = new EmbedBuilder()
          .setTitle(`🚩 Inscrição do curso finalizado – ${course.nome}`)
          .setDescription(
            `**Participantes Pré Aprovados**:\n${lista}\n\n` +
              `🗓 **Data:** ${course.data}\n` +
              `🕒 **Horário:** ${course.horario}\n` +
              `📍 **Local:** ${course.local}`,
          )
          .setColor('#F1C40F')
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()
        const canalVerificacao = interaction.guild.channels.cache.get(
          config.channels.cursoAprovados,
        )
        if (!canalVerificacao) {
          return interaction.editReply({
            content: 'Canal de verificação não encontrado.',
          })
        }
        await canalVerificacao.send({ embeds: [embedFinal] })
        return interaction.editReply({
          content: `O curso **${course.nome}** foi finalizado!`,
        })
      } catch (error) {
        console.error(error)
        return interaction.editReply({ content: 'Erro ao finalizar o curso.' })
      }
    }
  },
}

/**
 * Atualiza a contagem de vagas (X / Y) no embed principal do curso,
 * baseado na quantidade de aprovados.
 */
async function updateCourseEmbed(interaction, courseId) {
  try {
    const course = await Course.findOne({ where: { courseId } })
    if (!course) return
    const aprovadosCount = await Inscricao.count({
      where: { courseId, status: 'APROVADO' },
    })
    const channel = interaction.client.channels.cache.get(course.channelId)
    if (!channel) return
    const msg = await channel.messages.fetch(course.messageId).catch(() => null)
    if (!msg) return
    const oldEmbed = msg.embeds[0]
    if (!oldEmbed) return
    let newDesc = oldEmbed.description || ''
    const regex = /(\*\*🎫 Vagas:\*\*\s?\d+\s?\/\s?\d+)/i
    const replacement = `**🎫 Vagas:** ${aprovadosCount} / ${course.vagas}`
    if (regex.test(newDesc)) {
      newDesc = newDesc.replace(regex, replacement)
    } else {
      newDesc += `\n${replacement}`
    }
    const newEmbed = EmbedBuilder.from(oldEmbed).setDescription(newDesc)
    await msg.edit({
      embeds: [newEmbed],
      components: msg.components,
      attachments: [...msg.attachments.values()],
    })
  } catch (err) {
    console.error('Erro ao atualizar embed principal (vagas):', err)
  }
}
