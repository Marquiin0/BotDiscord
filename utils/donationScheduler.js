// ./utils/donationScheduler.js
// Agendador de verificação de doações:
//  1. Remove mensais expiradas e avisa o usuário.
//  2. Deposita pontos semanais (1×/semana) e avisa o usuário.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { DonationRecords, UserPontos, UserActions } = require('../database');
const { DateTime } = require('luxon');
const { Op } = require('sequelize');
const config = require('../config');

// IDs fixos – usando config centralizado
const GUILD_ID    = config.guilds.main;
const ROLE_MENSAL = '1341838952549847100'; // Cargo doação mensal (manter se existir no novo servidor, ou atualizar)
const ROLE_WIPE   = '1341839007964729494'; // Cargo doação wipe (manter se existir no novo servidor, ou atualizar)

// Pontos por pagamento semanal
const WEEKLY_SALARY = { mensal: 50, wipe: 150 };

/**
 * Retorna true se já existe um depósito semanal registrado nos últimos 7 dias.
 */
async function hasRecentWeeklySalary(userId) {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = await UserActions.findOne({
    where: {
      userId,
      id_tipo: 'weekly_salary',
      createdAt: { [Op.gte]: new Date(oneWeekAgo) },
    },
  });
  return !!recent;
}

/**
 * Envia DM embrulhando qualquer erro silenciosamente.
 */
async function safeDM(user, embed) {
  try {
    await user.send({ embeds: [embed] });
  } catch {
    /* Ignorado */
  }
}

/**
 * Processa uma doação individual:
 *  • Remove mensais expiradas.
 *  • Deposita salário se não já depositado na última semana.
 */
async function processDonation(client, donation) {
  const { userId, tipo, expiracao } = donation;
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;

  const now = new Date();
  const isMensalExpired = tipo === 'mensal' && expiracao && now > expiracao;

  /* ----------- EXPIROU ----------- */
  if (isMensalExpired) {
    const embedExpired = new EmbedBuilder()
      .setTitle('⚠️ Doação expirada')
      .setDescription(
        'Sua doação mensal chegou ao fim e os benefícios foram removidos. Obrigado pelo seu apoio!'
      )
      .setColor('#FF0000')
      .setTimestamp();

    await safeDM(user, embedExpired);

    // remove cargo mensal
    try {
      const guild = client.guilds.cache.get(GUILD_ID) || (await client.guilds.fetch(GUILD_ID));
      const member = await guild.members.fetch(userId);
      await member.roles.remove(ROLE_MENSAL).catch(() => {});
    } catch {}

    await donation.destroy();
    return; // nada mais a fazer
  }

  /* ----------- SALÁRIO SEMANAL ----------- */
  const pointsToAdd = WEEKLY_SALARY[tipo] ?? 0;
  if (!pointsToAdd) return; // tipo desconhecido

  // Verifica se já pagamos nesta semana
  const alreadyPaid = await hasRecentWeeklySalary(userId);
  if (alreadyPaid) return;

  // Atualiza / cria UserPontos
  const userPoints =
    (await UserPontos.findOne({ where: { userId } })) ||
    (await UserPontos.create({ userId, pontos: 0 }));
  userPoints.pontos += pointsToAdd;
  await userPoints.save();

  // registra UserActions
  await UserActions.create({
    userId,
    id_tipo: 'weekly_salary',
    nome_tipo: `Salário Semanal ${tipo === 'mensal' ? 'Mensal' : 'Wipe'}`,
    pontos: pointsToAdd,
    multiplicador: 1,
    pontosRecebidos: pointsToAdd,
  });

  // DM confirmando depósito
  const localTime = DateTime.now().setZone('America/Sao_Paulo').toFormat('dd/MM/yyyy, HH:mm:ss');
  const embedSalary = new EmbedBuilder()
    .setTitle('💰 Salário semanal depositado')
    .setDescription(`Foram adicionados \`${pointsToAdd}\` pontos à sua conta.`)
    .addFields(
      { name: 'Tipo de doação', value: tipo === 'mensal' ? 'Mensal' : 'Wipe', inline: true },
      { name: 'Data', value: localTime, inline: true }
    )
    .setColor('#00FF00')
    .setTimestamp();

  await safeDM(user, embedSalary);
}

/**
 * Loop principal que percorre todas as DonationRecords.
 */
async function checkDonations(client) {
  try {
    const donations = await DonationRecords.findAll();
    for (const donation of donations) {
      await processDonation(client, donation);
    }
  } catch (err) {
    console.error('[DonationScheduler] Erro:', err);
  }
}

/**
 * Inicie o agendador.
 * @param {Client} client      Instância do bot
 * @param {number} intervalMs  Intervalo em milissegundos (default: 1h)
 */
function startDonationChecks(client, intervalMs = 60 * 60 * 1000) {
  // primeira execução imediata
  checkDonations(client);
  // execuções subsequentes
  setInterval(() => checkDonations(client), intervalMs);
}

module.exports = { startDonationChecks };
