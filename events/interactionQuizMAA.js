const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js')
const { QuizResult } = require('../database')
const config = require('../config')
const maaQuestions = require('../utils/maaQuestions.json')

// Armazena sessões ativas de quiz
const activeSessions = new Map()

// Fisher-Yates shuffle (embaralhamento correto e uniforme)
function shuffle(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.deferred || interaction.replied) return
    // ==================== BOTÃO INICIAR QUIZ ====================
    if (interaction.isButton() && interaction.customId === 'iniciar_quiz_maa') {
      await handleStartQuiz(interaction, client)
      return
    }

    // ==================== BOTÕES DE RESPOSTA ====================
    if (interaction.isButton() && interaction.customId.startsWith('quiz_maa_')) {
      await handleQuizAnswer(interaction)
      return
    }
  },
}

async function handleStartQuiz(interaction, client) {
  const userId = interaction.user.id

  // Verifica se já tem o cargo de MAA aprovado
  const member = interaction.guild.members.cache.get(userId)
  if (member && member.roles.cache.has(config.cursoMAA.roleAprovado)) {
    return interaction.reply({
      content: '✅ Você já possui o curso MAA aprovado!',
      flags: MessageFlags.Ephemeral,
    })
  }

  // Verifica se já tem sessão ativa
  if (activeSessions.has(userId)) {
    return interaction.reply({
      content: '⚠️ Você já tem um questionário em andamento!',
      flags: MessageFlags.Ephemeral,
    })
  }

  // Verifica tentativa recente (cooldown de 1 hora)
  const recentAttempt = await QuizResult.findOne({
    where: { userId },
    order: [['attemptDate', 'DESC']],
  })

  if (recentAttempt) {
    const timeSince = Date.now() - new Date(recentAttempt.attemptDate).getTime()
    const cooldownMs = 60 * 60 * 1000 // 1 hora
    if (timeSince < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - timeSince) / 60000)
      return interaction.reply({
        content: `⏳ Você precisa aguardar **${remaining} minutos** antes de tentar novamente.`,
        flags: MessageFlags.Ephemeral,
      })
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    // Cria canal privado para o quiz
    const quizChannel = await interaction.guild.channels.create({
      name: `quiz-maa-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: config.cursoMAA.categoryId,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    })

    // Embaralha as perguntas E as opções dentro de cada pergunta
    const labels = ['A', 'B', 'C', 'D']
    const shuffledQuestions = shuffle(maaQuestions).map(q => {
      const correctText = q.options.find(o => o.label === q.answer).text
      const shuffledOptions = shuffle(q.options)
      let newAnswer = ''
      const newOptions = shuffledOptions.map((opt, i) => {
        if (opt.text === correctText) newAnswer = labels[i]
        return { label: labels[i], text: opt.text }
      })
      return { ...q, options: newOptions, answer: newAnswer }
    })

    // Cria sessão
    const session = {
      channelId: quizChannel.id,
      userId,
      questions: shuffledQuestions,
      currentQuestion: 0,
      score: 0,
      startTime: Date.now(),
      timeout: null,
    }

    activeSessions.set(userId, session)

    // Timer de 30 minutos
    session.timeout = setTimeout(async () => {
      await finishQuiz(interaction.guild, userId, 'timeout')
    }, config.cursoMAA.tempoLimiteMs)

    // Embed inicial
    const startEmbed = new EmbedBuilder()
      .setColor(config.branding.color)
      .setTitle(`📝 Curso MAA - Questionário`)
      .setDescription(
        `Bem-vindo ao questionário do **Curso MAA**!\n\n` +
        `📋 **${config.cursoMAA.totalPerguntas} perguntas** de múltipla escolha\n` +
        `✅ Necessário acertar **${config.cursoMAA.acertosNecessarios}/${config.cursoMAA.totalPerguntas}**\n` +
        `⏱️ Tempo limite: **30 minutos**\n\n` +
        `Boa sorte, <@${userId}>!`,
      )
      .setFooter({ text: config.branding.footerText })
      .setTimestamp()

    await quizChannel.send({ embeds: [startEmbed] })

    // Envia primeira pergunta
    await sendQuestion(quizChannel, session)

    await interaction.editReply({
      content: `✅ Questionário criado! Acesse <#${quizChannel.id}> para iniciar.`,
    })
  } catch (error) {
    console.error('Erro ao criar quiz MAA:', error)
    await interaction.editReply({
      content: '❌ Ocorreu um erro ao criar o questionário.',
    })
  }
}

async function sendQuestion(channel, session) {
  const question = session.questions[session.currentQuestion]
  const questionNumber = session.currentQuestion + 1
  const total = session.questions.length

  // Calcula tempo restante
  const elapsed = Date.now() - session.startTime
  const remaining = Math.ceil((config.cursoMAA.tempoLimiteMs - elapsed) / 60000)

  const embed = new EmbedBuilder()
    .setColor('#2F3136')
    .setTitle(`Pergunta ${questionNumber}/${total}`)
    .setDescription(`**${question.question}**`)
    .addFields(
      question.options.map(opt => ({
        name: `${opt.label})`,
        value: opt.text,
        inline: false,
      })),
    )
    .setFooter({
      text: `Acertos: ${session.score}/${questionNumber - 1} | Tempo restante: ~${remaining} min`,
    })

  const buttons = new ActionRowBuilder().addComponents(
    question.options.map(opt =>
      new ButtonBuilder()
        .setCustomId(`quiz_maa_${session.userId}_${question.id}_${opt.label}`)
        .setLabel(opt.label)
        .setStyle(ButtonStyle.Secondary),
    ),
  )

  await channel.send({ embeds: [embed], components: [buttons] })
}

async function handleQuizAnswer(interaction) {
  const parts = interaction.customId.split('_')
  // quiz_maa_userId_questionId_answer
  const sessionUserId = parts[2]
  const questionId = parseInt(parts[3])
  const selectedAnswer = parts[4]

  // Verifica se é o dono da sessão
  if (interaction.user.id !== sessionUserId) {
    return interaction.reply({
      content: '❌ Este questionário não é seu!',
      flags: MessageFlags.Ephemeral,
    })
  }

  const session = activeSessions.get(sessionUserId)
  if (!session) {
    return interaction.reply({
      content: '⚠️ Sessão não encontrada ou expirada. O bot pode ter reiniciado. Inicie um novo questionário no canal do curso MAA.',
      flags: MessageFlags.Ephemeral,
    })
  }

  const currentQuestion = session.questions[session.currentQuestion]

  // Verifica se a resposta é para a pergunta atual
  if (currentQuestion.id !== questionId) {
    return interaction.reply({
      content: '⚠️ Esta pergunta já foi respondida.',
      flags: MessageFlags.Ephemeral,
    })
  }

  await interaction.deferUpdate()

  // Verifica resposta
  const isCorrect = selectedAnswer === currentQuestion.answer
  if (isCorrect) {
    session.score++
  }

  // Desabilita botões da mensagem atual
  const disabledRow = new ActionRowBuilder().addComponents(
    currentQuestion.options.map(opt => {
      let style = ButtonStyle.Secondary
      if (opt.label === currentQuestion.answer) style = ButtonStyle.Success
      else if (opt.label === selectedAnswer && !isCorrect) style = ButtonStyle.Danger

      return new ButtonBuilder()
        .setCustomId(`quiz_done_${opt.label}_${Date.now()}`)
        .setLabel(opt.label)
        .setStyle(style)
        .setDisabled(true)
    }),
  )

  await interaction.message.edit({ components: [disabledRow] })

  // Feedback rápido
  const feedbackEmbed = new EmbedBuilder()
    .setColor(isCorrect ? '#00FF00' : '#FF0000')
    .setDescription(
      isCorrect
        ? `✅ **Correto!** Resposta: **${currentQuestion.answer}**`
        : `❌ **Incorreto!** Resposta correta: **${currentQuestion.answer}**`,
    )

  await interaction.channel.send({ embeds: [feedbackEmbed] })

  // Próxima pergunta ou finalizar
  session.currentQuestion++

  if (session.currentQuestion >= session.questions.length) {
    await finishQuiz(interaction.guild, sessionUserId, 'completed')
  } else {
    // Pequeno delay antes da próxima pergunta
    setTimeout(async () => {
      try {
        const channel = interaction.guild.channels.cache.get(session.channelId)
        if (channel) {
          await sendQuestion(channel, session)
        }
      } catch (e) {
        console.error('Erro ao enviar próxima pergunta:', e)
      }
    }, 1500)
  }
}

async function finishQuiz(guild, userId, reason) {
  const session = activeSessions.get(userId)
  if (!session) return

  // Limpa timeout
  if (session.timeout) clearTimeout(session.timeout)
  activeSessions.delete(userId)

  const passed = session.score >= config.cursoMAA.acertosNecessarios
  const total = session.questions.length
  const elapsed = Math.ceil((Date.now() - session.startTime) / 60000)

  // Salva resultado no BD
  await QuizResult.create({
    userId,
    score: session.score,
    totalQuestions: total,
    passed,
    attemptDate: new Date(),
  })

  const channel = guild.channels.cache.get(session.channelId)
  if (!channel) return

  let resultText
  let color

  if (reason === 'timeout') {
    resultText = `⏱️ **Tempo esgotado!**\n\nVocê respondeu ${session.currentQuestion}/${total} perguntas.\nAcertos: **${session.score}**`
    color = '#FFA500'
  } else if (passed) {
    resultText = `🎉 **Parabéns, você foi APROVADO!**\n\nAcertos: **${session.score}/${total}**\nTempo: **${elapsed} minutos**\n\nVocê receberá o cargo de Curso MAA.`
    color = '#00FF00'
  } else {
    resultText = `❌ **Reprovado.**\n\nAcertos: **${session.score}/${total}** (necessário: ${config.cursoMAA.acertosNecessarios})\nTempo: **${elapsed} minutos**\n\nVocê pode tentar novamente em 1 hora.`
    color = '#FF0000'
  }

  const resultEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle('📋 Resultado do Questionário MAA')
    .setDescription(resultText)
    .setFooter({ text: config.branding.footerText })
    .setTimestamp()

  await channel.send({ embeds: [resultEmbed] })

  // Envia resultado no servidor de logs
  try {
    const logsGuild = guild.client.guilds.cache.get(config.guilds.logs)
    if (logsGuild) {
      const logChannel = logsGuild.channels.cache.get(config.logsChannels.cursoMAA)
      if (logChannel) {
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null)
        const displayName = member ? member.displayName : userId

        const logEmbed = new EmbedBuilder()
          .setColor(color)
          .setTitle('📋 Resultado do Curso MAA')
          .addFields(
            { name: '👤 Membro', value: `<@${userId}> (${displayName})`, inline: true },
            { name: '📊 Resultado', value: passed ? '✅ Aprovado' : (reason === 'timeout' ? '⏱️ Tempo esgotado' : '❌ Reprovado'), inline: true },
            { name: '🎯 Acertos', value: `${session.score}/${total}`, inline: true },
            { name: '⏱️ Tempo', value: `${elapsed} minutos`, inline: true },
          )
          .setFooter({ text: config.branding.footerText })
          .setTimestamp()

        await logChannel.send({ embeds: [logEmbed] })
      }
    }
  } catch (e) {
    console.error('Erro ao enviar log do curso MAA:', e)
  }

  // Se aprovado, adiciona cargo
  if (passed) {
    try {
      const member = await guild.members.fetch(userId)
      await member.roles.add(config.cursoMAA.roleAprovado)
    } catch (e) {
      console.error('Erro ao adicionar cargo MAA:', e)
    }
  }

  // Deleta canal após 30 segundos
  setTimeout(async () => {
    try {
      await channel.delete()
    } catch (e) {
      console.error('Erro ao deletar canal do quiz:', e)
    }
  }, 30000)
}
