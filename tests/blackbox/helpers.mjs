import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const packageTempRoot = mkdtempSync(path.join(os.tmpdir(), 'chex-package-'))
let packedTarball

process.on('exit', () => {
  rmSync(packageTempRoot, { recursive: true, force: true })
})

export function uniqueName(prefix = 'chex') {
  return `${prefix}-${Date.now()}-${randomBytes(3).toString('hex')}`
}

export function run(command, args, { cwd, env = {}, timeout = 120_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout,
  })

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  }
}

export function assertRun(result, label) {
  if (result.status === 0 && !result.error) return

  throw new Error(
    [
      `${label} failed with status ${result.status}`,
      result.error ? `error: ${result.error.message}` : undefined,
      result.stdout ? `stdout:\n${result.stdout}` : undefined,
      result.stderr ? `stderr:\n${result.stderr}` : undefined,
    ]
      .filter(Boolean)
      .join('\n\n')
  )
}

export function chexTarball() {
  if (process.env.CHEX_PACKAGE_TARBALL) return process.env.CHEX_PACKAGE_TARBALL
  if (packedTarball) return packedTarball

  const tarball = path.join(packageTempRoot, `${uniqueName('chex-package')}.tgz`)
  const pack = run('bun', ['pm', 'pack', '--filename', tarball, '--quiet'], {
    cwd: repoRoot,
  })
  assertRun(pack, `bun pm pack --filename ${tarball}`)
  packedTarball = tarball
  return packedTarball
}

export function listTarballFiles() {
  const tarball = chexTarball()
  const result = run('tar', ['-tzf', tarball])
  assertRun(result, `tar -tzf ${tarball}`)
  return result.stdout.trim().split('\n').filter(Boolean).sort()
}

export async function createChexConsumer() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chex-consumer-'))
  const tarball = chexTarball()

  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }, null, 2)
  )

  const install = run('bun', ['add', tarball], { cwd: root })
  assertRun(install, `bun add ${tarball}`)

  return {
    root,
    path(...parts) {
      return path.join(root, ...parts)
    },
    bin(name) {
      return path.join(root, 'node_modules', '.bin', name)
    },
    runBin(name, args = [], options = {}) {
      const result = run('bun', [this.bin(name), ...args], {
        cwd: options.cwd ?? root,
        env: options.env,
        timeout: options.timeout,
      })
      assertRun(result, `bun ${name} ${args.join(' ')}`.trim())
      return result
    },
    async runModule(source, env = {}) {
      const file = path.join(root, `${uniqueName('script')}.mjs`)
      await writeFile(file, source)

      const result = run('bun', [file], { cwd: root, env })
      assertRun(result, `bun ${path.basename(file)}`)
      return result
    },
    async writeFile(relativePath, content) {
      const filePath = path.join(root, relativePath)
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, content)
      return filePath
    },
    async writeJson(relativePath, value) {
      return this.writeFile(relativePath, `${JSON.stringify(value, null, 2)}\n`)
    },
    async readFile(relativePath) {
      return readFile(path.join(root, relativePath), 'utf8')
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true })
    },
  }
}
