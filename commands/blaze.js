const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
} = require('discord.js');

// CONFIGURAÇÕES BÁSICAS
const TEMPO_APOSTA = 20;         // Segundos para a fase de apostas
const TEMPO_GIRANDO = 5;         // Segundos para a fase girando
const TEMPO_POS_RESULTADO = 3;   // Segundos antes de recomeçar
const MAX_HISTORICO = 10;        // Zera o histórico ao chegar em 10

const PONTOS_CHANNEL_ID = '1349965247993348130'; // Canal para "!remover-pontos" e "!adicionar-pontos"

// Configuração das cores e probabilidades
const CORES = {
  PRETO: {
    nome: 'Preto',
    vezes: 18,
    multiplicador: 2,
    imageUrl: 'https://i.imgur.com/Ool65pw.png',
    corEmbed: '#2f3136', 
  },
  VERMELHO: {
    nome: 'Vermelho',
    vezes: 18,
    multiplicador: 2,
    imageUrl: 'https://i.imgur.com/vogPywa.png',
    corEmbed: '#f54242',
  },
  BRANCO: {
    nome: 'Branco',
    vezes: 2,
    multiplicador: 14,
    imageUrl: 'https://i.imgur.com/WCtrrQ9.png',
    corEmbed: '#ffffff',
  },
};

// Monta a roleta
const roleta = [];
Object.keys(CORES).forEach((c) => {
  for (let i = 0; i < CORES[c].vezes; i++) {
    roleta.push(CORES[c]);
  }
});

// Emojis para cada cor
function getEmoji(cor) {
  switch (cor) {
    case 'Preto':    return '⚫';
    case 'Vermelho': return '🔴';
    case 'Branco':   return '⚪';
    default:         return '❓';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setblaze')
    .setDescription('Inicia o jogo Blaze (preto/vermelho/branco)'),

  async execute(interaction) {
    // Checa se é servidor
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando só pode ser usado em um servidor.',
        ephemeral: true,
      });
    }

    const client = interaction.client;

    // Se não existir, cria. Se existir, reset.
    if (!client.blazeData) {
      client.blazeData = {
        faseApostaAberta: false,
        tempoRestante: 0,
        apostasAtuais: {}, // userId -> { corEscolhida, valor, confirmada: bool }
        historico: [],
        mensagemPrincipal: null,
      };
    } else {
      client.blazeData.faseApostaAberta = false;
      client.blazeData.tempoRestante = 0;
      client.blazeData.apostasAtuais = {};
      client.blazeData.historico = [];
      client.blazeData.mensagemPrincipal = null;
    }

    // Helper principal para criar embed
    // - "useThumbnail": boolean para indicar se exibimos ou não a thumbnail
    function criarEmbed(titulo, descricao, corHex = '#2f3136', useThumbnail = true) {
      let txtHistorico = 'Nenhum resultado ainda.';
      if (client.blazeData.historico.length > 0) {
        txtHistorico = client.blazeData.historico
          .map((r) => getEmoji(r.nome))
          .join('  |  ');
      }

      const embed = new EmbedBuilder()
        .setTitle(titulo)
        .setDescription(descricao)
        .setColor(corHex)
        .addFields({ name: 'Histórico de Resultados', value: txtHistorico });

      // Se quisermos thumbnail, exibe
      if (useThumbnail) {
        embed.setThumbnail('https://i.imgur.com/kEkpEVo.png');
      }

      return embed;
    }

    function esperar(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Botões
    const botoesAposta = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('apostar_preto')
        .setLabel('⚫')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('apostar_vermelho')
        .setLabel('🔴')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('apostar_branco')
        .setLabel('⚪')
        .setStyle(ButtonStyle.Secondary)
    );

    // ======= FASES =======

    /**
     * Fase de apostas (20s):
     * - cor amarela
     * - thumbnail
     * - diz "Só é possível apostar até 5 segundos"
     * - emojis no texto
     */
    async function faseApostas() {
      client.blazeData.faseApostaAberta = true;
      client.blazeData.tempoRestante = TEMPO_APOSTA;
      client.blazeData.apostasAtuais = {};

      while (client.blazeData.tempoRestante > 0) {
        await atualizarEmbedApostas();
        await esperar(1000);
        client.blazeData.tempoRestante--;
      }

      // Tempo acabou
      client.blazeData.faseApostaAberta = false;
      await atualizarEmbedApostas(); // última atualização
    }

    // Monta embed "Apostas Abertas"
    async function atualizarEmbedApostas() {
      const seg = client.blazeData.tempoRestante;
      // Título com emoji e cor amarela
      const titulo = `🕛 Blaze – Apostas Abertas!`;
      const descricao = `
**Você tem ${seg}s para apostar!**  

⚠️ **Só é possível apostar até 5 segundos!**  
💬 *(Faça suas apostas com responsabilidade!)*  
      `;

      // cor amarela: #FFFF00
      const embed = criarEmbed(titulo, descricao, '#FFFF00', true);

      await client.blazeData.mensagemPrincipal.edit({
        embeds: [embed],
        components: seg > 0 ? [botoesAposta] : [],
      });
    }

    /**
     * Fase Girando (5s):
     * - cor cinza
     * - exibe thumbnail
     */
    async function faseGirando() {
      client.blazeData.faseApostaAberta = false;
      client.blazeData.tempoRestante = 0;

      const titulo = '🎡 Blaze – Girando...';
      const descricao = `A roleta está girando! Aguarde **${TEMPO_GIRANDO}s**...  
*(Em instantes saberemos o resultado!)*`;

      // cor cinza (por ex. #2f3136)
      const embed = criarEmbed(titulo, descricao, '#2f3136', true);
      // Exemplo de GIF
      embed.setImage('https://i.imgur.com/LVEb9ls.gif');

      await client.blazeData.mensagemPrincipal.edit({
        embeds: [embed],
        components: [],
      });

      await esperar(TEMPO_GIRANDO * 1000);
    }

    /**
     * Fase Resultado (3s):
     * - cor da roleta
     * - sem thumbnail
     * - exibe "ganhador" e "perdedor"
     */
    async function faseResultado() {
      // Sorteia a cor
      const resultado = roleta[Math.floor(Math.random() * roleta.length)];

      // Atualiza histórico
      client.blazeData.historico.push(resultado);
      if (client.blazeData.historico.length >= MAX_HISTORICO) {
        // Zera se chegar a 10
        client.blazeData.historico = [];
      }

      let resumo = `**Resultado**: ${getEmoji(resultado.nome)} **${resultado.nome}**!\n\n`;
      const apostas = client.blazeData.apostasAtuais;

      if (Object.keys(apostas).length === 0) {
        resumo += 'Ninguém apostou nesta rodada.';
      } else {
        for (const userId in apostas) {
          const aposta = apostas[userId];
          if (!aposta.confirmada) continue;

          if (aposta.corEscolhida === resultado.nome) {
            const mult = CORES[resultado.nome.toUpperCase()].multiplicador;
            const ganho = aposta.valor * mult;
            resumo += `✅ <@${userId}> **GANHOU** apostando ${aposta.valor} → Lucro: ${ganho}\n`;

            // "!adicionar-pontos"
            const canal = interaction.guild.channels.cache.get(PONTOS_CHANNEL_ID);
            if (canal) {
              canal.send(`!adicionar-pontos <@${userId}> (${ganho})`);
            }
          } else {
            resumo += `❌ <@${userId}> **PERDEU** a aposta de ${aposta.valor}\n`;
          }
        }
      }

      // Cor do resultado
      const corResultado = CORES[resultado.nome.toUpperCase()].corEmbed;
      const embed = criarEmbed('🏆 Blaze – Resultado da Rodada', resumo, corResultado, false);
      // remove thumbnail => passamos "false"
      // e definimos setImage
      embed.setImage(CORES[resultado.nome.toUpperCase()].imageUrl);

      await client.blazeData.mensagemPrincipal.edit({
        embeds: [embed],
        components: [],
      });

      // Limpa apostas
      client.blazeData.apostasAtuais = {};

      await esperar(TEMPO_POS_RESULTADO * 1000);
    }

    async function loopRodadas() {
      while (true) {
        await faseApostas();
        await faseGirando();
        await faseResultado();
      }
    }

    // ============= INÍCIO /setblaze =============

    // 1) Retorna mensagem ephemeral para o usuário
    await interaction.reply({
      content: 'O embed da Blaze foi enviado no canal!',
      ephemeral: true,
    });

    // 2) Envia o embed inicial no canal (visível para todos)
    //    – se quiser mandar em outro canal fixo, você pode trocar interaction.channel
    const embedInicial = criarEmbed(
      'Blaze – Preparando...',
      'Bem-vindo ao Blaze! Aguardando a primeira rodada...',
      '#2f3136', 
      true
    );

    const msg = await interaction.channel.send({
      embeds: [embedInicial],
    });

    // Armazena essa mensagem
    client.blazeData.mensagemPrincipal = msg;

    // Coletor para os botões de aposta
    const collector = msg.createMessageComponentCollector();
    collector.on('collect', async (i) => {
      if (!i.isButton()) return;

      // Se acabou a fase
      if (!client.blazeData.faseApostaAberta || client.blazeData.tempoRestante <= 0) {
        return i.reply({ content: 'As apostas estão encerradas!', ephemeral: true });
      }
      // Se tempo < 5 => não abre modal
      if (client.blazeData.tempoRestante < 5) {
        return i.reply({
          content: 'Faltam menos de 5s! Não é mais possível abrir aposta.',
          ephemeral: true,
        });
      }

      let corEscolhida = null;
      if (i.customId === 'apostar_preto')    corEscolhida = 'Preto';
      else if (i.customId === 'apostar_vermelho') corEscolhida = 'Vermelho';
      else if (i.customId === 'apostar_branco')   corEscolhida = 'Branco';
      if (!corEscolhida) return;

      // Cria modal
      const modal = new ModalBuilder()
        .setCustomId(`modal_aposta_${corEscolhida}`)
        .setTitle(`Apostar em ${corEscolhida}`);

      const input = new TextInputBuilder()
        .setCustomId('valorAposta')
        .setLabel('Quantos pontos deseja apostar?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      await i.showModal(modal);
    });

    // 3) Inicia o loop
    loopRodadas().catch((err) => {
      console.error('Erro no loop de rodadas:', err);
    });
  },
};
