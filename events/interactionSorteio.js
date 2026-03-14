// events/interactionCreate.js
const { Events, EmbedBuilder, MessageFlags } = require('discord.js')
const { Sorteio, UserActions, UserPontos } = require('../database') // ajuste o caminho conforme sua estrutura
const config = require('../config')

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    if (!interaction.isButton()) return

    const [action, raffleId] = interaction.customId.split('_')
    if (action !== 'sortear') return

    // Verificar se o usuário possui permissão de administrador
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({
        content: 'Apenas administradores podem sortear.',
        flags: MessageFlags.Ephemeral,
      })
    }

    // Buscar o sorteio no banco de dados
    const sorteio = await Sorteio.findOne({ where: { raffleId } })
    if (!sorteio) {
      return interaction.reply({
        content: 'Sorteio não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }
    if (sorteio.isDrawn) {
      return interaction.reply({
        content: 'O sorteio já foi realizado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    // Buscar o canal e a mensagem do sorteio
    const channel = await interaction.client.channels.fetch(sorteio.channelId)
    if (!channel) {
      return interaction.reply({
        content: 'Canal não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }
    let message
    try {
      message = await channel.messages.fetch(sorteio.messageId)
    } catch (error) {
      return interaction.reply({
        content: 'Mensagem do sorteio não encontrada.',
        flags: MessageFlags.Ephemeral,
      })
    }

    // Obter a reação 🎉 da mensagem e coletar os participantes (excluindo bots)
    const reaction = message.reactions.cache.get('🎉')
    if (!reaction) {
      return interaction.reply({
        content: 'Nenhuma reação encontrada para o sorteio.',
        flags: MessageFlags.Ephemeral,
      })
    }
    const users = await reaction.users.fetch()
    const participants = users.filter(user => !user.bot).map(user => user.id)

    // Verificar se há participantes suficientes
    if (participants.length < sorteio.winnersCount) {
      return interaction.reply({
        content: 'Número insuficiente de participantes para sortear.',
        flags: MessageFlags.Ephemeral,
      })
    }

    // Embaralhar a lista e selecionar os ganhadores
    const shuffled = participants.sort(() => 0.5 - Math.random())
    const winners = shuffled.slice(0, sorteio.winnersCount)

    // Atualizar o banco de dados para cada ganhador: adicionar pontos, registrar ação e enviar DM
    for (const winner of winners) {
      // Atualizar ou criar registro no UserPontos (ponto total do usuário)
      let userPontos = await UserPontos.findOne({ where: { userId: winner } })
      if (!userPontos) {
        userPontos = await UserPontos.create({
          userId: winner,
          pontos: sorteio.points,
        })
      } else {
        await userPontos.update({ pontos: userPontos.pontos + sorteio.points })
      }

      // Registrar a ação no UserActions (auditoria)
      await UserActions.create({
        userId: winner,
        id_tipo: '${sorteio.name}',
        nome_tipo: 'Sorteio',
        pontos: sorteio.points,
        multiplicador: 1, // Altere se necessário
        pontosRecebidos: sorteio.points,
      })

      // Tentar enviar DM para o ganhador com um embed informativo
      try {
        const userObj = await interaction.client.users.fetch(winner)
        const dmEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('🎉 Parabéns, você ganhou!')
          .setDescription(
            `Você ganhou o sorteio **${sorteio.name}** e recebeu **${sorteio.points}** pontos!`,
          )
          .setTimestamp()
          .setFooter({ text: `${config.branding.footerText} - Corregedoria` })
        await userObj.send({ embeds: [dmEmbed] })
      } catch (error) {
        console.error(
          `Não foi possível enviar DM para o usuário ${winner}: ${error}`,
        )
      }
    }

    // Criar embed final com os ganhadores e os pontos do sorteio
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`🎉 Resultado do Sorteio: ${sorteio.name}`)
      .setDescription('Confira abaixo os vencedores do sorteio:')
      .addFields(
        {
          name: '🏆 Ganhadores',
          value: winners.map(id => `<@${id}>`).join('\n') || 'Nenhum vencedor',
          inline: false,
        },
        { name: '💎 Pontos', value: `${sorteio.points}`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: config.branding.footerText })

    // Marcar o sorteio como realizado no banco
    await sorteio.update({ isDrawn: true })

    // Atualizar a mensagem: remover os botões e exibir o embed final
    await message.edit({ embeds: [embed], components: [] })

    // Responder à interação de forma efêmera
    await interaction.reply({
      content: 'Sorteio realizado com sucesso!',
      flags: MessageFlags.Ephemeral,
    })
  },
}
