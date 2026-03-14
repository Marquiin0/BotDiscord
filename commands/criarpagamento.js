const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js')
const { MessageFlags } = require('discord.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('criarpagamento')
    .setDescription(
      'Cria um pagamento com Mercado Pago para produtos de R$10,00, R$20,00 ou R$50,00',
    ),
  async execute(interaction) {
    // Define as opções de produto com os emojis correspondentes
    const options = [
      { label: '🔸 Donater 100 - R$5,00', value: '5' },
      { label: '🔹 Donater 300 - R$10,00', value: '10' },
      { label: '🔺 Donater 1000 - R$30,00', value: '30' },
      { label: '▪️ Donater 2000 - R$50,00', value: '50' },
      { label: '▫️ Donater 5000 - R$100,00', value: '100' },
    ]

    // Cria o menu de seleção
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_pagamento_produto')
      .setPlaceholder('Selecione o produto para pagamento')
      .addOptions(options)

    const row = new ActionRowBuilder().addComponents(selectMenu)

    // Cria o embed com informações detalhadas e imagem
    const embed = new EmbedBuilder()
      .setTitle('💰 Doação para Recebimento de Pontos')
      .setDescription(
        'Contribua com sua doação e ajude na melhoria da polícia!\n\n' +
          '**Detalhes das Doações:**\n' +
          '🔸 **R$5,00** - Ganhe **100 pontos**\n' +
          '🔹 **R$10,00** - Ganhe **300 pontos**\n' +
          '🔺 **R$30,00** - Ganhe **1000 pontos**\n' +
          '▪️ **R$50,00** - Ganhe **2000 pontos**\n' +
          '▫️ **R$100,00** - Ganhe **5000 pontos**',
      )
      .setColor('#FFFFFF')
      .setFooter({
        text: 'Caso ocorra qualquer problema durante o pagamento, abra um ticket 🛠️',
      })
      .setImage(
        'https://media.discordapp.net/attachments/1333590155331633225/1356770693458559167/GIF_-_3°BPM_Banner.gif?ex=67fa4cec&is=67f8fb6c&hm=b0873789a26d5bab4ee96ad7c64e1b0f23ded446c8de8f7d360b96fa5f9af43c&=',
      )

    // Responde de forma efêmera que o embed foi criado
    await interaction.reply({
      content: 'Embed criado com sucesso!',
      flags: MessageFlags.Ephemeral,
    })
    // Envia o embed com o menu de seleção como mensagem pública no canal onde o comando foi executado
    await interaction.channel.send({ embeds: [embed], components: [row] })
  },
}
