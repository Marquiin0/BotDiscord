# Genesis Police - Discord Bot

## Overview
Bot Discord para a organização **Genesis Police**, construído com discord.js v14 + Sequelize/PostgreSQL (Supabase).

## Tech Stack
- **Runtime:** Node.js
- **Framework:** discord.js v14
- **Database:** PostgreSQL via Sequelize + Neon (connection string em `DATABASE_URL` no `.env`)
- **Hosting:** Discloud (plano Diamond)
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
- `.env` contém: TOKEN, GUILD_ID, CLIENT_ID, APPLICATION_ID, DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT.
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
node index.js             # Iniciar o bot localmente
```

## Deploy (Discloud)
Ao finalizar alterações, **SEMPRE** rodar o script de deploy para atualizar o bot na Discloud:
```bash
node deploy.js "descrição das alterações"
```
Este comando faz automaticamente:
1. `git add` + `git commit` + `git push` para o GitHub
2. Gera zip otimizado (sem node_modules/assets/attachments)
3. Faz upload e deploy na Discloud via API

**IMPORTANTE:** Sempre usar `node deploy.js` ao invés de commit/push manual. Isso garante que a Discloud é atualizada junto.

## Git & Colaboração
- **Repositório:** https://github.com/Marquiin0/BotDiscord.git
- **Colaboradores:** Mvzii (`dev-mvzii`) e kidin0800 (`dev-kidin0800`)
- Cada colaborador trabalha na sua **branch pessoal** — nunca commitar direto na `main`.

### Fluxo de trabalho
1. Antes de começar a trabalhar: `git pull origin main` para pegar atualizações
2. Trabalhar na branch pessoal (`dev-mvzii` ou `dev-kidin0800`)
3. Ao terminar alterações:
   ```bash
   git add .
   git commit -m "descrição das alterações"
   git push
   ```
4. Para juntar ao código principal: abrir **Pull Request** no GitHub (branch pessoal → `main`)
5. Após o PR ser mergeado, atualizar a branch local:
   ```bash
   git checkout main
   git pull origin main
   git checkout dev-<nome>
   git merge main
   ```

### Arquivos protegidos pelo .gitignore (NÃO são enviados ao GitHub)
- `.env` — cada colaborador deve criar o seu localmente
- `database.sqlite` / `*.sqlite` — banco de dados local
- `node_modules/` — dependências (rodar `npm install` após clonar)
- `backups/`, `dump.sql`, `dump_postgres.sql`, `desktop.ini`

## Important Notes
- Guild principal: `config.guilds.main`
- Guild de logs: `config.guilds.logs`
- O bot opera em duas guilds simultaneamente (principal + logs).
- Após alterar commands, rodar `deploy-commands.js` antes de reiniciar.
- O banco de dados é PostgreSQL no **Neon** (neon.tech) — dados persistem independente da Discloud.
- O `deploy.js` contém o token da API Discloud e o APP_ID para deploy automático.
