/**
 * Fixed-candidate, single-defect runner. Invoke only after G4 for formal G5:
 * npm run test:mutation -- --candidate <commit> --g4-evidence reports/gates/G4.md
 * --preflight runs readiness checks without claiming a gate verdict. --ids M01,M02
 * narrows a development run; a partial run can never establish complete G5.
 * The runner never updates snapshots or writes production files in the root.
 */
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { stripVTControlCharacters } from 'node:util'
import path from 'node:path'
import { mutations } from './mutations'

const root = process.cwd()
const args = process.argv.slice(2)
const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
const preflight = args.includes('--preflight')
const requested = option('--candidate')
if (!requested) throw new Error('An explicit --candidate Git commit is required.')
const git = (...command: string[]) => execFileSync('git', command, { cwd: root, maxBuffer: 100 * 1024 * 1024 })
const candidate = git('rev-parse', `${requested}^{commit}`).toString().trim()
const evidencePath = option('--g4-evidence')
if (!preflight && !evidencePath) throw new Error('Formal execution requires the G4 evidence path; use --preflight only for tooling readiness.')
if (evidencePath && !existsSync(path.resolve(root, evidencePath))) throw new Error('G4 evidence does not exist.')
const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
const local = path.join(root, 'tmp', 'g5', stamp)
const reports = path.join(root, 'reports', 'logs', 'g5', stamp)
mkdirSync(local, { recursive: true })
mkdirSync(reports, { recursive: true })
const archive = git('archive', '--format=tar', candidate)
execFileSync('tar', ['-xf', '-', '-C', local], { input: archive })
symlinkSync(path.join(root, 'node_modules'), path.join(local, 'node_modules'), 'dir')
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
if (sha(readFileSync(path.join(local, 'package-lock.json'))) !== sha(readFileSync(path.join(root, 'package-lock.json')))) {
  throw new Error('Installed dependency lockfile must match the archived candidate.')
}
const overlay: string[] = []
// The sole permitted readiness overlay is the auditor's new supplementary tests.
// Formal runs always obtain every test from the archived commit.
for (const file of ['tests/unit/audit-policy.test.ts', 'tests/acceptance/audit-transfer.spec.ts']) {
  if (preflight && !existsSync(path.join(local, file))) {
    writeFileSync(path.join(local, file), readFileSync(path.join(root, file)))
    overlay.push(file)
  }
}
const tracked = git('ls-tree', '-r', '--name-only', candidate).toString().trim().split('\n').sort()
const manifest = tracked.map(file => ({ file, sha256: sha(readFileSync(path.join(local, file))) }))
if (!preflight) {
  for (const file of ['tests/audit/run.ts', 'tests/audit/mutations.ts']) {
    if (!existsSync(path.join(local, file)) || sha(readFileSync(path.join(root, file))) !== sha(readFileSync(path.join(local, file)))) {
      throw new Error(`Formal tooling must match the fixed candidate: ${file}`)
    }
  }
}
const groupHash = (test: (file: string) => boolean) => sha(JSON.stringify(manifest.filter(item => test(item.file))))
const port = await new Promise<number>((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') return reject(new Error('Port allocation failed'))
    const number = address.port
    server.close(error => error ? reject(error) : resolve(number))
  })
})
const configPath = path.join(local, 'g5.playwright.config.ts')
// Seeded browser cases route /api in their own isolated browser context. They
// need only Vite, not the mutable shared mock server used by demo scenarios.
writeFileSync(configPath, `import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base,
  reporter: [['json']], outputDir: process.env.G5_ARTIFACTS,
  use: { ...base.use, baseURL: 'http://127.0.0.1:${port}' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort', url: 'http://127.0.0.1:${port}', reuseExistingServer: false, timeout: 60000 }
});\n`)

interface Observation { name: string; status: string; failures: string[] }
interface VitestJson { numTotalTests?: number; numFailedTests?: number; numRuntimeErrorTestSuites?: number; testResults?: Array<{ assertionResults?: Array<{ fullName: string; status: string; failureMessages: string[] }> }> }
interface PlaywrightJson { errors?: unknown[]; suites?: Suite[]; stats?: { expected: number; unexpected: number; skipped: number; flaky: number } }
interface Suite { title: string; specs?: Array<{ title: string; tests: Array<{ results: Array<{ status: string; errors?: Array<{ message?: string; stack?: string }> }> }> }>; suites?: Suite[] }
function observations(runner: 'vitest' | 'playwright', filename: string): { tests: Observation[]; harnessErrors: number } {
  if (!existsSync(filename)) return { tests: [], harnessErrors: 1 }
  try {
    const report = JSON.parse(readFileSync(filename, 'utf8')) as VitestJson & PlaywrightJson
    if (runner === 'vitest') return {
      tests: (report.testResults ?? []).flatMap(result => (result.assertionResults ?? []).map(test => ({ name: test.fullName, status: test.status, failures: test.failureMessages.map(stripVTControlCharacters) }))),
      harnessErrors: report.numRuntimeErrorTestSuites ?? 0,
    }
    const tests: Observation[] = []
    const visit = (suite: Suite) => {
      for (const spec of suite.specs ?? []) for (const test of spec.tests) for (const result of test.results) tests.push({ name: spec.title, status: result.status, failures: (result.errors ?? []).map(error => stripVTControlCharacters(error.message ?? error.stack ?? '')) })
      for (const child of suite.suites ?? []) visit(child)
    }
    for (const suite of report.suites ?? []) visit(suite)
    return { tests, harnessErrors: report.errors?.length ?? 0 }
  } catch { return { tests: [], harnessErrors: 1 } }
}
function execute(runner: 'vitest' | 'playwright', testFiles: string[], title: string | undefined, label: string) {
  const log = path.join(reports, `${label}.log`)
  const json = path.join(reports, `${label}.json`)
  const regex = title?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const cli = runner === 'vitest' ? 'node_modules/vitest/vitest.mjs' : 'node_modules/@playwright/test/cli.js'
  const command = runner === 'vitest'
    ? [cli, 'run', ...testFiles, ...(regex ? ['-t', regex] : []), '--reporter=json', `--outputFile=${json}`]
    : [cli, 'test', ...testFiles, '--config', configPath, ...(regex ? ['--grep', regex] : [])]
  const started = new Date().toISOString()
  const result = spawnSync(process.execPath, command, {
    cwd: local, encoding: 'utf8', timeout: 180000, maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1', PLAYWRIGHT_JSON_OUTPUT_FILE: json, G5_ARTIFACTS: path.join(reports, `${label}-artifacts`) },
  })
  writeFileSync(log, `$ ${process.execPath} ${command.map(value => JSON.stringify(value)).join(' ')}\nCWD ${local}\n${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`)
  const observation = observations(runner, json)
  const executed = observation.tests.filter(test => test.status !== 'skipped' && test.status !== 'pending' && test.status !== 'todo')
  const green = result.status === 0 && observation.harnessErrors === 0 && executed.length > 0 && executed.every(test => test.status === 'passed')
  return { command: [process.execPath, ...command], cwd: local, started, finished: new Date().toISOString(), exitCode: result.status, signal: result.signal, log, logSha256: sha(readFileSync(log)), json, jsonSha256: existsSync(json) ? sha(readFileSync(json)) : null, green, ...observation }
}
const selectedIds = option('--ids')?.split(',')
const selected = mutations.filter(mutation => !selectedIds || selectedIds.includes(mutation.id))
if (!selected.length || (selectedIds && selected.length !== new Set(selectedIds).size)) throw new Error('Unknown or empty mutation ID selection.')
const results: Array<Record<string, unknown>> = []
const meta = {
  gate_id: 'G5', mode: preflight ? 'preflight-not-a-gate' : 'formal-execution-awaiting-review', verdict: 'pending',
  candidate: { kind: 'git-commit', value: candidate, source: groupHash(file => /^(src|backend|scripts)\//.test(file)), suite: groupHash(file => /^tests\//.test(file)), fixture: groupHash(file => /^(backend|tests\/fixtures)\//.test(file)), design: groupHash(file => file === 'docs/DESIGN_SPEC.md' || file === 'docs/reference/crypto-checkout-design.pdf'), lockfile: sha(readFileSync(path.join(local, 'package-lock.json'))) },
  reviewer: { role: 'independent G5 auditor', session: '/root/g5_auditor', authoredProduction: false },
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  runner: { file: 'tests/audit/run.ts', sha256: sha(readFileSync(path.join(root, 'tests/audit/run.ts'))), catalogueSha256: sha(readFileSync(path.join(root, 'tests/audit/mutations.ts'))) },
  g4Evidence: evidencePath ? { path: evidencePath, sha256: sha(readFileSync(path.resolve(root, evidencePath))) } : null,
  isolation: { directory: local, browserPort: port, archiveSha256: sha(archive), harnessConfigSha256: sha(readFileSync(configPath)), overlay: overlay.map(file => ({ file, sha256: sha(readFileSync(path.join(local, file))) })) },
  scope: { ids: selected.map(mutation => mutation.id), completeMandatory: mutations.filter(mutation => mutation.category === 'mandatory').every(mutation => selected.includes(mutation)) },
  results,
}
const save = () => writeFileSync(path.join(reports, 'summary.json'), JSON.stringify(meta, null, 2))
writeFileSync(path.join(reports, 'source-manifest.json'), JSON.stringify(manifest, null, 2))
save()
console.log(`G5 ${meta.mode}: ${candidate}\nIsolated candidate: ${local}\nEvidence: ${reports}`)
const baselineFiles = ['tests/unit', 'tests/component', 'tests/contract']
const initial = execute('vitest', baselineFiles, undefined, 'initial-baseline')
results.push({ stage: 'initial-baseline', ...initial })
save()
if (!initial.green) throw new Error(`Initial baseline failed; no defects injected. ${initial.log}`)
for (const mutation of selected) {
  console.log(`${mutation.id}: baseline → defect → restoration`)
  const filename = path.join(local, mutation.file)
  const original = readFileSync(filename, 'utf8')
  let changed = original
  for (const part of mutation.patches) {
    const count = changed.split(part.before).length - 1
    if (count !== 1) throw new Error(`${mutation.id} expected one patch location in ${mutation.file}; found ${count}. Candidate source changed; independent patch review required.`)
    changed = changed.replace(part.before, part.after)
  }
  const baseline = execute(mutation.runner, [mutation.testFile], mutation.testName, `${mutation.id}-baseline`)
  if (!baseline.green) { results.push({ id: mutation.id, verdict: 'blocked', baseline }); save(); throw new Error(`${mutation.id} target baseline failed`) }
  const patchPath = path.join(reports, `${mutation.id}.patch`)
  const originalCopy = path.join(reports, `${mutation.id}.original`)
  const changedCopy = path.join(reports, `${mutation.id}.changed`)
  writeFileSync(originalCopy, original)
  writeFileSync(changedCopy, changed)
  const diff = spawnSync('diff', ['-u', '--label', `a/${mutation.file}`, '--label', `b/${mutation.file}`, originalCopy, changedCopy], { encoding: 'utf8' })
  if (diff.status !== 1) throw new Error('Expected a nonempty, valid diff')
  writeFileSync(patchPath, diff.stdout)
  let mutated: ReturnType<typeof execute>
  try {
    writeFileSync(filename, changed)
    mutated = execute(mutation.runner, [mutation.testFile], mutation.testName, `${mutation.id}-mutated`)
  } finally { writeFileSync(filename, original) }
  const restored = sha(readFileSync(filename)) === sha(original)
  const restoration = execute(mutation.runner, [mutation.testFile], mutation.testName, `${mutation.id}-restored`)
  const failed = mutated.tests.filter(test => test.status === 'failed')
  const intended = mutated.exitCode !== 0 && mutated.harnessErrors === 0 && failed.some(test => test.name.includes(mutation.testName) && test.failures.some(message => message.includes(mutation.expectedFailure) && /AssertionError|expect\(/.test(message)))
  const verdict = intended && restored && restoration.green ? 'detected' : mutated.green ? 'survived-requires-triage' : 'blocked-unintended-failure'
  results.push({ ...mutation, patches: undefined, patchPath, patchSha256: sha(diff.stdout), sourceBefore: sha(original), sourceMutated: sha(changed), baseline, mutated, intendedAssertionFailed: intended, restoredBytes: restored, restoration, verdict })
  save()
  console.log(`${mutation.id}: ${verdict}`)
  if (!restored || !restoration.green) throw new Error(`${mutation.id} restoration failed. Stopping to protect audit validity.`)
}
const final = execute('vitest', baselineFiles, undefined, 'final-baseline')
results.push({ stage: 'final-baseline', ...final })
const trackedRestored = manifest.every(item => sha(readFileSync(path.join(local, item.file))) === item.sha256)
results.push({ stage: 'restoration-manifest', allTrackedCandidateBytesRestored: trackedRestored })
save()
console.log(`Restored candidate: ${trackedRestored}; final baseline green: ${final.green}. Evidence: ${reports}/summary.json`)
// Passing this command means execution is complete, not an automatic G5 signoff.
// Every survivor and visual-baseline provenance still needs independent review.
if (!final.green || !trackedRestored || results.some(result => result.verdict === 'blocked-unintended-failure' || result.verdict === 'survived-requires-triage')) process.exitCode = 1
