const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js')
const config = require('../config')

const lojaItens = [
  { nome: 'Descalço 1 dia', valor: 200 },
  { nome: 'Pular estágio Polícia', valor: 200 },
  { nome: '-3 dias promoção', valor: 300 },
  { nome: 'Black para Unidade', valor: 300 },
  { nome: 'Coturno Branco 1 semana', valor: 300 },
  { nome: 'Heli 1 semana', valor: 300 },
  { nome: '-5 dias promoção', valor: 400 },
  { nome: 'GTM 1 semana', valor: 500 },
  { nome: 'Pular estágio Unidade', valor: 500 },
  { nome: '-10 dias promoção', valor: 700 },
  { nome: 'Remover ADV', valor: 1000 },
  { nome: '-15 dias promoção (Premium)', valor: 1000 },
]

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setuploja')
    .setDescription('Configura o embed da Loja do Kennedy no canal.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const channel = interaction.guild.channels.cache.get(config.channels.loja)
    if (!channel) {
      return interaction.reply({
        content: '❌ Canal da loja não encontrado.',
        flags: MessageFlags.Ephemeral,
      })
    }

    const embed = new EmbedBuilder()
      .setTitle(`Biqueira do pecinha`)
      .setDescription(
        `**Bem-vindo ao beco do mano peça**\n\n` +
        `Aqui você pode trocar suas **Pontos** por itens exclusivos e raros, cuidadosamente selecionados para você.\n\n` +
        `**Detalhes da Loja:**\n\n` +
        `  • 🔒 **Itens Exclusivos:** Somente adquiríveis com Pontos.\n\n` +
        `  • ⚙️ **Uso Automático:** A maioria dos itens é ativada automaticamente, mas alguns precisam ser avisados manualmente no momento da promoção.\n\n` +
        `  • 💡 **Dica:** Confira sempre as descrições para aproveitar ao máximo suas compras!`,
      )
      .setColor(config.branding.color)
      .setImage(config.branding.bannerUrl)
      .setFooter({
        text: `Loja Donater - ${config.branding.footerText}`,
        iconURL: interaction.client.user.displayAvatarURL(),
      })

    // Botões: Ver Pontos, Histórico de Compras, Transferir Pontos
    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ver_pontos')
        .setLabel('Ver Pontos')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('historico_compras')
        .setLabel('Histórico de Compras')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('transferir_pontos')
        .setLabel('Transferir Pontos')
        .setStyle(ButtonStyle.Secondary),
    )

    // Menu de seleção de itens
    const options = lojaItens.map((item, index) => {
      const label = item.nome.length > 45 ? item.nome.slice(0, 42) + '...' : item.nome
      return {
        label: label,
        value: String(index),
        description: `Preço: ${item.valor} pts`,
      }
    })

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_loja_items')
        .setPlaceholder('Selecione os itens que deseja comprar')
        .setMinValues(1)
        .setMaxValues(options.length)
        .addOptions(options),
    )

    await channel.send({ embeds: [embed], components: [buttonsRow, selectRow] })

    await interaction.reply({
      content: `✅ Embed da Loja criado no canal <#${config.channels.loja}>!`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
