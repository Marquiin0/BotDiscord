/**
 * interactionCreateAcao.js
 * Relatórios de Ação – agora sem referência a reportDate no UPDATE
 */

const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const moment = require('moment-timezone');
const { Op } = require('sequelize');

const {
  ActionReports,
  ActionReportsAll,
  Loja,
  UserPontos,
  UserActions,
  UserMultiplicadores,
} = require('../database.js');
const actionTypes = require('../utils/actionTypes.json');

const activeReports = new Map();

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return
    /* ───────────────── 1) botão relatorio_acao → modal ───────────────── */
    if (interaction.isButton() && interaction.customId === 'relatorio_acao') {
      const commanderId = interaction.user.id;
      if (activeReports.has(commanderId)) {
        return interaction.reply({
          content: '⚠️ Você já tem um relatório de ação aberto.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_relatorio_acao')
        .setTitle('📋 Criar Relatório de Ação')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('nome_acao')
              .setLabel('Nome da ação')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('horario_acao')
              .setLabel('Horário da ação')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('oponente_acao')
              .setLabel('Contra quem é a ação?')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        );

      return interaction.showModal(modal);
    }

    /* ───────────────── 2) modal submetido ───────────────── */
    if (interaction.isModalSubmit() && interaction.customId === 'modal_relatorio_acao') {
      await interaction.deferReply({ ephemeral: true });

      const commanderId   = interaction.user.id;
      const commanderName = interaction.member.displayName;
      const nomeAcao      = interaction.fields.getTextInputValue('nome_acao');
      const horarioAcao   = interaction.fields.getTextInputValue('horario_acao');
      const oponenteAcao  = interaction.fields.getTextInputValue('oponente_acao');

      const channel = await interaction.guild.channels.create({
        name: `rel-acao-${nomeAcao}`,
        parent: config.categories.acoes,
        type: 0,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny : [PermissionsBitField.Flags.SendMessages],
            allow: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: commanderId,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.AttachFiles,
            ],
          },
        ],
      });

      activeReports.set(commanderId, channel.id);

      const fecharButton = new ButtonBuilder()
        .setCustomId(`fechar_relatorio_${commanderId}`)
        .setLabel('❌ Fechar Relatório')
        .setStyle(ButtonStyle.Danger);

      await channel.send({
        content: '**🔴 Gerenciamento do Relatório**',
        components: [new ActionRowBuilder().addComponents(fecharButton)],
      });

      await interaction.editReply({
        content: `✅ Sala criada! Vá até <#${channel.id}> e mencione os participantes.`,
      });

      const mentionMessage = await channel.send('👥 Mencione os participantes abaixo:');

      const collector = channel.createMessageCollector({
        filter: m => m.author.id === commanderId && m.mentions.users.size > 0,
        max: 1,
        time: 60000,
      });

      collector.on('collect', async msg => {
        const participantes    = msg.mentions.users.map(u => u.id);
        const participantesStr = participantes.map(id => `<@${id}>`).join(', ');

        await msg.delete();
        await mentionMessage.delete();
        await channel.delete().catch(() => {});

        const dataDisplay = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY');
        const dataDB      = moment().tz('America/Sao_Paulo').toDate();

        /* ---- Boosts ---- */
        const boosts = await Loja.findAll({
          where: {
            userId: commanderId,
            item: { [Op.in]: ['Boost 2x Relatórios por 1 dia', 'Boost 4x Relatórios por 1 dia'] },
          },
        });
        const boostMultiplier =
          boosts.reduce((s, r) => s + (r.item.includes('4x') ? 4 : 2), 0) || 1;

        /* ---- DB principal com messageId='pending' ---- */
        const mainReport = await ActionReports.create({
          commanderId,
          commanderName,
          actionName   : nomeAcao,
          actionTime   : horarioAcao,
          opponent     : oponenteAcao,
          participants : participantes.join(','),
          messageId    : 'pending',
        });
        const numeroRelatorio = mainReport.id;

        if (boostMultiplier > 1) {
          const extras = Array.from({ length: boostMultiplier - 1 }, () => ({
            commanderId,
            commanderName,
            actionName   : nomeAcao,
            actionTime   : horarioAcao,
            opponent     : oponenteAcao,
            participants : '',
            messageId    : 'pending',
          }));
          await ActionReports.bulkCreate(extras);
        }

        /* ---- Embed ---- */
        const embed = new EmbedBuilder()
          .setColor('#ffffff')
          .setTitle(`📌 ${nomeAcao} (${horarioAcao}) Nº${numeroRelatorio} - ${dataDisplay}`)
          .addFields(
            { name: '📢 Nome da Ação',  value: nomeAcao,             inline: true },
            { name: '⏳ Horário',       value: horarioAcao,          inline: true },
            { name: '👮 Comandado por', value: `<@${commanderId}>` },
            { name: '🎯 Contra',        value: oponenteAcao },
            { name: '👥 Participantes', value: participantesStr || 'Nenhum' },
          )
          .setFooter({ text: `Relatório enviado por: ${commanderName}` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`vitoria_${commanderId}`)
            .setLabel('✅ Vitória')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`derrota_${commanderId}`)
            .setLabel('❌ Derrota')
            .setStyle(ButtonStyle.Danger),
        );

        const canalFinal = interaction.guild.channels.cache.get(config.channels.acoesLog);
        const sent       = await canalFinal.send({ embeds: [embed], components: [row] });

        /* ---- UPDATE sem reportDate ---- */
        await ActionReports.update(
          { messageId: sent.id },
          { where: { commanderId, messageId: 'pending' } }
        );

        await ActionReportsAll.create({
          commanderId,
          commanderName,
          actionName   : nomeAcao,
          actionTime   : horarioAcao,
          opponent     : oponenteAcao,
          participants : participantes.join(','),
          messageId    : sent.id,
          result       : null,
        });

        /* ---- Pontos ---- */
        const action        = actionTypes.find(a => a.id_tipo === 'relatorio_acao');
        const multRec       = await UserMultiplicadores.findOne({ where: { userId: commanderId } });
        const multiplicador = multRec ? multRec.multiplicador : 1;
        const commanderPts  = action.pontos_base * multiplicador;

        const userPts = await UserPontos.findOrCreate({
          where   : { userId: commanderId },
          defaults: { pontos: 0 },
        }).then(([u]) => u);
        userPts.pontos += commanderPts;
        await userPts.save();

        await UserActions.create({
          userId          : commanderId,
          id_tipo         : action.id_tipo,
          nome_tipo       : action.nome_tipo,
          pontos          : action.pontos_base,
          multiplicador,
          pontosRecebidos : commanderPts,
        });

        for (const pid of participantes) {
          if (pid === commanderId) continue;
          const partPts = await UserPontos.findOrCreate({
            where   : { userId: pid },
            defaults: { pontos: 0 },
          }).then(([u]) => u);

          const pontosRecebidos = Math.floor(commanderPts / 2);
          partPts.pontos += pontosRecebidos;
          await partPts.save();

          await UserActions.create({
            userId          : pid,
            id_tipo         : 'participante_acao',
            nome_tipo       : 'Participante em Relatório de Ação',
            pontos          : pontosRecebidos,
            multiplicador   : 1,
            pontosRecebidos,
          });
        }

        activeReports.delete(commanderId);
      });
    }

    /* ───────────────── 3) ❌ Fechar Relatório ───────────────── */
    if (interaction.isButton() && interaction.customId.startsWith('fechar_relatorio_')) {
      const commanderId = interaction.customId.split('_')[2];
      const requiredRoleId = config.permissions.staff;

      const isCommander     = interaction.user.id === commanderId;
      const hasRequiredRole = interaction.member.roles.cache.has(requiredRoleId);
      const isAdmin         = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (!isCommander && !hasRequiredRole && !isAdmin) {
        return interaction.reply({
          content: '❌ Apenas o comandante, cargo aprovado ou admins podem fechar.',
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({ content: '✅ Relatório fechado.', flags: MessageFlags.Ephemeral });
      activeReports.delete(commanderId);
      await interaction.channel.delete().catch(() => {});
      return;
    }

    /* ───────────────── 4) Vitória / Derrota ───────────────── */
    if (interaction.isButton()) {
      const [prefix, commanderId] = interaction.customId.split('_');
      if (!['vitoria', 'derrota'].includes(prefix)) return;

      await interaction.deferReply({ ephemeral: true });
      if (interaction.user.id !== commanderId) {
        return interaction.editReply({ content: '❌ Só o comandante pode definir o resultado.' });
      }

      const resultado = prefix === 'vitoria' ? '✅ Vitória' : '❌ Derrota';
      const mensagem  = interaction.message;
      const embed     = EmbedBuilder.from(mensagem.embeds[0]);

      const campos = embed.data.fields ?? [];
      const partField = campos.find(f => f.name === '👥 Participantes');
      const participantes = partField ? partField.value.match(/<@\d+>/g).map(v => v.replace(/[<@>]/g, '')) : [];

      const victories      = await ActionReportsAll.count({ where: { commanderId, result: '✅ Vitória' } }) + (resultado === '✅ Vitória' ? 1 : 0);
      const defeats        = await ActionReportsAll.count({ where: { commanderId, result: '❌ Derrota' } }) + (resultado === '❌ Derrota' ? 1 : 0);
      const totalVictories = await ActionReportsAll.count({ where: { result: '✅ Vitória' } }) + (resultado === '✅ Vitória' ? 1 : 0);
      const totalDefeats   = await ActionReportsAll.count({ where: { result: '❌ Derrota' } }) + (resultado === '❌ Derrota' ? 1 : 0);

      embed.addFields(
        { name: '🏅 Resultado da Ação',          value: resultado },
        { name: '📊 Estatísticas do Comandante', value: `🏆 Vitórias: ${victories} | ❌ Derrotas: ${defeats}` },
        { name: '📈 Estatísticas Gerais',        value: `🌍 Total de Vitórias: ${totalVictories} | 💀 Total de Derrotas: ${totalDefeats}` },
      );

      await mensagem.edit({ embeds: [embed], components: [] });
      await ActionReports.update({ result: resultado }, { where: { messageId: mensagem.id } });
      await ActionReportsAll.update({ result: resultado }, { where: { messageId: mensagem.id } });

      return interaction.editReply({ content: `Resultado definido como **${resultado}**.` });
    }
  },
};
