const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dayjs = require('dayjs');
const duration = require('dayjs/plugin/duration');
dayjs.extend(duration);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('notificacao')
    .setDescription('Envia uma notificação de vencimento da mensalidade.')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Usuário a ser notificado')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('usuario');

    const vencimento = dayjs('2025-07-14T00:00:00');
    const agora = dayjs();
    const diffMs = vencimento.diff(agora);
    const diffHrs = Math.max(Math.floor(diffMs / (1000 * 60 * 60)), 0);

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('⚠️ Aviso de Vencimento')
      .setDescription(`Olá ${user},\n\nA **mensalidade do seu bot** vence em:\n\n📅 **14/07/2025 às 00:00**\n⏰ **Faltam aproximadamente ${diffHrs} horas**`)
      .addFields(
        { name: '🔔 Ação necessária', value: 'Entre em contato o quanto antes para regularizar o pagamento.' },
        { name: '🚫 Consequência', value: 'Caso contrário, o bot será **inativado automaticamente**.' }
      )
      .setFooter({ text: 'Notificações automáticas CX', iconURL: interaction.client.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.reply({ content: `${user}`, embeds: [embed] });
  }
};
