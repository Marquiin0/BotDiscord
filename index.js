require('dotenv').config();
require('events').EventEmitter.defaultMaxListeners = 100;
const fs = require('fs');
const moment = require('moment-timezone');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require('discord.js');

const config = require('./config');
const OWNER_ID = config.ownerId;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences,
  ],
});

// Armazenamento para comandos
client.commands = new Map();

// Carrega comandos da pasta ./commands
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// Carrega eventos da pasta ./events
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client).catch(err => {
      // Ignora erros de interação já respondida (código 40060)
      if (err?.code === 40060) return;
      console.error(`[${file}]`, err);
    }));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client).catch(err => {
      if (err?.code === 40060) return;
      console.error(`[${file}]`, err);
    }));
  }
}

// Função para enviar embed de erro ao dono
async function notifyOwnerAboutError(type, error) {
  try {
    const user = await client.users.fetch(OWNER_ID);
    const timestamp = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY [às] HH:mm:ss');

    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle(`🚨 ${type}`)
      .addFields(
        { name: '🕒 Horário', value: timestamp },
        { name: '📋 Nome do Erro', value: `${error.name || 'Desconhecido'}`, inline: true },
        { name: '💬 Mensagem', value: `${error.message || 'Sem mensagem'}`, inline: true },
        { name: '🧠 Stack Trace', value: `\`\`\`${(error.stack || 'Sem stack').slice(0, 1000)}\`\`\`` }
      )
      .setFooter({ text: 'Sistema de Monitoramento de Erros' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
  } catch (err) {
    console.error('[ERRO] Falha ao enviar DM de erro ao dono:', err);
  }
}

// Lidando com erros globais
process.on('unhandledRejection', async error => {
  console.error('Erro não tratado:', error);
  await notifyOwnerAboutError('Unhandled Rejection', error);
});

process.on('uncaughtException', async error => {
  console.error('Exceção não capturada:', error);
  await notifyOwnerAboutError('Uncaught Exception', error);
});

// Login do bot
client.login(process.env.TOKEN)
  .then(() => console.log('Bot iniciado com sucesso!'))
  .catch(err => {
    console.error('Erro ao logar:', err);
    notifyOwnerAboutError('Erro no login', err);
  });
