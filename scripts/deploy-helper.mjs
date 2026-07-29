import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_PROJECT_ID = 'demo-sentinel-dashboard';
const LOCAL_EMULATOR_HOST = '127.0.0.1:8080';
const LOCAL_LISTEN_HOST = '127.0.0.1';
const LOCAL_BROWSER_HOST = 'localhost';
const DEFAULT_LOCAL_PORT = 3000;
const DEFAULT_READY_TIMEOUT_MS = 60_000;
const DEFAULT_READY_REQUEST_TIMEOUT_MS = 15_000;
const SUPPORTED_COMMANDS = new Set(['local', 'check', 'preview', 'production']);
const CHILD_COMPLETION = Symbol('sentinelChildCompletion');
const CHILD_SPAWN_ERROR = Symbol('sentinelChildSpawnError');
const LOCAL_PASSTHROUGH_KEYS = [
  'VITE_GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_ID',
  'SESSION_SECRET',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'OPENROUTER_SITE_URL',
];
const LOCAL_FORBIDDEN_IDENTITY_KEYS = [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'VERCEL_OIDC_TOKEN',
  'GCP_PROJECT_NUMBER',
  'GCP_SERVICE_ACCOUNT_EMAIL',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_PROVIDER_ID',
];

const VALUE_OPTIONS = new Set([
  '--confirm-project',
  '--email',
  '--end-date',
  '--port',
  '--role',
  '--seed',
  '--students',
]);

const FLAG_OPTIONS = new Set(['--dry-run']);

const ALLOWED_OPTIONS = {
  local: new Set([
    '--dry-run',
    '--email',
    '--end-date',
    '--port',
    '--role',
    '--seed',
    '--students',
  ]),
  check: new Set(['--dry-run']),
  preview: new Set(['--dry-run']),
  production: new Set(['--confirm-project', '--dry-run']),
};

const FORBIDDEN_SECRET_PATTERNS = [
  { label: 'private key material', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { label: 'OpenRouter key material', pattern: /sk-or-v1-[A-Za-z0-9_-]{16,}/ },
];

const FORBIDDEN_BROWSER_PATTERNS = [
  { label: 'Firebase browser runtime', pattern: /firebase/i },
  { label: 'Firebase App Check', pattern: /app[\s_-]?check/i },
  { label: 'legacy Vite Firebase variable', pattern: /VITE_FIREBASE_/i },
  ...FORBIDDEN_SECRET_PATTERNS,
];

function usageText() {
  return `Sentinel deployment helper

Usage:
  npm run deploy:local -- --email USER [local options]
  npm run deploy:check [-- --dry-run]
  npm run deploy:preview [-- --dry-run]
  npm run deploy:production -- --confirm-project NAME_OR_ID

Commands:
  local       Start the Firestore Emulator, seed synthetic data, provision one
              emulator-only user, start Vercel Dev, and run a signed-out API smoke test.
  check       Run unit/rules tests, lint, Vite build, browser-bundle scans, and
              a linked Vercel preview build. Nothing is deployed.
  preview     Require a clean Git tree, run the complete check gate, and deploy
              the prebuilt Preview output.
  production  Require Node 22, a clean Git tree, and exact linked-project
              confirmation before building and deploying Production.

Local options:
  --email ADDRESS       Google test-user email to allowlist (required)
  --role ROLE           clinician or admin (default: clinician)
  --end-date YYYY-MM-DD Synthetic dataset end date (default: local current date)
  --students COUNT      Synthetic student count, 1-250 (default: 100)
  --seed VALUE          Deterministic safe seed (default: sentinel-local-emulator-v2)
  --port PORT           Vercel Dev loopback port, 1024-65535 (default: 3000)

Safety options:
  --confirm-project X   Required for Production; must equal the linked Vercel
                        project name or project ID
  --dry-run             Print the exact command plan without starting or deploying

Before remote commands, run "npx vercel link" manually. The helper pulls and
validates the exact target environment itself.
The helper never publishes a Firestore dataset or provisions a remote user.`;
}

function readValueOption(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function assertCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('--end-date must use YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('--end-date must be a real calendar date');
  }
  return value;
}

function localCalendarDate(clock = () => new Date()) {
  const now = clock();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('Clock must return a valid Date');
  }
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeEmail(value) {
  const email = value?.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if (
    !email
    || email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('--email must be a valid address');
  }
  return email;
}

function parsePositiveInteger(value, option, { minimum, maximum }) {
  if (!/^\d+$/.test(value)) throw new Error(`${option} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${option} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseCliArgs(args, { clock } = {}) {
  if (
    args.length === 0
    || args.includes('--help')
    || args.includes('-h')
    || args[0] === 'help'
  ) {
    return { command: 'help', options: {} };
  }

  const command = args[0];
  if (!SUPPORTED_COMMANDS.has(command)) {
    throw new Error(`Unknown command "${command}". Use --help for supported commands.`);
  }

  const rawOptions = new Map();
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index];
    if (!option.startsWith('--')) {
      throw new Error(`Unexpected positional argument "${option}"`);
    }
    if (!VALUE_OPTIONS.has(option) && !FLAG_OPTIONS.has(option)) {
      throw new Error(`Unknown option "${option}"`);
    }
    if (!ALLOWED_OPTIONS[command].has(option)) {
      throw new Error(`${option} is not allowed for ${command}`);
    }
    if (rawOptions.has(option)) throw new Error(`${option} may be provided only once`);
    if (FLAG_OPTIONS.has(option)) {
      rawOptions.set(option, true);
      continue;
    }
    rawOptions.set(option, readValueOption(args, index, option));
    index += 1;
  }

  const options = { dryRun: rawOptions.has('--dry-run') };
  if (command === 'local') {
    if (!rawOptions.has('--email')) throw new Error('--email is required for local testing');
    const role = rawOptions.get('--role') ?? 'clinician';
    if (!['clinician', 'admin'].includes(role)) {
      throw new Error('--role must be clinician or admin');
    }
    const seed = rawOptions.get('--seed') ?? 'sentinel-local-emulator-v2';
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(seed)) {
      throw new Error('--seed must contain only safe letters, numbers, dot, underscore, or dash');
    }
    options.email = normalizeEmail(rawOptions.get('--email'));
    options.role = role;
    options.endDate = assertCalendarDate(
      rawOptions.get('--end-date') ?? localCalendarDate(clock),
    );
    options.students = parsePositiveInteger(
      rawOptions.get('--students') ?? '100',
      '--students',
      { minimum: 1, maximum: 250 },
    );
    options.seed = seed;
    options.port = parsePositiveInteger(
      rawOptions.get('--port') ?? String(DEFAULT_LOCAL_PORT),
      '--port',
      { minimum: 1024, maximum: 65_535 },
    );
  }
  if (command === 'production') {
    options.confirmProject = rawOptions.get('--confirm-project');
  }
  return { command, options };
}

function parseDotEnv(source) {
  const values = {};
  const seen = new Set();
  for (const rawLine of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalizedLine = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = normalizedLine.indexOf('=');
    if (separator < 1) throw new Error('.env.local contains a malformed line');
    const key = normalizedLine.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error('.env.local contains an invalid variable name');
    }
    const canonicalKey = key.toUpperCase();
    if (seen.has(canonicalKey)) {
      throw new Error(`.env.local contains duplicate variable ${canonicalKey}`);
    }
    seen.add(canonicalKey);
    let value = normalizedLine.slice(separator + 1).trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      if (value.length < 2 || value.at(-1) !== quote) {
        throw new Error(`.env.local contains an unmatched quote for ${canonicalKey}`);
      }
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function getExactEnvironmentValue(values, key) {
  const matches = Object.entries(values).filter(([candidate]) => candidate.toUpperCase() === key);
  if (matches.length > 1) throw new Error(`Environment contains duplicate variable ${key}`);
  if (matches.length === 0) return undefined;
  if (matches[0][0] !== key) throw new Error(`Use the exact environment variable name ${key}`);
  return matches[0][1];
}

function looksLikePlaceholder(value) {
  return !value || /replace[-_ ]?with|placeholder|YOUR[_-]/i.test(value);
}

function validateLocalEnvironment(values, { firebaseProjectId = LOCAL_PROJECT_ID } = {}) {
  const publicClientId = getExactEnvironmentValue(values, 'VITE_GOOGLE_CLIENT_ID');
  const serverClientId = getExactEnvironmentValue(values, 'GOOGLE_CLIENT_ID');
  const sessionSecret = getExactEnvironmentValue(values, 'SESSION_SECRET');
  const projectId = getExactEnvironmentValue(values, 'GCP_PROJECT_ID');
  const emulatorHost = getExactEnvironmentValue(values, 'FIRESTORE_EMULATOR_HOST');

  if (
    looksLikePlaceholder(publicClientId)
    || !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(publicClientId)
  ) {
    throw new Error('Set a real localhost Google OAuth client in VITE_GOOGLE_CLIENT_ID');
  }
  if (serverClientId !== publicClientId) {
    throw new Error('GOOGLE_CLIENT_ID must exactly match VITE_GOOGLE_CLIENT_ID');
  }
  if (
    looksLikePlaceholder(sessionSecret)
    || !sessionSecret.trim()
    || Buffer.byteLength(sessionSecret, 'utf8') < 32
  ) {
    throw new Error('SESSION_SECRET must contain at least 32 non-placeholder bytes');
  }
  if (projectId !== LOCAL_PROJECT_ID || projectId !== firebaseProjectId) {
    throw new Error(`Local testing requires GCP_PROJECT_ID=${LOCAL_PROJECT_ID}`);
  }
  if (emulatorHost !== LOCAL_EMULATOR_HOST) {
    throw new Error(`Local testing requires FIRESTORE_EMULATOR_HOST=${LOCAL_EMULATOR_HOST}`);
  }
  for (const forbiddenKey of LOCAL_FORBIDDEN_IDENTITY_KEYS) {
    if (getExactEnvironmentValue(values, forbiddenKey)) {
      throw new Error(`${forbiddenKey} must not be stored in .env.local`);
    }
  }
  return { emulatorHost, projectId };
}

function validateTargetEnvironment(values, { target }) {
  if (!['preview', 'production'].includes(target)) throw new Error('Unknown Vercel target');
  const publicClientId = getExactEnvironmentValue(values, 'VITE_GOOGLE_CLIENT_ID');
  const serverClientId = getExactEnvironmentValue(values, 'GOOGLE_CLIENT_ID');
  const sessionSecret = getExactEnvironmentValue(values, 'SESSION_SECRET');
  if (
    looksLikePlaceholder(publicClientId)
    || !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(publicClientId)
  ) {
    throw new Error(`${target} is missing a valid VITE_GOOGLE_CLIENT_ID`);
  }
  if (serverClientId !== publicClientId) {
    throw new Error(`${target} GOOGLE_CLIENT_ID must match VITE_GOOGLE_CLIENT_ID`);
  }
  if (
    looksLikePlaceholder(sessionSecret)
    || !sessionSecret.trim()
    || Buffer.byteLength(sessionSecret, 'utf8') < 32
  ) {
    throw new Error(`${target} SESSION_SECRET must contain at least 32 non-placeholder bytes`);
  }
  for (const forbiddenKey of [
    'FIRESTORE_EMULATOR_HOST',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'VERCEL_OIDC_TOKEN',
  ]) {
    if (getExactEnvironmentValue(values, forbiddenKey)) {
      throw new Error(`${target} must not define ${forbiddenKey}`);
    }
  }

  const productionIdentityKeys = [
    'GCP_PROJECT_ID',
    'GCP_PROJECT_NUMBER',
    'GCP_SERVICE_ACCOUNT_EMAIL',
    'GCP_WORKLOAD_IDENTITY_POOL_ID',
    'GCP_WORKLOAD_IDENTITY_PROVIDER_ID',
  ];
  if (target === 'preview') {
    for (const key of [...productionIdentityKeys, 'OPENROUTER_API_KEY']) {
      if (getExactEnvironmentValue(values, key)) {
        throw new Error(`Preview must not define production credential variable ${key}`);
      }
    }
  } else {
    for (const key of productionIdentityKeys) {
      if (looksLikePlaceholder(getExactEnvironmentValue(values, key))) {
        throw new Error(`Production is missing required variable ${key}`);
      }
    }
  }
  return { target };
}

function targetEnvironmentRelativePath(target) {
  if (!['preview', 'production'].includes(target)) throw new Error('Unknown Vercel target');
  return `.vercel/.env.${target}.local`;
}

async function readTargetEnvironment(root, target) {
  const relativePath = targetEnvironmentRelativePath(target);
  let source;
  try {
    source = await readFile(path.join(root, ...relativePath.split('/')), 'utf8');
  } catch {
    throw new Error(`Missing ${relativePath}; the target-specific Vercel pull did not complete`);
  }
  const values = parseDotEnv(source);
  validateTargetEnvironment(values, { target });
  return values;
}

function withCanonicalEnvironment(baseEnvironment, overrides) {
  const overridden = new Set(Object.keys(overrides).map(key => key.toUpperCase()));
  const result = {};
  for (const [key, value] of Object.entries(baseEnvironment)) {
    if (!overridden.has(key.toUpperCase())) result[key] = value;
  }
  return { ...result, ...overrides };
}

function withoutCanonicalEnvironmentKeys(environment, keys) {
  const removed = new Set(keys.map(key => key.toUpperCase()));
  return Object.fromEntries(
    Object.entries(environment).filter(([key]) => !removed.has(key.toUpperCase())),
  );
}

function localPassthroughEnvironment(values) {
  return Object.fromEntries(
    LOCAL_PASSTHROUGH_KEYS
      .map(key => [key, getExactEnvironmentValue(values, key)])
      .filter(([, value]) => typeof value === 'string' && value !== ''),
  );
}

function buildLocalChildEnvironment(values, parentEnvironment = process.env) {
  const safeParentEnvironment = withoutCanonicalEnvironmentKeys(
    parentEnvironment,
    LOCAL_FORBIDDEN_IDENTITY_KEYS,
  );
  return withCanonicalEnvironment(safeParentEnvironment, {
    ...localPassthroughEnvironment(values),
    FIRESTORE_EMULATOR_HOST: LOCAL_EMULATOR_HOST,
    GCP_PROJECT_ID: LOCAL_PROJECT_ID,
    NO_UPDATE_NOTIFIER: '1',
    SENTINEL_CSP_DEV: '1',
  });
}

function buildCheckPlan({
  target = 'preview',
  projectId = '<LINKED_PROJECT_ID>',
} = {}) {
  if (!['preview', 'production'].includes(target)) throw new Error('Unknown build target');
  const buildArgs = ['exec', '--', 'vercel', 'build', '--project', projectId, '--yes'];
  if (target === 'production') buildArgs.push('--prod');
  else buildArgs.push('--target', 'preview');
  return [
    { id: 'unit-tests', label: 'Unit tests', npmArgs: ['test'] },
    { id: 'rules-tests', label: 'Firestore deny-all rules tests', npmArgs: ['run', 'test:rules'] },
    { id: 'lint', label: 'ESLint', npmArgs: ['run', 'lint'] },
    { id: 'vite-build', label: 'Vite production build', npmArgs: ['run', 'build'] },
    { id: 'scan-dist', label: 'Browser bundle safety scan', scanDirectory: 'dist' },
    {
      id: 'vercel-pull',
      label: `Pull Vercel ${target} settings`,
      npmArgs: [
        'exec',
        '--',
        'vercel',
        'pull',
        '--environment',
        target,
        '--project',
        projectId,
        '--yes',
      ],
    },
    {
      id: 'validate-vercel-environment',
      label: `Validate Vercel ${target} environment`,
      validateTargetEnvironment: target,
    },
    { id: 'vercel-build', label: `Vercel ${target} build`, npmArgs: buildArgs },
    {
      id: 'scan-vercel-static',
      label: 'Vercel build output safety scan',
      scanVercelOutput: target,
    },
  ];
}

function buildDeploymentPlan(command, { projectId = '<LINKED_PROJECT_ID>' } = {}) {
  if (command === 'check') return buildCheckPlan({ projectId });
  if (command === 'preview') {
    return [
      ...buildCheckPlan({ projectId }),
      {
        id: 'deploy-preview',
        label: 'Deploy Vercel Preview',
        npmArgs: [
          'exec',
          '--',
          'vercel',
          'deploy',
          '--prebuilt',
          '--project',
          projectId,
          '--yes',
        ],
      },
    ];
  }
  if (command === 'production') {
    return [
      ...buildCheckPlan({ target: 'production', projectId }),
      {
        id: 'deploy-production',
        label: 'Deploy Vercel Production',
        npmArgs: [
          'exec',
          '--',
          'vercel',
          'deploy',
          '--prebuilt',
          '--prod',
          '--project',
          projectId,
          '--yes',
        ],
      },
    ];
  }
  throw new Error(`Cannot build deployment plan for ${command}`);
}

function buildLocalPlan(options) {
  return [
    { label: 'Start Firestore Emulator', npmArgs: ['run', 'emulators'] },
    {
      label: 'Seed schema-v2 synthetic data',
      npmArgs: [
        'run',
        'emulators:seed',
        '--',
        '--end-date',
        options.endDate,
        '--students',
        String(options.students),
        '--seed',
        options.seed,
      ],
    },
    {
      label: 'Provision emulator-only authorized user',
      npmArgs: [
        'run',
        'auth:provision',
        '--',
        '--email',
        options.email,
        '--role',
        options.role,
        '--project-id',
        LOCAL_PROJECT_ID,
        '--emulator-host',
        LOCAL_EMULATOR_HOST,
        '--commit',
      ],
    },
    {
      label: 'Start Vercel Dev without linking',
      npmArgs: [
        'run',
        'dev:vercel',
        '--',
        '--local',
        '--listen',
        `${LOCAL_LISTEN_HOST}:${options.port}`,
      ],
    },
  ];
}

function quoteCommandArgument(value) {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value);
}

function formatNpmCommand(args) {
  return ['npm', ...args].map(quoteCommandArgument).join(' ');
}

function printPlan(plan, logger = console.log) {
  for (const [index, step] of plan.entries()) {
    let command;
    if (step.npmArgs) command = formatNpmCommand(step.npmArgs);
    else if (step.scanDirectory) command = `scan ${step.scanDirectory}`;
    else if (step.scanVercelOutput) command = 'scan .vercel/output';
    else command = `validate ${targetEnvironmentRelativePath(step.validateTargetEnvironment)}`;
    logger(`${index + 1}. ${step.label}\n   ${command}`);
  }
}

async function readVercelLink(root = PROJECT_ROOT) {
  let value;
  try {
    value = JSON.parse(await readFile(path.join(root, '.vercel', 'project.json'), 'utf8'));
  } catch {
    throw new Error(
      'Missing or invalid .vercel/project.json. Run "npx vercel link" first.',
    );
  }
  if (
    typeof value.projectId !== 'string'
    || !value.projectId.trim()
    || typeof value.orgId !== 'string'
    || !value.orgId.trim()
  ) {
    throw new Error('.vercel/project.json is missing projectId or orgId');
  }
  if (
    value.projectName !== undefined
    && (typeof value.projectName !== 'string' || !value.projectName.trim())
  ) {
    throw new Error('.vercel/project.json contains an invalid projectName');
  }
  return {
    orgId: value.orgId,
    projectId: value.projectId,
    projectName: value.projectName,
  };
}

function assertProductionConfirmation(link, confirmation) {
  if (!confirmation) {
    throw new Error(
      `Production requires --confirm-project ${link.projectName ?? link.projectId}`,
    );
  }
  if (confirmation !== link.projectId && confirmation !== link.projectName) {
    throw new Error('Production confirmation does not match the linked Vercel project');
  }
}

function assertSameVercelLink(expected, actual) {
  if (expected.projectId !== actual.projectId || expected.orgId !== actual.orgId) {
    throw new Error('Linked Vercel project changed during the deployment gate');
  }
}

function assertNodeVersion(version = process.versions.node, { production = false } = {}) {
  const major = Number(version.split('.')[0]);
  if (major === 22) return null;
  const message = `Node 22.x is required for Vercel parity; current Node is ${version}`;
  if (production) throw new Error(message);
  return message;
}

function assertNoEmulatorEnvironment(environment = process.env) {
  const matches = Object.entries(environment).filter(
    ([key, value]) => key.toUpperCase() === 'FIRESTORE_EMULATOR_HOST' && value,
  );
  if (matches.length > 0) {
    throw new Error('Unset FIRESTORE_EMULATOR_HOST before a remote Vercel build or deploy');
  }
}

function findSensitiveTrackedPaths(paths) {
  return paths.filter(rawPath => {
    const normalized = rawPath.replaceAll('\\', '/').toLowerCase();
    const basename = path.posix.basename(normalized);
    if (['.env.example', '.env.development.example'].includes(basename)) return false;
    return normalized.startsWith('.generated/')
      || normalized.startsWith('.vercel/')
      || /^\.env(?:\.|$)/.test(basename)
      || /\.(?:xlsx|xls|xlsm|xlsb|pem|p12|pfx|key)$/.test(normalized)
      || /(?:service[-_]?account|private[-_]?key|credentials).*\.json$/.test(basename);
  });
}

function resolveNpmLaunch(args, {
  environment = process.env,
  executable = process.execPath,
  fileExists = existsSync,
} = {}) {
  const candidates = [
    environment.npm_execpath,
    path.join(path.dirname(executable), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(executable), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);
  const npmCli = candidates.find(candidate => fileExists(candidate));
  if (!npmCli) {
    throw new Error('Unable to locate npm-cli.js. Run this helper through an npm deploy:* script.');
  }
  return { command: executable, args: [npmCli, ...args] };
}

function attachChildLifecycle(child) {
  if (child[CHILD_COMPLETION]) return child;
  if (child.exitCode !== null || child.signalCode !== null) {
    child[CHILD_COMPLETION] = Promise.resolve({
      code: child.exitCode,
      signal: child.signalCode,
    });
    return child;
  }
  child[CHILD_COMPLETION] = new Promise(resolve => {
    child.once('error', error => {
      child[CHILD_SPAWN_ERROR] = error;
      resolve({ code: null, error, signal: null });
    });
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return child;
}

async function waitForChild(child) {
  attachChildLifecycle(child);
  const result = await child[CHILD_COMPLETION];
  if (result.error) throw result.error;
  return result;
}

function spawnNpm(args, {
  cwd = PROJECT_ROOT,
  environment = process.env,
  ownedService = false,
  spawnImplementation = spawn,
} = {}) {
  const launch = resolveNpmLaunch(args, { environment });
  return attachChildLifecycle(spawnImplementation(launch.command, launch.args, {
    cwd,
    detached: ownedService && process.platform !== 'win32',
    env: withCanonicalEnvironment(environment, { NO_UPDATE_NOTIFIER: '1' }),
    shell: false,
    stdio: 'inherit',
  }));
}

async function runNpm(args, options = {}) {
  const child = spawnNpm(args, options);
  options.onChild?.(child);
  const result = await waitForChild(child);
  if (result.code !== 0) {
    throw new Error(`Command failed: ${formatNpmCommand(args)}`);
  }
  return result;
}

async function captureCommand(command, args, {
  cwd = PROJECT_ROOT,
  spawnImplementation = spawn,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImplementation(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== 0) {
        reject(new Error(`${command} failed during deployment safety checks`));
      } else {
        resolve({ stderr, stdout });
      }
    });
  });
}

async function readTrackedPaths(capture = captureCommand) {
  const result = await capture('git', ['-c', 'core.quotepath=false', 'ls-files', '-z']);
  return result.stdout.split('\0').filter(Boolean);
}

async function assertNoTrackedSensitiveArtifacts(capture = captureCommand) {
  const sensitive = findSensitiveTrackedPaths(await readTrackedPaths(capture));
  if (sensitive.length > 0) {
    throw new Error(`Refusing remote deployment with tracked sensitive artifacts: ${sensitive.join(', ')}`);
  }
}

async function assertCleanGitTree(capture = captureCommand) {
  const result = await capture('git', ['status', '--porcelain=v1', '--untracked-files=all']);
  if (result.stdout.trim()) {
    throw new Error('Remote deployment requires a clean Git working tree');
  }
}

async function listTextFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (/\.(?:css|html|js|json|map|mjs|txt)$/i.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }
  await visit(root);
  return files;
}

async function readLocalSecretMarkers(root = PROJECT_ROOT) {
  let source;
  try {
    source = await readFile(path.join(root, '.env.local'), 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return [];
  }
  const values = parseDotEnv(source);
  return ['SESSION_SECRET', 'OPENROUTER_API_KEY']
    .map(key => ({ key, value: getExactEnvironmentValue(values, key) }))
    .filter(marker => typeof marker.value === 'string' && marker.value.length >= 8);
}

function readProcessSecretMarkers(environment = process.env) {
  return ['SESSION_SECRET', 'OPENROUTER_API_KEY']
    .map(key => {
      const entry = Object.entries(environment).find(
        ([candidate]) => candidate.toUpperCase() === key,
      );
      return { key, value: entry?.[1] };
    })
    .filter(marker => typeof marker.value === 'string' && marker.value.length >= 8);
}

function secretMarkersFromValues(values) {
  return ['SESSION_SECRET', 'OPENROUTER_API_KEY']
    .map(key => ({ key, value: getExactEnvironmentValue(values, key) }))
    .filter(marker => typeof marker.value === 'string' && marker.value.length >= 8);
}

function deduplicateSecretMarkers(markers) {
  const seen = new Set();
  return markers.filter(marker => {
    if (seen.has(marker.value)) return false;
    seen.add(marker.value);
    return true;
  });
}

async function readSecretMarkers(root = PROJECT_ROOT, { target } = {}) {
  const markers = [
    ...readProcessSecretMarkers(),
    ...await readLocalSecretMarkers(root),
  ];
  if (target) {
    markers.push(...secretMarkersFromValues(await readTargetEnvironment(root, target)));
  }
  return deduplicateSecretMarkers(markers);
}

function assertNoForbiddenContent(content, patterns, relativeFile, outputKind) {
  for (const marker of patterns) {
    marker.pattern.lastIndex = 0;
    if (marker.pattern.test(content)) {
      throw new Error(`${marker.label} found in ${outputKind} ${relativeFile}`);
    }
  }
}

function assertNoSecretValues(content, secrets, relativeFile, outputKind) {
  for (const secret of secrets) {
    if (content.includes(secret.value)) {
      throw new Error(`${secret.key} value found in ${outputKind} ${relativeFile}`);
    }
  }
}

async function scanBrowserDirectory(relativeDirectory, {
  root = PROJECT_ROOT,
  secretMarkers,
} = {}) {
  const directory = path.join(root, relativeDirectory);
  let files;
  try {
    files = await listTextFiles(directory);
  } catch {
    throw new Error(`Missing build output directory ${relativeDirectory}`);
  }
  const secrets = secretMarkers ?? await readSecretMarkers(root);
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const relativeFile = path.relative(root, file);
    assertNoForbiddenContent(content, FORBIDDEN_BROWSER_PATTERNS, relativeFile, 'browser output');
    assertNoSecretValues(content, secrets, relativeFile, 'browser output');
  }
  return { directory: relativeDirectory, fileCount: files.length };
}

async function scanVercelBuildOutput(target, {
  root = PROJECT_ROOT,
  secretMarkers,
} = {}) {
  const relativeDirectory = '.vercel/output';
  const directory = path.join(root, '.vercel', 'output');
  let files;
  try {
    files = await listTextFiles(directory);
  } catch {
    throw new Error(`Missing build output directory ${relativeDirectory}`);
  }
  const secrets = secretMarkers ?? await readSecretMarkers(root, { target });
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const relativeFile = path.relative(root, file);
    const normalized = relativeFile.replaceAll('\\', '/').toLowerCase();
    const patterns = normalized.startsWith('.vercel/output/static/')
      ? FORBIDDEN_BROWSER_PATTERNS
      : FORBIDDEN_SECRET_PATTERNS;
    assertNoForbiddenContent(content, patterns, relativeFile, 'Vercel output');
    assertNoSecretValues(content, secrets, relativeFile, 'Vercel output');
  }
  return { directory: relativeDirectory, fileCount: files.length };
}

async function executePlan(plan, {
  dryRun = false,
  logger = console.log,
  root = PROJECT_ROOT,
  runNpmImplementation = runNpm,
  scanImplementation = scanBrowserDirectory,
  scanVercelImplementation = scanVercelBuildOutput,
  targetEnvironmentReader = readTargetEnvironment,
} = {}) {
  if (dryRun) {
    printPlan(plan, logger);
    return;
  }
  for (const [index, step] of plan.entries()) {
    logger(`\n[${index + 1}/${plan.length}] ${step.label}`);
    if (step.npmArgs) {
      await runNpmImplementation(step.npmArgs, { cwd: root });
    } else if (step.scanDirectory) {
      const result = await scanImplementation(step.scanDirectory, { root });
      logger(`Checked ${result.fileCount} browser files.`);
    } else if (step.scanVercelOutput) {
      const result = await scanVercelImplementation(step.scanVercelOutput, { root });
      logger(`Checked ${result.fileCount} Vercel output files.`);
    } else {
      await targetEnvironmentReader(root, step.validateTargetEnvironment);
      logger(`Validated ${targetEnvironmentRelativePath(step.validateTargetEnvironment)}.`);
    }
  }
}

function isTcpPortOpen(host, port, timeoutMs = 500) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitForChildWithin(child, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      waitForChild(child),
      new Promise(resolve => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHttpReady(url, {
  child,
  fetchImplementation = fetch,
  requestTimeoutMs = DEFAULT_READY_REQUEST_TIMEOUT_MS,
  timeoutMs = DEFAULT_READY_TIMEOUT_MS,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.[CHILD_SPAWN_ERROR]) {
      throw new Error(`Local service failed to start: ${url}`);
    }
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`Local service exited before becoming ready: ${url}`);
    }
    const controller = new AbortController();
    const remainingMs = Math.max(1, deadline - Date.now());
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(requestTimeoutMs, remainingMs),
    );
    try {
      await fetchImplementation(url, { signal: controller.signal });
      clearTimeout(timeout);
      return;
    } catch {
      clearTimeout(timeout);
      await delay(250);
    }
  }
  throw new Error(`Timed out waiting for local service: ${url}`);
}

async function stopOwnedProcess(child, {
  platform = process.platform,
  spawnImplementation = spawn,
} = {}) {
  if (!child || !Number.isInteger(child.pid) || child.pid <= 0) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (platform === 'win32') {
    const killer = spawnImplementation(
      'taskkill.exe',
      ['/PID', String(child.pid), '/T', '/F'],
      { shell: false, stdio: 'ignore' },
    );
    attachChildLifecycle(killer);
    await waitForChildWithin(killer, 5_000).catch(() => {});
    if (killer.exitCode === null && killer.signalCode === null) killer.kill?.();
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await waitForChildWithin(child, 3_000);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

async function loadLocalConfiguration(root = PROJECT_ROOT) {
  let envSource;
  try {
    envSource = await readFile(path.join(root, '.env.local'), 'utf8');
  } catch {
    throw new Error(
      'Missing .env.local. Copy .env.development.example to .env.local and replace every placeholder.',
    );
  }
  let firebaseConfig;
  try {
    firebaseConfig = JSON.parse(await readFile(path.join(root, '.firebaserc'), 'utf8'));
  } catch {
    throw new Error('Missing or invalid .firebaserc');
  }
  const firebaseProjectId = firebaseConfig?.projects?.default;
  const values = parseDotEnv(envSource);
  return { values, ...validateLocalEnvironment(values, { firebaseProjectId }) };
}

async function runLocal(options, {
  logger = console.log,
  root = PROJECT_ROOT,
} = {}) {
  if (options.dryRun) {
    printPlan(buildLocalPlan(options), logger);
    logger('\nLocal mode forces demo-sentinel-dashboard and 127.0.0.1:8080.');
    return;
  }

  const nodeWarning = assertNodeVersion();
  if (nodeWarning) logger(`WARNING: ${nodeWarning}`);
  const configuration = await loadLocalConfiguration(root);
  if (await isTcpPortOpen('127.0.0.1', 8080)) {
    throw new Error('Port 8080 is already in use. Stop the existing service before local testing.');
  }
  if (await isTcpPortOpen('127.0.0.1', options.port)) {
    throw new Error(`Port ${options.port} is already in use.`);
  }

  const childEnvironment = buildLocalChildEnvironment(configuration.values);
  const ownedChildren = [];
  let interrupted = false;
  let cleanupPromise;
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      for (const child of ownedChildren.toReversed()) {
        await stopOwnedProcess(child);
      }
    })();
    return cleanupPromise;
  };
  const onSignal = signal => {
    interrupted = true;
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    logger(`\nReceived ${signal}; stopping local services...`);
    void cleanup();
  };
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    logger('Starting Firestore Emulator...');
    const emulator = spawnNpm(['run', 'emulators'], {
      cwd: root,
      environment: childEnvironment,
      ownedService: true,
    });
    ownedChildren.push(emulator);
    await waitForHttpReady(`http://${configuration.emulatorHost}/`, { child: emulator });
    if (interrupted) return;

    await runNpm([
      'run',
      'emulators:seed',
      '--',
      '--end-date',
      options.endDate,
      '--students',
      String(options.students),
      '--seed',
      options.seed,
    ], {
      cwd: root,
      environment: childEnvironment,
      onChild: child => ownedChildren.push(child),
      ownedService: true,
    });
    if (interrupted) return;

    await runNpm([
      'run',
      'auth:provision',
      '--',
      '--email',
      options.email,
      '--role',
      options.role,
      '--project-id',
      configuration.projectId,
      '--emulator-host',
      configuration.emulatorHost,
      '--commit',
    ], {
      cwd: root,
      environment: childEnvironment,
      onChild: child => ownedChildren.push(child),
      ownedService: true,
    });
    if (interrupted) return;

    logger(`Starting Vercel Dev for http://${LOCAL_BROWSER_HOST}:${options.port} ...`);
    const vercelDev = spawnNpm([
      'run',
      'dev:vercel',
      '--',
      '--local',
      '--listen',
      `${LOCAL_LISTEN_HOST}:${options.port}`,
    ], {
      cwd: root,
      environment: childEnvironment,
      ownedService: true,
    });
    ownedChildren.push(vercelDev);
    const serverUrl = `http://${LOCAL_LISTEN_HOST}:${options.port}/`;
    const sessionUrl = `http://${LOCAL_LISTEN_HOST}:${options.port}/api/auth/session`;
    await waitForHttpReady(serverUrl, { child: vercelDev, requestTimeoutMs: 5_000 });
    await waitForHttpReady(sessionUrl, { child: vercelDev });
    const response = await fetch(sessionUrl, { redirect: 'manual' });
    const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
    if (response.status !== 401 || !cacheControl.includes('private') || !cacheControl.includes('no-store')) {
      throw new Error('Local signed-out session smoke test failed');
    }
    logger(`\nLocal smoke test passed. Open only http://${LOCAL_BROWSER_HOST}:${options.port}`);
    logger('Google OAuth Authorized JavaScript origins must contain that exact origin.');
    logger('Press Ctrl+C to stop Vercel Dev and the Firestore Emulator.');

    const emulatorExit = waitForChild(emulator).then(result => ({ service: 'emulator', result }));
    const vercelExit = waitForChild(vercelDev).then(result => ({ service: 'vercel', result }));
    const outcome = await Promise.race([emulatorExit, vercelExit]);
    if (!interrupted) {
      throw new Error(
        `${outcome.service} exited unexpectedly (${outcome.result.code ?? outcome.result.signal})`,
      );
    }
  } catch (error) {
    if (!interrupted) throw error;
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    await cleanup();
  }
}

async function runRemote(command, options, {
  logger = console.log,
  root = PROJECT_ROOT,
} = {}) {
  if (options.dryRun) {
    const plan = buildDeploymentPlan(command);
    printPlan(plan, logger);
    if (command === 'production') {
      logger('\nActual Production deployment also requires Node 22, a clean Git tree,');
      logger('and --confirm-project matching .vercel/project.json.');
    }
    return;
  }

  const warning = assertNodeVersion(process.versions.node, { production: command === 'production' });
  if (warning) logger(`WARNING: ${warning}`);
  assertNoEmulatorEnvironment();
  const link = await readVercelLink(root);
  const plan = buildDeploymentPlan(command, { projectId: link.projectId });
  await assertNoTrackedSensitiveArtifacts();
  if (command === 'production') {
    assertProductionConfirmation(link, options.confirmProject);
  }
  if (command === 'preview' || command === 'production') await assertCleanGitTree();
  logger(`Linked Vercel project: ${link.projectName ?? link.projectId}`);
  if (command === 'check') {
    await executePlan(plan, { logger, root });
    return;
  }

  const deploymentStep = plan.at(-1);
  await executePlan(plan.slice(0, -1), { logger, root });

  const currentLink = await readVercelLink(root);
  assertSameVercelLink(link, currentLink);
  await assertNoTrackedSensitiveArtifacts();
  await assertCleanGitTree();
  if (command === 'production') {
    assertProductionConfirmation(currentLink, options.confirmProject);
  }
  logger('Pre-deployment safety checks passed again after the build gate.');
  await executePlan([deploymentStep], { logger, root });
}

async function main(args = process.argv.slice(2), dependencies = {}) {
  const parsed = parseCliArgs(args, dependencies);
  if (parsed.command === 'help') {
    (dependencies.logger ?? console.log)(usageText());
    return;
  }
  if (parsed.command === 'local') {
    await runLocal(parsed.options, dependencies);
  } else {
    await runRemote(parsed.command, parsed.options, dependencies);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(`Deployment helper failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  attachChildLifecycle,
  assertCalendarDate,
  assertCleanGitTree,
  assertNoEmulatorEnvironment,
  assertNodeVersion,
  assertSameVercelLink,
  buildLocalChildEnvironment,
  assertProductionConfirmation,
  buildCheckPlan,
  buildDeploymentPlan,
  buildLocalPlan,
  executePlan,
  findSensitiveTrackedPaths,
  formatNpmCommand,
  getExactEnvironmentValue,
  LOCAL_EMULATOR_HOST,
  LOCAL_PROJECT_ID,
  localCalendarDate,
  main,
  parseCliArgs,
  parseDotEnv,
  printPlan,
  readVercelLink,
  readTargetEnvironment,
  resolveNpmLaunch,
  scanBrowserDirectory,
  scanVercelBuildOutput,
  stopOwnedProcess,
  usageText,
  validateLocalEnvironment,
  validateTargetEnvironment,
  waitForHttpReady,
  waitForChild,
  withCanonicalEnvironment,
  withoutCanonicalEnvironmentKeys,
};
