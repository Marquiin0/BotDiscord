const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { PrisonReports, UserPontos, UserActions, MemberID  } = require('../database.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    // Botão: Adicionar Participante
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('add_participant_')
    ) {
      const reportId = interaction.customId.split('_')[2];
      const report = await PrisonReports.findByPk(reportId);

      if (!report) {
        return interaction.reply({ content: '⚠️ Relatório não encontrado.', ephemeral: true });
      }

      // Verificação de permissão: apenas o oficial pode adicionar
      if (interaction.user.id !== report.commanderId) {
        return interaction.reply({ content: '❌ Apenas o oficial responsável pode adicionar participantes.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_add_participant_${reportId}`)
        .setTitle('Adicionar Participante')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('participant_id')
              .setLabel('ID do Participante (FiveM)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    // Modal Submit: Adicionar Participante
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('modal_add_participant_')
    ) {
      await interaction.deferReply({ ephemeral: true });

      const reportId = interaction.customId.split('_')[3];
const inputId = interaction.fields.getTextInputValue('participant_id').trim();
const userRecord = await MemberID.findOne({ where: { discordId: inputId } });

if (!userRecord) {
  return interaction.editReply({ content: `⚠️ Nenhum membro encontrado com o ID "${inputId}".` });
}

const participantId = userRecord.memberId;      const report = await PrisonReports.findByPk(reportId);

      if (!report) {
        return interaction.editReply({ content: '⚠️ Relatório não encontrado.' });
      }

      // Verificação novamente por segurança
      if (interaction.user.id !== report.commanderId) {
        return interaction.editReply({ content: '❌ Apenas o oficial responsável pode adicionar participantes.' });
      }

      const participantes = report.participants ? report.participants.split(',') : [];

      if (participantes.includes(participantId)) {
        return interaction.editReply({ content: '⚠️ Este participante já foi adicionado.' });
      }

      participantes.push(participantId);
      await report.update({ participants: participantes.join(',') });

      // Pontuação fixa com boost aplicado
      const pontosBase = 10;
      const boost = report.boostMultiplier || 1;
      const pontos = Math.floor((pontosBase * boost) / 2);

      const userPontos = await UserPontos.findOrCreate({
        where: { userId: participantId },
        defaults: { pontos: 0 },
      }).then(([record]) => record);

      userPontos.pontos += pontos;
      await userPontos.save();

      await UserActions.create({
        userId: participantId,
        id_tipo: 'participante_prisao',
        nome_tipo: 'Participante em Relatório de Prisão',
        pontos,
        multiplicador: 1,
        pontosRecebidos: pontos,
      });

      // Atualizar embed
      const canal = interaction.guild.channels.cache.get('1333590159895166987');
      const msg = await canal.messages.fetch(report.messageId).catch(() => null);
      if (msg) {
        const updatedEmbed = EmbedBuilder.from(msg.embeds[0]);
        updatedEmbed.data.fields = updatedEmbed.data.fields.map(f =>
          f.name === '👥 Participantes'
            ? { ...f, value: participantes.map(id => `<@${id}>`).join(', ') }
            : f
        );
        await msg.edit({ embeds: [updatedEmbed] });
      }

      return interaction.editReply({ content: '✅ Participante adicionado com sucesso!' });
    }
  },
};
