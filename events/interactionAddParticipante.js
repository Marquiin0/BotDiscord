const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { PrisonReports, UserPontos, UserActions } = require('../database.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Botão: Adicionar Participante
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('add_participant_')
    ) {
      if (interaction.deferred || interaction.replied) return;

      // customId = add_participant_{reportId}_{memberId}
      const parts = interaction.customId.split('_');
      const reportId = parts[2];

      const report = await PrisonReports.findByPk(reportId);
      if (!report) {
        return interaction.reply({ content: '⚠️ Relatório não encontrado.', ephemeral: true });
      }

      if (interaction.user.id !== report.commanderId) {
        return interaction.reply({ content: '❌ Apenas o oficial responsável pode adicionar participantes.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_addpart_${reportId}`)
        .setTitle('Adicionar Participante')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('participant_id')
              .setLabel('ID do Participante (Discord)')
              .setPlaceholder('Ex: 123456789012345678')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    // Modal Submit: Adicionar Participante
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('modal_addpart_')
    ) {
      if (interaction.deferred || interaction.replied) return;

      try {
        await interaction.deferReply({ ephemeral: true });

        // customId = modal_addpart_{reportId}
        const reportId = interaction.customId.split('_')[2];
        const inputId = interaction.fields.getTextInputValue('participant_id').trim()
          .replace(/[<@!>]/g, '');

        // Buscar membro no servidor
        const member = await interaction.guild.members.fetch(inputId).catch(() => null);
        if (!member) {
          return interaction.editReply({ content: `⚠️ Nenhum membro encontrado com o ID "${inputId}". Verifique se o ID está correto.` });
        }

        const participantId = member.id;
        const report = await PrisonReports.findByPk(reportId);

        if (!report) {
          return interaction.editReply({ content: '⚠️ Relatório não encontrado.' });
        }

        if (interaction.user.id !== report.commanderId) {
          return interaction.editReply({ content: '❌ Apenas o oficial responsável pode adicionar participantes.' });
        }

        // Filtrar strings vazias para evitar problemas
        const participantes = report.participants
          ? report.participants.split(',').filter(id => id.length > 0)
          : [];

        if (participantes.includes(participantId)) {
          return interaction.editReply({ content: '⚠️ Este participante já foi adicionado.' });
        }

        participantes.push(participantId);
        await report.update({ participants: participantes.join(',') });

        // Pontuação
        const pontosBase = 10;
        const boost = report.boostMultiplier || 1;
        const pontos = Math.floor((pontosBase * boost) / 2);

        const [userPontos] = await UserPontos.findOrCreate({
          where: { userId: participantId },
          defaults: { pontos: 0 },
        });

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

        // Atualizar embed — buscar a mensagem pelo messageId no mesmo canal
        if (report.messageId) {
          const msg = await interaction.channel.messages.fetch(report.messageId).catch(() => null);
          if (msg && msg.embeds.length > 0) {
            const updatedEmbed = EmbedBuilder.from(msg.embeds[0]);
            updatedEmbed.data.fields = updatedEmbed.data.fields.map(f =>
              f.name === '👥 Participantes'
                ? { ...f, value: participantes.map(id => `<@${id}>`).join(', ') }
                : f
            );
            await msg.edit({ embeds: [updatedEmbed], components: msg.components });
          }
        }

        return interaction.editReply({ content: `✅ Participante <@${participantId}> adicionado com sucesso! (+${pontos} pontos)` });
      } catch (error) {
        console.error('Erro ao adicionar participante:', error);
        if (interaction.deferred) {
          return interaction.editReply({ content: '❌ Ocorreu um erro ao adicionar o participante.' }).catch(() => {});
        }
      }
    }
  },
};
