const { execFileSync, spawnSync } = require('node:child_process')

const gitleaks = spawnSync('gitleaks', ['version'], { stdio: 'ignore' })
if (gitleaks.status === 0) {
  execFileSync('gitleaks', ['protect', '--staged', '--redact', '--no-banner'], { stdio: 'inherit' })
  process.exit(0)
}

const staged = execFileSync('git', ['diff', '--cached', '--binary', '--no-ext-diff'], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
})
const patterns = [
  /\bsk-[A-Za-z0-9]{20,}\b/u,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/u,
  /(?:api[_ -]?key|access[_ -]?token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9/+_=-]{16,}/iu,
  /authorization\s*[:=]\s*["']?bearer\s+[A-Za-z0-9._=-]{20,}/iu,
]
const matches = patterns.flatMap((pattern) => staged.match(pattern) ?? [])
if (matches.length > 0) {
  console.error(`Potential secret detected in staged changes (${matches.length} match(es)); install Gitleaks for the full scan.`)
  process.exit(1)
}
console.log('Staged diff secret scan passed (Gitleaks not installed; built-in checks used).')
