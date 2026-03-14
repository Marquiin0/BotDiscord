const {
  Events,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js')
const config = require('../config')
const { MessageFlags } = require('discord.js')

// IDs de cargos
const CARGO_maa = config.roles.maaAprovado
const CARGO_ABORDAGEM = '1346730612974948404'
const CARGO_ACOMPANHAMENTO = '1346730489641172993'

// Canal de log
const LOG_CHANNEL_ID = config.logsChannels.ticket
const EXTRA_GUILD_ID = config.guilds.logs
const EXTRA_LOG_CHANNEL_ID = config.channels.cursoMAA
// Categoria para as salas
const SALA_CATEGORY_ID = config.categories.cursoQuiz

// userId -> { ...dados do curso... }
const activeCourses = new Map()

// userId -> { maa: <ts>, abordagem: <ts>, acompanhamento: <ts> }
const cooldowns = new Map()

// 1 hora (em ms)
const COOLDOWN_MS = 60 * 60 * 1000
// 12 minutos (em ms)
const TIME_LIMIT_MS = 20 * 60 * 1000
module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (!interaction.isButton()) return

    // Iniciar curso
    if (interaction.customId === 'cursomaa') {
      return iniciarCurso(interaction, 'maa')
    }
    if (interaction.customId === 'cursoAbordagem') {
      return iniciarCurso(interaction, 'abordagem')
    }
    if (interaction.customId === 'cursoAcompanhamento') {
      return iniciarCurso(interaction, 'acompanhamento')
    }

    // Botões do embed inicial na sala: "Começar", "Encerrar"
    if (interaction.customId.startsWith('start_'))
      return comecarPerguntas(interaction)
    if (interaction.customId.startsWith('close_'))
      return encerrarSemProva(interaction)

    // Botões de respostas (resp_userId_indice_opcao)
    if (interaction.customId.startsWith('resp_'))
      return processarResposta(interaction)
  },
}

// ==================== CRIA SALA E EMBED INICIAL + TIMER ====================
async function iniciarCurso(interaction, tipoCurso) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const userId = interaction.user.id
  const now = Date.now()

  // Verifica cooldown do user para ESTE tipo de curso
  let userCooldowns = cooldowns.get(userId)
  if (!userCooldowns) {
    userCooldowns = { maa: 0, abordagem: 0, acompanhamento: 0 }
    cooldowns.set(userId, userCooldowns)
  }
  const lastTime = userCooldowns[tipoCurso] || 0

  if (now - lastTime < COOLDOWN_MS) {
    const remainingMs = COOLDOWN_MS - (now - lastTime)
    const remainingMin = Math.ceil(remainingMs / 60000)
    return interaction.editReply({
      content: `Você só pode tentar realizar novamente o curso **${tipoCurso}** em ${remainingMin} minuto(s).`,
    })
  }

  // Verifica se já tem curso em andamento (qualquer curso)
  if (activeCourses.has(userId)) {
    return interaction.editReply({
      content:
        'Você já está em um curso em andamento. Termine ou aguarde antes de iniciar outro.',
    })
  }

  // Atualiza cooldown para ESTE tipo
  userCooldowns[tipoCurso] = now

  // Define dados do curso
  let nomeCurso = ''
  let cargoId = ''
  let perguntas
  let aulaLink = ''

  if (tipoCurso === 'maa') {
    nomeCurso = 'Maa'
    cargoId = CARGO_maa
    perguntas = getPerguntasmaa()
    aulaLink = config.cursoMAA.siteUrl
  } else if (tipoCurso === 'abordagem') {
    nomeCurso = 'Abordagem'
    cargoId = CARGO_ABORDAGEM
    perguntas = getPerguntasAbordagem()
    aulaLink = 'https://www.youtube.com/watch?v=xJuIv8uXKu0'
  } else {
    nomeCurso = 'Acompanhamento'
    cargoId = CARGO_ACOMPANHAMENTO
    perguntas = getPerguntasAcompanhamento()
    aulaLink = 'https://www.youtube.com/watch?v=6bZWVxVzwKk'
  }

  // Embaralha perguntas
  perguntas = shuffleArray(perguntas)

  // Cria sala na categoria SALA_CATEGORY_ID
  const channelName = `${tipoCurso}-${interaction.user.username}`.substring(
    0,
    90,
  )
  const quizChannel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: SALA_CATEGORY_ID,
    permissionOverwrites: [
      {
        id: interaction.guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: userId,
        deny: [PermissionFlagsBits.SendMessages], // Remove a permissão de enviar mensagens
        allow: [PermissionFlagsBits.ViewChannel], // Permite ver o canal
      },
    ],
  })

  await interaction.editReply({
    content: `Sala criada: <#${quizChannel.id}>. Você tem **20 minutos** para concluir o curso **${nomeCurso}**.`,
  })

  // Cria a sessão
  const sessionData = {
    tipoCurso,
    nomeCurso,
    cargoId,
    perguntas,
    indice: 0,
    acertos: 0,
    channelId: quizChannel.id,
    started: false,
    timer: null,
  }
  activeCourses.set(userId, sessionData)

  // Inicia o timer de 12 minutos IMEDIATAMENTE
  sessionData.timer = setTimeout(() => {
    reprovarPorTempo(interaction.guild, userId)
  }, TIME_LIMIT_MS)

  // Embed inicial
  const embed = new EmbedBuilder()
    .setTitle(`👨‍🏫 Curso de ${nomeCurso}`)
    .setDescription(
      'Clique no botão abaixo para **começar** a prova.\n' +
        'Se não quiser realizar, clique em **Encerrar**.\n\n' +
        '⏱ **O curso expira em 20 minutos a partir de agora.**\n\n' +
        '_**Atenção:** As perguntas e alternativas são embaralhadas. Leia atentamente para acertar._',
    )
    .setColor('#FFFFFF')
    .setFooter({ text: `${config.branding.footerText} - Cursos` })
    .setTimestamp()

  // Botão "Assistir aula" (Link)
  const aulaBtn = new ButtonBuilder()
    .setLabel('Material de estudo')
    .setStyle(ButtonStyle.Link)
    .setURL(aulaLink)

  // Botão "Começar"
  const startBtn = new ButtonBuilder()
    .setCustomId(`start_${userId}`)
    .setLabel('Começar')
    .setStyle(ButtonStyle.Secondary)

  // Botão "Encerrar"
  const closeBtn = new ButtonBuilder()
    .setCustomId(`close_${userId}`)
    .setLabel('Encerrar')
    .setStyle(ButtonStyle.Secondary)

  const row = new ActionRowBuilder().addComponents(aulaBtn, startBtn, closeBtn)
  await quizChannel.send({ embeds: [embed], components: [row] })
}

// ==================== CLIQUE EM "COMEÇAR" (só remove embed inicial) ====================
async function comecarPerguntas(interaction) {
  await interaction.deferUpdate()

  const userId = interaction.user.id
  const session = activeCourses.get(userId)
  if (!session) return

  if (session.started) {
    return interaction.followUp({
      content: 'Você já iniciou as perguntas.',
      flags: MessageFlags.Ephemeral,
    })
  }
  session.started = true

  // Apaga a mensagem do embed inicial
  await interaction.message.delete().catch(() => {})

  // Posta a primeira pergunta
  const channel = interaction.channel
  await postarPergunta(channel, userId)
}

// ==================== CLIQUE EM "ENCERRAR" ====================
async function encerrarSemProva(interaction) {
  await interaction.deferUpdate()
  const userId = interaction.user.id
  const session = activeCourses.get(userId)
  if (!session) return

  const channel = interaction.channel
  if (session.timer) clearTimeout(session.timer)
  activeCourses.delete(userId)
  channel.delete().catch(() => {})
}

// ==================== POSTA PERGUNTA ====================
async function postarPergunta(channel, userId) {
  const session = activeCourses.get(userId)
  if (!session) return

  const { indice, perguntas, nomeCurso } = session
  if (indice >= perguntas.length) {
    return finalizarCurso(channel.guild, userId)
  }

  // Pega a pergunta atual
  const perguntaObj = perguntas[indice]

  // Monta array de alternativas, com "alternativa1" = correta e as outras falsas
  let alts = [
    { texto: perguntaObj.alternativa1, correta: true },
    { texto: perguntaObj.alternativa2, correta: false },
    { texto: perguntaObj.alternativa3, correta: false },
    { texto: perguntaObj.alternativa4, correta: false },
  ]

  // Embaralha as alternativas
  alts = shuffleArray(alts)

  // Monta embed de pergunta
  const embed = new EmbedBuilder()
    .setTitle(`📝 Pergunta ${indice + 1} de ${perguntas.length}`)
    .setDescription(
      `**Curso de ${nomeCurso}**\n\n` +
        `**${perguntaObj.pergunta}**\n\n` +
        alts.map((alt, i) => `**${i + 1})** ${alt.texto}`).join('\n'),
    )
    .setColor('#FFFFFF')
    .setFooter({ text: `${config.branding.footerText} - Prova` })
    .setTimestamp()

  // Cria botões para cada alternativa
  const row = new ActionRowBuilder()
  alts.forEach((alt, i) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`resp_${userId}_${indice}_${i}`)
        .setLabel(String(i + 1))
        .setStyle(ButtonStyle.Secondary),
    )
  })

  // Envia
  await channel.send({ embeds: [embed], components: [row] })

  // Salva a array de alternativas embaralhada para sabermos qual é correta
  session.currentQuestion = { alts }
}

// ==================== CLIQUE EM RESPOSTA ====================
async function processarResposta(interaction) {
  const [, userId, strIndice, strOpcao] = interaction.customId.split('_')
  if (interaction.user.id !== userId) {
    return interaction.reply({
      content: 'Você não é o dono desta prova.',
      flags: MessageFlags.Ephemeral,
    })
  }

  await interaction.deferUpdate()
  const session = activeCourses.get(userId)
  if (!session) return

  const channel = interaction.channel
  await interaction.message.delete().catch(() => {})

  const indicePergunta = parseInt(strIndice, 10)
  const indiceOpcao = parseInt(strOpcao, 10)

  if (session.indice !== indicePergunta) return

  // Verifica se a escolhida é correta
  const alt = session.currentQuestion?.alts[indiceOpcao]
  if (alt?.correta) {
    session.acertos += 1
  }

  // Avança
  session.indice++
  if (session.indice >= session.perguntas.length) {
    return finalizarCurso(channel.guild, userId)
  }
  await postarPergunta(channel, userId)
}

// ==================== FINALIZA CURSO ====================
async function finalizarCurso(guild, userId) {
  const session = activeCourses.get(userId)
  if (!session) return
  if (session.timer) clearTimeout(session.timer)

  const { channelId, nomeCurso, cargoId, acertos, perguntas } = session
  const total = perguntas.length
  const aprovou = acertos >= 23

  // Aplica cargo se aprovado
  if (aprovou) {
    try {
      const member = await guild.members.fetch(userId)
      await member.roles.add(cargoId)
    } catch (err) {
      console.error('Erro ao adicionar cargo:', err)
    }
  }

  // ======= ENVIA LOG EXTRA NA OUTRA GUILD =======
  const extraGuild = guild.client.guilds.cache.get(EXTRA_GUILD_ID)
  const extraChannel = extraGuild?.channels.cache.get(EXTRA_LOG_CHANNEL_ID)
  if (extraChannel) {
    const extraEmbed = new EmbedBuilder()
      .setTitle(aprovou ? '🟢 APROVADO' : '🔴 REPROVADO')
      .setDescription(
        aprovou
          ? `**${guild.members.cache.get(userId)?.user.tag || userId}** aprovado no curso **${nomeCurso}** (${acertos}/${total}).`
          : `**${guild.members.cache.get(userId)?.user.tag || userId}** reprovado no curso **${nomeCurso}** (${acertos}/${total}).`,
      )
      .setColor(aprovou ? '#00FF00' : '#FF0000')
      .setTimestamp()

    extraChannel.send({ embeds: [extraEmbed] }).catch(() => {})
  }

  // Tenta DM
  try {
    const user = await guild.client.users.fetch(userId)
    const dmEmbed = new EmbedBuilder()
      .setColor(aprovou ? '#00FF00' : '#FF0000')
      .setTitle(
        aprovou ? `🟢 APROVADO: ${nomeCurso}` : `🔴 REPROVADO: ${nomeCurso}`,
      )
      .setDescription(
        aprovou
          ? `Parabéns! Você acertou **${acertos}** de **${total}**.\nRecebeu o cargo **${nomeCurso}**!`
          : `Você acertou **${acertos}** de **${total}** e foi reprovado.\nTente novamente depois!`,
      )
      .setTimestamp()
    await user.send({ embeds: [dmEmbed] })
  } catch (err) {
    console.error('Falha ao enviar DM final:', err)
  }

  activeCourses.delete(userId)
  const quizChannel = guild.channels.cache.get(channelId)
  if (quizChannel) quizChannel.delete().catch(() => {})
}

// ==================== REPROVAR POR TEMPO ====================
async function reprovarPorTempo(guild, userId) {
  const session = activeCourses.get(userId)
  if (!session) return
  if (session.timer) clearTimeout(session.timer)

  const { channelId, nomeCurso } = session
  // Log
  // ======= LOG EXTRA NA OUTRA GUILD =======
  const extraGuild = guild.client.guilds.cache.get(EXTRA_GUILD_ID)
  const extraChannel = extraGuild?.channels.cache.get(EXTRA_LOG_CHANNEL_ID)
  if (extraChannel) {
    const embedExtra = new EmbedBuilder()
      .setTitle('⏰ TEMPO EXPIRADO')
      .setDescription(
        `**${guild.members.cache.get(userId)?.user.tag || userId}** expirou tempo no curso **${nomeCurso}**.`,
      )
      .setColor('#FF0000')
      .setTimestamp()

    extraChannel.send({ embeds: [embedExtra] }).catch(() => {})
  }

  // DM
  try {
    const user = await guild.client.users.fetch(userId)
    const dmEmbed = new EmbedBuilder()
      .setTitle(`🔴 REPROVADO POR TEMPO - ${nomeCurso}`)
      .setDescription(
        'Você excedeu o limite de 20 minutos e foi reprovado automaticamente.',
      )
      .setColor('#FF0000')
      .setTimestamp()
    await user.send({ embeds: [dmEmbed] })
  } catch {}

  activeCourses.delete(userId)
  const quizChannel = guild.channels.cache.get(channelId)
  if (quizChannel) quizChannel.delete().catch(() => {})
}
// ==================== PERGUNTAS ====================

function getPerguntasAcompanhamento() {
  return [
    {
      pergunta: "Quando podemos ter um acompanhamento de 4 VTR's?",
      alternativa1:
        "Durante o código 3 de ocorrência, sendo alto risco o máximo seria 4 VTR's no acompanhamento.",
      alternativa2: 'Fuga de corrida ilegal...',
      alternativa3: 'Código 4...',
      alternativa4: 'Código 2...',
    },
    {
      pergunta:
        'Em uma situação de acompanhamento, quem tem prioridade na MODULAÇÃO?',
      alternativa1: 'A Garra',
      alternativa2: 'A C.O.E',
      alternativa3: 'O alto comando',
      alternativa4: 'Garra quando de Heli',
    },
    {
      pergunta:
        'Quais seriam as informações que não podem faltar em uma modulação?',
      alternativa1: 'QRU, Qtde indiv, Características, Qtde de oficiais.',
      alternativa2: 'Mandar rolar na rádio.',
      alternativa3: 'Só local e cor do carro.',
      alternativa4: 'Cor do sapato e nome do suspeito.',
    },
    {
      pergunta: 'Qual item a seguir NÃO é regra de rádio?',
      alternativa1: 'Só iniciar modulação se o indivíduo pedir reforço.',
      alternativa2: 'Verificar se canal está livre.',
      alternativa3: 'Não demonstrar descontrole.',
      alternativa4: 'Não usar linguagem obscena.',
    },
    {
      pergunta:
        'Você está em patrulhamento e aborda uma pessoa do sexo oposto, o que faz?',
      alternativa1: 'Chamar médico militar ou oficial do mesmo sexo.',
      alternativa2: 'Liberar a pessoa.',
      alternativa3: 'Chamar GARRA.',
      alternativa4: 'Revistar mesmo assim.',
    },
    {
      pergunta: 'O que é código 6?',
      alternativa1: 'Situação de equipe investigando a área.',
      alternativa2: 'Acompanhamento de alto risco.',
      alternativa3: 'Área limpa.',
      alternativa4: 'Cartão amarelo.',
    },
    {
      pergunta: 'Qual seria o nível 2 do uso progressivo da força?',
      alternativa1: 'Resolver pela verbalização.',
      alternativa2: 'Força letal.',
      alternativa3: 'Força não letal.',
      alternativa4: 'Controle de contato.',
    },
    {
      pergunta:
        'Durante um acompanhamento, com permissão de quem disparar no pneu?',
      alternativa1: 'Com permissão de um 3SGT+.',
      alternativa2: 'Maior patente na VTR.',
      alternativa3: 'High Command.',
      alternativa4: 'Quando eu quiser.',
    },
    {
      pergunta: 'Um policial homem pode revistar mulher quando?',
      alternativa1: 'Nunca, só se for médico militar.',
      alternativa2: 'Na presença de paramédica.',
      alternativa3: 'Na presença de outra mulher.',
      alternativa4: 'Na presença de advogado.',
    },
    {
      pergunta: 'Quando ler o direito de Miranda?',
      alternativa1: 'No momento exato da voz de prisão.',
      alternativa2: 'Depois na DP.',
      alternativa3: 'Quando dá fuga.',
      alternativa4: 'Ao colocar na DP.',
    },
  ]
}

function getPerguntasAbordagem() {
  return [
    {
      pergunta: 'Para que é usada a terceira sirene?',
      alternativa1: 'Para transporte de itens ou indivíduos',
      alternativa2: 'Para acompanhamentos no sul',
      alternativa3: 'Para abordagens',
      alternativa4: 'Para acompanhamentos no norte',
    },
    {
      pergunta: 'Dos itens abaixo, o que NÃO é uma ocultação facial?',
      alternativa1: 'Tatuagens pequenas que não cobrem o rosto',
      alternativa2: 'Capacete insufilmado',
      alternativa3: 'Tatuagem grande cobrindo rosto',
      alternativa4: 'Vidro insulfilm',
    },
    {
      pergunta: 'O que NUNCA fazer em abordagem de código 1?',
      alternativa1: 'Revistar a pessoa.',
      alternativa2: 'Falar o motivo da abordagem.',
      alternativa3: 'Checar documentos.',
      alternativa4: 'Agir calmo.',
    },
    {
      pergunta: 'O que NUNCA fazer em abordagem de código 3?',
      alternativa1: 'Checar só documentos.',
      alternativa2: 'Falar o motivo.',
      alternativa3: 'Revistar a pessoa.',
      alternativa4: 'Agir calmo.',
    },
    {
      pergunta:
        'Qual item abaixo NÃO é enquadrado no artigo 67 do código penal?',
      alternativa1: 'Peça de arma.',
      alternativa2: 'Cannabis',
      alternativa3: 'Folha de Coca',
      alternativa4: 'Maconha',
    },
    {
      pergunta: 'Qual item abaixo seria um motivo para efetuar a revista?',
      alternativa1: 'Uso de colete.',
      alternativa2: 'Destruição de patrimônio público.',
      alternativa3: 'Pequena colisão.',
      alternativa4: 'Alta velocidade.',
    },
    {
      pergunta: 'Quando usamos o Roadblock?',
      alternativa1: 'Nunca',
      alternativa2: '3SGT+ autoriza',
      alternativa3: 'Comando autoriza',
      alternativa4: 'De vez em quando',
    },
    {
      pergunta: 'Quando é permitido o uso do taser?',
      alternativa1: 'Depois da 3ª ordem legal de parada',
      alternativa2: 'Se ofender cidadãos',
      alternativa3: 'Se desacatar oficial',
      alternativa4: 'Se ofender policial',
    },
    {
      pergunta: 'Quando um indivíduo desobedece ordem policial, qual artigo?',
      alternativa1: '65',
      alternativa2: '69',
      alternativa3: '33',
      alternativa4: '63',
    },
    {
      pergunta: `Quais códigos de modulação a ${config.branding.shortName} usa?`,
      alternativa1: 'Código Q e MARÉ.',
      alternativa2: 'Código 10',
      alternativa3: 'Código Q, 10, 11-99 etc.',
      alternativa4: 'Código Q.',
    },
  ]
}

// == NOVAS Perguntas de MODULAÇÃO (conforme fornecido) ==
function getPerguntasmaa() {
  return [
    {
      pergunta:
        'Quem tem prioridade de modulação em uma situação de QRR MÁXIMO?',
      alternativa1: 'SOG',
      alternativa2: 'A VTR mais próxima',
      alternativa3: 'O oficial com patente mais alta',
      alternativa4: 'STE',
    },
    {
      pergunta:
        'Em caso de rádio congestionado, como o policial deve proceder antes de modular?',
      alternativa1: 'Aplicar QRX e aguardar canal livre',
      alternativa2: 'Interromper quem estiver falando',
      alternativa3: 'Modificar a frequência',
      alternativa4: 'Falar alto e rápido',
    },
    {
      pergunta: 'Quando lhe perguntam seu QRA, o que você deve responder?',
      alternativa1: 'Falo minha patente e nome',
      alternativa2: 'Não respondo nada, pois não sou obrigada a informar',
      alternativa3: 'Informo o lugar onde estou',
      alternativa4: 'Falo um apelido para facilitar a comunicação',
    },
    {
      pergunta: 'Qual das opções abaixo representa uma modulação incorreta?',
      alternativa1:
        '"Boa tarde, Central, aqui é a VTR do Marquinhos, tamo com um problema aqui"',
      alternativa2:
        '"QAP Central, VTR X, QRU de tráfico no QTH Y, solicitando QRR"',
      alternativa3:
        '"QAP Central, iniciando acompanhamento de código 3 em uma X7 no QTH do Comedy, alguma QSV para prestar apoio?"',
      alternativa4: '"QAP Central, VTR Alfa 01, QRU de furto, QTH Rua B"',
    },
    {
      pergunta:
        'Em uma situação de fogo aberto, com visualização clara de arma em mãos, qual o código de ocorrência correto a ser usado?',
      alternativa1: 'Código 5',
      alternativa2: 'Código 2',
      alternativa3: 'Código 4',
      alternativa4: 'Código 3',
    },
    {
      pergunta:
        'O que deve ser evitado segundo as regras da rádio para manter uma modulação correta?',
      alternativa1: 'Usar expressões informais como "lá", "aqui", "ali"',
      alternativa2: 'Usar linguagem formal demais',
      alternativa3: 'Falar pausadamente',
      alternativa4: 'Pedir repetição da mensagem',
    },
    {
      pergunta:
        'Em uma ocorrência com 3 viaturas e helicóptero presente, quem deve modular a situação final (Código 4)?',
      alternativa1: 'Helicóptero',
      alternativa2: 'A última viatura a chegar',
      alternativa3: 'A viatura que fez a prisão',
      alternativa4: 'A primária',
    },
    {
      pergunta:
        'Ao solicitar apoio via rádio para iniciar um acompanhamento, qual informação é essencial incluir na modulação?',
      alternativa1:
        'O código da ocorrência, o local (QTH) e o sentido do acompanhamento',
      alternativa2: 'Apenas o número da viatura solicitante',
      alternativa3: 'O horário da solicitação',
      alternativa4: 'Informar somente o local, sem o código da ocorrência',
    },
    {
      pergunta:
        'O que fazer se um indivíduo não puder ser levado por falta de espaço na viatura?',
      alternativa1: 'Solicitar uma viatura para conduzi-lo até a delegacia',
      alternativa2: 'Liberar o indivíduo sem registro',
      alternativa3: 'Informar no rádio para não registrar nada',
      alternativa4: 'Deixar o indivíduo no local',
    },
    {
      pergunta: 'Quando uma viatura estiver em QRL, o que isso indica?',
      alternativa1: 'Que está ocupada, não podendo atender outras chamadas',
      alternativa2: 'Que está pronta para nova ocorrência',
      alternativa3: 'Que está a caminho do batalhão',
      alternativa4: 'Que está em patrulhamento',
    },
    {
      pergunta:
        'Qual a forma correta de modulação para solicitar apoio imediato para iniciar um acompanhamento?',
      alternativa1:
        'QAP CENTRAL, VTR 02 iniciando acompanhamento de código 2 no QTH do Banco Central, sentido cassino.',
      alternativa2: 'Central, viatura pede reforço',
      alternativa3: 'Solicito apoio para ocorrência código 1',
      alternativa4: 'VTR 01 solicita ajuda para patrulhamento',
    },
    {
      pergunta:
        'A modulação "Cabo Arrascaeta liberando código 5 no pneu por PWG" está:',
      alternativa1:
        'Errada, pois o cabo não tem autorização para liberar código 5, apenas 3SGT+',
      alternativa2:
        'Correta, pois em situações de PWG a primária libera código 5.',
      alternativa3: 'Errada, porque PWG não permite liberar código 5.',
      alternativa4: 'Correta, pois qualquer um pode liberar no pneu por PWG.',
    },
    {
      pergunta:
        'Em um acompanhamento com duas VTRs e duas motos, quantas QSVs estão presentes?',
      alternativa1: '3',
      alternativa2: '1',
      alternativa3: '2',
      alternativa4: '4',
    },
    {
      pergunta:
        'Qual o código usado para monitoramento silencioso de área, investigação?',
      alternativa1: 'Código 6',
      alternativa2: 'Código 1',
      alternativa3: 'Código 2',
      alternativa4: 'Código 5',
    },
    {
      pergunta:
        'Quando a situação volta ao normal após um acompanhamento, qual código é ativado?',
      alternativa1: 'Código 4',
      alternativa2: 'Código 0',
      alternativa3: 'Código 3',
      alternativa4: 'Código 6',
    },
    {
      pergunta: 'Qual das situações abaixo justifica o uso da sirene 3?',
      alternativa1: 'Patrulha em área neutra',
      alternativa2: 'Abordagem de caminhão',
      alternativa3: 'Acompanhamento em fuga',
      alternativa4: 'Transporte de indivíduo detido',
    },
    {
      pergunta:
        'Uma guarnição com 3 policiais deve proceder da seguinte forma ao abordar um suspeito armado:',
      alternativa1: 'P2 e P3 desembarcam, P1 permanece no carro',
      alternativa2: 'Todos descem e avançam juntos',
      alternativa3: 'O P1 desce com P2 e P3 cobre',
      alternativa4: 'Apenas o P2 faz tudo sozinho',
    },
    {
      pergunta:
        'Qual das opções abaixo descreve corretamente a função do P3 em uma patrulha com 3 policiais?',
      alternativa1: 'Ajudar com GPS e perímetro',
      alternativa2: 'Comandar a VTR',
      alternativa3: 'Transportar presos na caçamba',
      alternativa4: 'Ficar de vigia com fuzil',
    },
    {
      pergunta:
        'Qual código representa uma área controlada após ação policial?',
      alternativa1: 'Código 4',
      alternativa2: 'Código 2',
      alternativa3: 'Código 3',
      alternativa4: 'Código 6',
    },
    {
      pergunta: 'Em um patrulhamento sem intercorrências, a sirene deve estar:',
      alternativa1: 'Desligada',
      alternativa2: 'Alternando entre 1 e 2',
      alternativa3: 'Na intensidade 1',
      alternativa4: 'Na intensidade 2',
    },
    {
      pergunta: 'Qual tipo de veículo não conta como QSV em uma ação?',
      alternativa1: 'Helicóptero',
      alternativa2: 'Carro',
      alternativa3: 'Caminhão blindado',
      alternativa4: 'Duas motos',
    },
    {
      pergunta:
        'Em uma situação de Código 3, quantas VTRs (QSVs) devem estar presentes para iniciar o acompanhamento?',
      alternativa1: '4 VTRs',
      alternativa2: '2 VTRs',
      alternativa3: '3 VTRs',
      alternativa4: 'Toda a guarnição',
    },
    {
      pergunta:
        'Qual subunidade tem prioridade em ações no norte da cidade, especialmente relacionadas ao tráfico?',
      alternativa1: 'C.R.A.S.H',
      alternativa2: 'S.T.E',
      alternativa3: 'S.O.G',
      alternativa4: 'C.O.R.E',
    },
    {
      pergunta: 'Em qual situação a viatura terciária pode dar QTA?',
      alternativa1: 'Quando um cidadão é atropelado durante o acompanhamento',
      alternativa2: 'Quando o suspeito para o carro e se rende',
      alternativa3: 'Quando a viatura secundária assume a modulação',
      alternativa4: 'Quando um carro com insulfilme passa',
    },
    {
      pergunta:
        'Durante uma patrulha em Código 2, o suspeito inicia disparos contra a VTR. A situação evolui para Código 5. A entrada de novas viaturas está:',
      alternativa1: 'Liberada para toda a guarnição, sem limite de QSVs',
      alternativa2: 'Limitada a 2 VTRs de apoio',
      alternativa3: 'Permitida com autorização de um 3sgt+',
      alternativa4: 'Restrita às VTRs já presentes na ocorrência',
    },
    {
      pergunta:
        'Em uma situação de Código 5, quantas viaturas podem integrar a ocorrência?',
      alternativa1: 'Sem limite de QSVs, toda a guarnição pode atuar',
      alternativa2: 'Apenas a Primária e Secundária',
      alternativa3: 'Máximo de 3 viaturas',
      alternativa4: 'Até 4, incluindo moto',
    },
    {
      pergunta: 'O que caracteriza uma abordagem com Código 2?',
      alternativa1: 'Tráfico de drogas e roubo a caixas eletrônicos',
      alternativa2: 'Patrulhamento normal',
      alternativa3: 'Quebra de lei de trânsito',
      alternativa4: 'Visualização de arma em mãos',
    },
    {
      pergunta:
        'Qual é a forma correta de informar o Direito de Miranda ao suspeito no momento da prisão?',
      alternativa1:
        'Você tem o direito de permanecer em silêncio. Tudo o que disser pode ser usado contra você no tribunal. Você tem o direito a um advogado e, se não puder pagar por um, um defensor será nomeado para você.',
      alternativa2: 'Você tem direito a um médico e pode sair quando quiser.',
      alternativa3:
        'Você está preso e deve falar tudo que sabe, pois isso pode ajudar na investigação.',
      alternativa4:
        'Você pode falar, mas não é obrigado a permanecer calado ou pedir um advogado.',
    },
  ]
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}
