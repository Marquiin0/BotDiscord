const { Events } = require('discord.js');

/*******************************************************
 * interactionBlaze.js
 * 
 * (1) Recusa o "envio" do modal se tempoRestante < 5
 * (2) Se >= 5, posta "!remover-pontos" e aceita reações
 *     até o tempo chegar em 0 ou a fase acabar.
 *******************************************************/
module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith('modal_aposta_')) return;

    const client = interaction.client;
    if (!client.blazeData) {
      return interaction.reply({
        content: 'O jogo Blaze não está configurado no momento.',
        ephemeral: true,
      });
    }

    // Se a fase acabou
    if (!client.blazeData.faseApostaAberta || client.blazeData.tempoRestante <= 0) {
      return interaction.reply({
        content: 'As apostas já foram encerradas!',
        ephemeral: true,
      });
    }

    // Se faltam < 5s => recusa o envio do modal
    if (client.blazeData.tempoRestante < 5) {
      return interaction.reply({
        content: 'Faltam menos de 5s para terminar a fase, não é mais possível efetivar a aposta.',
        ephemeral: true,
      });
    }

    // Agora sim, podemos prosseguir
    await interaction.reply({
      content: 'Aguardando validação de pontos...',
      ephemeral: true,
    });

    const corApostada = interaction.customId.replace('modal_aposta_', '');
    const valorApostado = interaction.fields.getTextInputValue('valorAposta') || '0';
    const valor = Number(valorApostado);

    const channelId = '1349965247993348130';
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) {
      return interaction.editReply({
        content: 'Canal de pontos não encontrado. Aposta não efetivada.',
      });
    }

    // Envia "!remover-pontos"
    const removeMsg = await channel.send(`!remover-pontos <@${interaction.user.id}> (${valor})`);

    let apostaConfirmada = false;

    const filter = (reaction, user) => {
      if (user.bot) return false;
      if (reaction.message.id !== removeMsg.id) return false;
      return (reaction.emoji.name === '✅' || reaction.emoji.name === '❌');
    };

    // Tempo do collector => tempoRestante * 1000
    const duracao = client.blazeData.tempoRestante * 1000;
    const collector = removeMsg.createReactionCollector({ filter, time: duracao });

    // Checamos se a fase acabou
    const intervalCheck = setInterval(() => {
      if (!client.blazeData.faseApostaAberta || client.blazeData.tempoRestante <= 0) {
        collector.stop('faseEncerrada');
      }
    }, 1000);

    collector.on('collect', (reaction) => {
      if (reaction.emoji.name === '✅') {
        apostaConfirmada = true;
        collector.stop('confirm');
      } else if (reaction.emoji.name === '❌') {
        apostaConfirmada = false;
        collector.stop('negado');
      }
    });

    collector.on('end', async (collected, reason) => {
      clearInterval(intervalCheck);

      if (reason === 'time') {
        // tempo esgotou
        await interaction.editReply({
          content: 'Tempo esgotado, aposta não efetivada.',
        });
        return;
      }
      if (reason === 'faseEncerrada') {
        await interaction.editReply({
          content: 'A fase de apostas encerrou antes da confirmação.',
        });
        return;
      }
      if (apostaConfirmada) {
        // Marca como confirmada
        client.blazeData.apostasAtuais[interaction.user.id] = {
          corEscolhida: corApostada,
          valor,
          confirmada: true,
        };
        await interaction.editReply({
          content: `Aposta confirmada: **${valor}** em **${corApostada}**!`,
        });
      } else {
        // ❌
        await interaction.editReply({
          content: 'A aposta foi negada!',
        });
      }
    });
  },
};
