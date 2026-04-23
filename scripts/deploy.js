#!/usr/bin/env node
/*
 * Deploy automatizado para Discloud.
 *
 * Subcomandos:
 *   node scripts/deploy.js           → zip + commit + start
 *   node scripts/deploy.js status    → ver status do app
 *   node scripts/deploy.js logs      → ver logs do app
 *   node scripts/deploy.js restart   → reiniciar sem re-enviar o zip
 *
 * Também disponível via npm: npm run deploy[:status|:logs|:restart]
 *
 * Requer DISCLOUD_TOKEN em .env ou como variável de ambiente.
 */

require('dotenv').config()
const fs = require('fs')
const os = require('os')
const path = require('path')
const archiver = require('archiver')

const APP_ID = process.env.DISCLOUD_APP_ID || '1776281039305'
const TOKEN = process.env.DISCLOUD_TOKEN
const API = 'https://api.discloud.app/v2'

// Itens do projeto que NÃO devem ir pro zip de deploy.
const EXCLUDE = new Set([
  'node_modules',
  '.git',
  '.github',
  '.claude',
  '.vscode',
  'backups',
  'scripts',
  '.env',
  '.env.local',
  'database.sqlite',
  'desktop.ini',
  'dump.sql',
  'dump_postgres.sql',
  'sql-logs.txt',
  'sql-errors.txt',
  'relatorio.csv',
])

function requireToken() {
  if (TOKEN) return
  console.error(
    '✖ DISCLOUD_TOKEN não definido.\n' +
      '  Crie um arquivo .env na raiz com:\n' +
      '    DISCLOUD_TOKEN=seu_token_aqui\n' +
      '  (ou exporte a variável no ambiente).',
  )
  process.exit(1)
}

async function apiCall(method, endpoint, body, headers = {}) {
  requireToken()
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: { 'api-token': TOKEN, ...headers },
    body,
  })
  const raw = await res.text()
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(raw) }
  } catch {
    return { ok: res.ok, status: res.status, data: { raw } }
  }
}

async function buildZip() {
  const projectDir = path.resolve(__dirname, '..')
  const zipPath = path.join(os.tmpdir(), `discloud-deploy-${Date.now()}.zip`)
  const output = fs.createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 9 } })

  const done = new Promise((resolve, reject) => {
    output.on('close', resolve)
    archive.on('error', reject)
  })
  archive.pipe(output)

  for (const entry of fs.readdirSync(projectDir)) {
    if (EXCLUDE.has(entry)) continue
    if (entry.endsWith('.sqlite')) continue
    const full = path.join(projectDir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) archive.directory(full, entry)
    else archive.file(full, { name: entry })
  }

  await archive.finalize()
  await done
  return zipPath
}

async function cmdDeploy() {
  console.log('▸ gerando zip do projeto...')
  const zipPath = await buildZip()
  const sizeKB = (fs.statSync(zipPath).size / 1024).toFixed(0)
  console.log(`  zip pronto: ${sizeKB} KB (${zipPath})`)

  console.log(`▸ enviando commit para app ${APP_ID}...`)
  const form = new FormData()
  form.set(
    'file',
    new Blob([fs.readFileSync(zipPath)], { type: 'application/zip' }),
    'deploy.zip',
  )
  const commit = await apiCall('PUT', `/app/${APP_ID}/commit`, form)
  if (commit.data.raw && /524/.test(commit.data.raw)) {
    console.log('  aviso: Cloudflare retornou 524 (timeout), mas o commit costuma ter ido. Conferindo...')
  } else {
    console.log(`  resposta: ${JSON.stringify(commit.data)}`)
  }

  // Pequena pausa pro container reprocessar o zip
  await new Promise((r) => setTimeout(r, 2000))

  console.log('▸ iniciando app...')
  const start = await apiCall('PUT', `/app/${APP_ID}/start`)
  console.log(`  ${JSON.stringify(start.data)}`)

  if (!start.ok || start.data?.status === 'error') {
    console.log('\n▸ start falhou — buscando logs para diagnóstico...')
    const logs = await apiCall('GET', `/app/${APP_ID}/logs`)
    const terminal = logs.data?.apps?.terminal?.big || logs.data?.raw || '(sem logs)'
    console.log(terminal)
  } else {
    console.log('\n✔ Deploy concluído. Rode "npm run deploy:logs" para acompanhar.')
  }

  fs.unlinkSync(zipPath)
}

async function cmdStatus() {
  const res = await apiCall('GET', `/app/${APP_ID}/status`)
  console.log(JSON.stringify(res.data, null, 2))
}

async function cmdLogs() {
  const res = await apiCall('GET', `/app/${APP_ID}/logs`)
  const terminal = res.data?.apps?.terminal?.big || res.data?.raw || '(sem logs)'
  console.log(terminal)
}

async function cmdRestart() {
  const res = await apiCall('PUT', `/app/${APP_ID}/restart`)
  console.log(JSON.stringify(res.data, null, 2))
}

const COMMANDS = {
  deploy: cmdDeploy,
  status: cmdStatus,
  logs: cmdLogs,
  restart: cmdRestart,
}

const cmd = process.argv[2] || 'deploy'
const fn = COMMANDS[cmd]
if (!fn) {
  console.error(`Subcomando desconhecido: ${cmd}`)
  console.error(`Disponíveis: ${Object.keys(COMMANDS).join(', ')}`)
  process.exit(1)
}
fn().catch((err) => {
  console.error(err)
  process.exit(1)
})
