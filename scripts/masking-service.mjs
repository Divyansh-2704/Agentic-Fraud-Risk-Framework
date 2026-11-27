// Starts the Presidio masking service (masking-service/main.py) for local development on MASKING_PORT (default 5055).
// Python is found from MASKING_PYTHON (e.g. a virtualenv's python), else masking-service/.venv, else "python".
// If Python or the packages are missing, it prints how to install them and exits cleanly, so `npm run dev` keeps going
// (the AI panel then shows "masking service unavailable" and nothing is ever sent to the LLM).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
const dir = join(root, 'masking-service')
const venv = join(dir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const python = process.env.MASKING_PYTHON || (existsSync(venv) ? venv : 'python')
const port = process.env.MASKING_PORT ?? '5055'

const check = spawnSync(python, ['-c', 'import fastapi, uvicorn, presidio_analyzer'], { cwd: dir, encoding: 'utf8' })
if (check.status !== 0) {
  console.warn(`[masking] Python service not started: ${python} cannot import fastapi / uvicorn / presidio_analyzer.`)
  console.warn('[masking] Install once:  python -m venv masking-service/.venv  &&  masking-service/.venv/Scripts/pip install -r masking-service/requirements.txt uvicorn')
  console.warn('[masking] or set MASKING_PYTHON in .env to a Python that has them. AI analysis stays off until the service runs.')
  process.exit(0)
}
console.log(`[masking] Presidio service on http://127.0.0.1:${port} (${python})`)
const child = spawn(python, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', port], { cwd: dir, stdio: 'inherit' })
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill())
child.on('exit', (code) => process.exit(code ?? 0))
