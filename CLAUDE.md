# Genesis Police - Discord Bot

## Overview
Bot Discord para a organização **Genesis Police**, construído com discord.js v14 + Sequelize/SQLite.

## Tech Stack
- **Runtime:** Node.js
- **Framework:** discord.js v14
- **Database:** SQLite via Sequelize (arquivo `database.sqlite`)
- **Config:** dotenv (`.env`) + `config.js` centralizado

## Project Structure
```
commands/       - Slash commands (auto-loaded pelo index.js)
events/         - Event handlers (auto-loaded pelo index.js)
utils/          - Utilitários (hierarquia, logs, expiração, etc.)
config.js       - Configuração centralizada (IDs, roles, channels, branding)
database.js     - Modelos Sequelize (MemberID, Identificacao, Warning, etc.)
index.js        - Entry point (carrega commands + events, login)
deploy-commands.js - Registra slash commands na guild
```

## Key Conventions

### Branding
- O nome da organização é **"Genesis Police"** — usar `config.branding.name` em todos os embeds.
- NUNCA usar "BPOL", "BUNDESPOLIZEI", "Eclipse Police" ou "3BPM" como nome visível.
- Footer dos embeds: `config.branding.footerText`
- Cor padrão dos embeds: `config.branding.color`

### IDs e Configuração
- **NUNCA** hardcodar Discord IDs (channels, roles, guilds) nos arquivos. Tudo deve vir de `config.js`.
- `.env` contém apenas: TOKEN, GUILD_ID, CLIENT_ID, APPLICATION_ID.
- Novos canais/roles devem ser adicionados em `config.js` na seção apropriada.

### Comandos
- Cada comando é um arquivo em `commands/` com `module.exports = { data: SlashCommandBuilder, execute: async fn }`.
- Usar `MessageFlags.Ephemeral` para respostas que só o usuário deve ver.
- Verificar permissões com `PermissionsBitField.Flags.Administrator` ou roles de `config.permissions`.

### Eventos
- Cada evento é um arquivo em `events/` com `module.exports = { name: 'eventName', execute: async fn }`.
- O handler principal de interações está em `events/interactionCreateRegister.js` — ele roteia slash commands, botões e modais.

### Database
- Modelos definidos em `database.js`.
- Usar `upsert` para criar/atualizar registros.
- Novos modelos devem seguir o padrão existente com `sequelize.define()`.

### Hierarquia de Patentes (do mais alto ao mais baixo)
CMD > SCMD > H.C > I.C > COR > T-COR > MAJ > CAP > 1TEN > 2TEN > ASP > S-TEN > 1SGT > 2SGT > 3SGT > CB > SD > EST

### Pontos
- Valores definidos em `config.points` e `utils/actionTypes.json`.
- Apreensão: 5, Prisão: 30, Identificação: 100, Hora PTR: 10, Ticket: 50, ADV: -30.

## Running
```bash
node deploy-commands.js   # Registrar/atualizar slash commands
node index.js             # Iniciar o bot
```

## Important Notes
- Guild principal: `config.guilds.main`
- Guild de logs: `config.guilds.logs`
- O bot opera em duas guilds simultaneamente (principal + logs).
- Após alterar commands, rodar `deploy-commands.js` antes de reiniciar.
- Deletar `database.sqlite` reseta todos os dados.
