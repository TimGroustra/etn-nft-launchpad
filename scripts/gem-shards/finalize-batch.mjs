import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = process.env.GEM_SHARD_ASSETS_DIR
  ?? 'C:\\Users\\Timot\\.cursor\\projects\\c-Users-Timot-dyad-apps-NinjaJars\\assets'
const FINALIZE = path.join(__dirname, 'finalize-one.mjs')

const [fromArg, toArg] = process.argv.slice(2)
const from = Number(fromArg)
const to = Number(toArg)
if (!from || !to || from > to) {
  console.error('Usage: node finalize-batch.mjs <fromId> <toId>')
  process.exit(1)
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', shell: false })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })
}

for (let id = from; id <= to; id++) {
  const src = path.join(ASSETS, `gem-shard-${String(id).padStart(3, '0')}-raw.png`)
  await runNode([FINALIZE, src, String(id)])
}

const progressPath = path.resolve(__dirname, '../../gem-shards/data/progress.json')
const progress = JSON.parse(await readFile(progressPath, 'utf8'))
const set = new Set(progress.completed ?? [])
for (let id = 1; id <= to; id++) set.add(id)
progress.completed = [...set].sort((a, b) => a - b)
await import('node:fs/promises').then(({ writeFile }) =>
  writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`, 'utf8'),
)
console.log(`Progress updated through token ${to}`)
