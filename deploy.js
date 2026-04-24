/**
 * Script de deploy automático: commit + push + deploy na Discloud
 * Uso: node deploy.js "mensagem do commit"
 */

const { execSync } = require('child_process')
const archiver = require('archiver')
const fs = require('fs')
const path = require('path')

const DISCLOUD_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjgyNzQxMDQ2OTIyMjk5OTkwMjA3NzY5MjgiLCJrZXkiOiI0Njc0NmRjMGQxNGIyMThhYTM0NjY5ZTAwOTA3In0.u2bzmGeHllxjIdZsaU4OKOePs_seNgq0165cnZsnjPU'
const APP_ID = '1776281039305'
const ZIP_PATH = path.join(__dirname, 'deploy_temp.zip')

const IGNORE = [
  'node_modules/**', '.git/**', '.claude/**', 'backups/**',
  'attachments/**', 'assets/**', 'dump.sql', 'dump_postgres.sql',
  'desktop.ini', 'database.sqlite', 'out.sqlite', '*.zip',
  'deploy_temp.zip',
]

async function deploy() {
  const commitMsg = process.argv[2] || 'Atualização do bot'

  // 1. Git add + commit + push
  console.log('📦 Commitando alterações...')
  try {
    execSync('git add commands/ config.js database.js deploy-commands.js discloud.config events/ utils/ assets/ index.js package.json', { stdio: 'pipe' })
    execSync(`git commit -m "${commitMsg}\n\nCo-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"`, { stdio: 'pipe' })
    console.log('✅ Commit criado')
  } catch (e) {
    if (e.stderr && e.stderr.toString().includes('nothing to commit')) {
      console.log('⚠️ Nada para commitar, continuando deploy...')
    } else {
      console.log('⚠️ Git:', e.stderr?.toString().trim() || 'sem alterações novas')
    }
  }

  try {
    execSync('git push origin dev-mvzii', { stdio: 'pipe', timeout: 30000 })
    console.log('✅ Push feito')
  } catch (e) {
    console.log('⚠️ Push:', e.stderr?.toString().trim() || 'falhou')
  }

  // 2. Criar zip
  console.log('📁 Criando zip...')
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(ZIP_PATH)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      console.log(`✅ Zip criado: ${(archive.pointer() / 1024).toFixed(0)} KB`)
      resolve()
    })
    archive.on('error', reject)
    archive.pipe(output)
    archive.glob('**/*', { cwd: __dirname, ignore: IGNORE, dot: true })
    archive.finalize()
  })

  // 3. Deploy na Discloud via fetch
  console.log('🚀 Enviando para Discloud...')
  try {
    const { default: fetch } = await import('node-fetch')
    const { FormData, File } = await import('node-fetch')

    const boundary = '----DeployBoundary' + Date.now()
    const fileBuffer = fs.readFileSync(ZIP_PATH)
    const fileName = 'deploy_temp.zip'

    const bodyParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`,
      `Content-Type: application/zip\r\n\r\n`,
    ]
    const bodyEnd = `\r\n--${boundary}--\r\n`

    const body = Buffer.concat([
      Buffer.from(bodyParts.join('')),
      fileBuffer,
      Buffer.from(bodyEnd),
    ])

    const res = await fetch(`https://api.discloud.app/v2/app/${APP_ID}/commit`, {
      method: 'PUT',
      headers: {
        'api-token': DISCLOUD_TOKEN,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      timeout: 120000,
    })

    const json = await res.json()
    if (json.status === 'ok') {
      console.log('✅ Deploy concluído: ' + json.message)
    } else {
      console.log('❌ Erro: ' + json.message)
    }
  } catch (e) {
    console.log('❌ Falha no deploy:', e.message)
  }

  // 4. Limpar zip temporário
  try { fs.unlinkSync(ZIP_PATH) } catch {}
  console.log('🎉 Pronto!')
}

deploy().catch(console.error)
