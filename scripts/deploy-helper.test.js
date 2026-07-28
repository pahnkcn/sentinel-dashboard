import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  attachChildLifecycle,
  assertNoEmulatorEnvironment,
  assertNodeVersion,
  assertProductionConfirmation,
  assertSameVercelLink,
  buildLocalChildEnvironment,
  buildDeploymentPlan,
  buildLocalPlan,
  executePlan,
  findSensitiveTrackedPaths,
  formatNpmCommand,
  LOCAL_EMULATOR_HOST,
  LOCAL_PROJECT_ID,
  main,
  parseCliArgs,
  parseDotEnv,
  readVercelLink,
  resolveNpmLaunch,
  scanBrowserDirectory,
  scanVercelBuildOutput,
  stopOwnedProcess,
  validateLocalEnvironment,
  validateTargetEnvironment,
  waitForChild,
  withCanonicalEnvironment,
  withoutCanonicalEnvironmentKeys,
} from './deploy-helper.mjs';

function validLocalEnvironment(overrides = {}) {
  return {
    VITE_GOOGLE_CLIENT_ID: '123456-example.apps.googleusercontent.com',
    GOOGLE_CLIENT_ID: '123456-example.apps.googleusercontent.com',
    SESSION_SECRET: 'a-secure-local-session-secret-with-32-bytes',
    GCP_PROJECT_ID: LOCAL_PROJECT_ID,
    FIRESTORE_EMULATOR_HOST: LOCAL_EMULATOR_HOST,
    ...overrides,
  };
}

test('parses a bounded local workflow without accepting command passthrough', () => {
  const parsed = parseCliArgs([
    'local',
    '--email',
    ' Clinician@Example.com ',
    '--role',
    'admin',
    '--end-date',
    '2026-07-28',
    '--students',
    '107',
    '--seed',
    'reviewed-demo-v2',
    '--port',
    '3100',
  ]);
  assert.deepEqual(parsed, {
    command: 'local',
    options: {
      dryRun: false,
      email: 'clinician@example.com',
      role: 'admin',
      endDate: '2026-07-28',
      students: 107,
      seed: 'reviewed-demo-v2',
      port: 3100,
    },
  });
  assert.throws(
    () => parseCliArgs(['preview', '--prod']),
    /Unknown option/,
  );
  assert.throws(
    () => parseCliArgs(['local', '--email', 'a@example.com', '--email', 'b@example.com']),
    /only once/,
  );
  assert.throws(
    () => parseCliArgs(['local', '--email', 'a@example.com', '&&', 'vercel', '--prod']),
    /Unexpected positional argument/,
  );
});

test('production accepts only its explicit confirmation option', () => {
  assert.deepEqual(
    parseCliArgs(['production', '--confirm-project', 'sentinel-dashboard']),
    {
      command: 'production',
      options: { dryRun: false, confirmProject: 'sentinel-dashboard' },
    },
  );
  assert.throws(
    () => parseCliArgs(['production', '--email', 'a@example.com']),
    /not allowed/,
  );
});

test('preview plans never contain production flags and production targets both build and deploy', () => {
  const preview = buildDeploymentPlan('preview');
  const production = buildDeploymentPlan('production');
  const previewArgs = preview.flatMap(step => step.npmArgs ?? []);
  const productionArgs = production.flatMap(step => step.npmArgs ?? []);
  assert.equal(previewArgs.includes('--prod'), false);
  assert.equal(productionArgs.filter(value => value === '--prod').length, 2);
  assert.deepEqual(preview.at(-1).npmArgs, [
    'exec',
    '--',
    'vercel',
    'deploy',
    '--prebuilt',
    '--project',
    '<LINKED_PROJECT_ID>',
    '--yes',
  ]);
  assert.deepEqual(production.at(-1).npmArgs, [
    'exec',
    '--',
    'vercel',
    'deploy',
    '--prebuilt',
    '--prod',
    '--project',
    '<LINKED_PROJECT_ID>',
    '--yes',
  ]);
  for (const step of buildDeploymentPlan('preview', { projectId: 'prj_exact' })) {
    if (step.npmArgs?.includes('vercel')) {
      assert.equal(step.npmArgs[step.npmArgs.indexOf('--project') + 1], 'prj_exact');
    }
  }
});

test('local plan commits writes only to the guarded emulator target', () => {
  const options = parseCliArgs([
    'local',
    '--email',
    'clinician@example.com',
    '--end-date',
    '2026-07-28',
  ]).options;
  const plan = buildLocalPlan(options);
  const provision = plan.find(step => step.label.includes('Provision'));
  assert.ok(provision.npmArgs.includes('--commit'));
  assert.equal(
    provision.npmArgs[provision.npmArgs.indexOf('--project-id') + 1],
    LOCAL_PROJECT_ID,
  );
  assert.equal(
    provision.npmArgs[provision.npmArgs.indexOf('--emulator-host') + 1],
    LOCAL_EMULATOR_HOST,
  );
  assert.equal(plan.some(step => step.npmArgs.includes('demo:publish')), false);
  assert.equal(plan.some(step => step.npmArgs.includes('--prod')), false);
});

test('dotenv parser handles BOM, CRLF, export, and quoted values without expansion', () => {
  const values = parseDotEnv(
    '\uFEFFVITE_GOOGLE_CLIENT_ID="123.apps.googleusercontent.com"\r\n'
      + 'export GOOGLE_CLIENT_ID=123.apps.googleusercontent.com\r\n'
      + "SESSION_SECRET='literal-$VALUE-secret-that-is-long-enough'\r\n",
  );
  assert.deepEqual(values, {
    VITE_GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com',
    GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com',
    SESSION_SECRET: 'literal-$VALUE-secret-that-is-long-enough',
  });
  assert.throws(
    () => parseDotEnv('GCP_PROJECT_ID=demo\ngcp_project_id=other'),
    /duplicate variable GCP_PROJECT_ID/,
  );
  assert.throws(
    () => parseDotEnv('SESSION_SECRET="unterminated'),
    /unmatched quote/,
  );
});

test('local environment fails closed on placeholders, remote targets, and case variants', () => {
  assert.deepEqual(validateLocalEnvironment(validLocalEnvironment()), {
    emulatorHost: LOCAL_EMULATOR_HOST,
    projectId: LOCAL_PROJECT_ID,
  });
  assert.throws(
    () => validateLocalEnvironment(validLocalEnvironment({ SESSION_SECRET: 'short' })),
    /at least 32/,
  );
  assert.throws(
    () => validateLocalEnvironment(validLocalEnvironment({ SESSION_SECRET: ' '.repeat(40) })),
    /at least 32/,
  );
  assert.throws(
    () => validateLocalEnvironment(validLocalEnvironment({ GCP_PROJECT_ID: 'production-project' })),
    /demo-sentinel-dashboard/,
  );
  assert.throws(
    () => validateLocalEnvironment(validLocalEnvironment({ FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com' })),
    /127\.0\.0\.1:8080/,
  );
  assert.throws(
    () => validateLocalEnvironment(validLocalEnvironment({
      GCP_SERVICE_ACCOUNT_EMAIL: 'reader@production.iam.gserviceaccount.com',
    })),
    /GCP_SERVICE_ACCOUNT_EMAIL must not be stored/,
  );
  const caseVariant = validLocalEnvironment();
  caseVariant.firestore_emulator_host = caseVariant.FIRESTORE_EMULATOR_HOST;
  delete caseVariant.FIRESTORE_EMULATOR_HOST;
  assert.throws(
    () => validateLocalEnvironment(caseVariant),
    /exact environment variable name FIRESTORE_EMULATOR_HOST/,
  );
});

test('target environments keep Preview isolated and require the complete Production identity', () => {
  const browserSession = {
    VITE_GOOGLE_CLIENT_ID: '123456-preview.apps.googleusercontent.com',
    GOOGLE_CLIENT_ID: '123456-preview.apps.googleusercontent.com',
    SESSION_SECRET: 'a-target-session-secret-that-is-long-enough',
  };
  assert.deepEqual(
    validateTargetEnvironment(browserSession, { target: 'preview' }),
    { target: 'preview' },
  );
  assert.throws(
    () => validateTargetEnvironment({
      ...browserSession,
      GCP_PROJECT_ID: 'production-project',
    }, { target: 'preview' }),
    /Preview must not define production credential variable GCP_PROJECT_ID/,
  );
  const production = {
    ...browserSession,
    GCP_PROJECT_ID: 'synthetic-production-project',
    GCP_PROJECT_NUMBER: '123456789',
    GCP_SERVICE_ACCOUNT_EMAIL: 'reader@synthetic-production-project.iam.gserviceaccount.com',
    GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
    GCP_WORKLOAD_IDENTITY_PROVIDER_ID: 'vercel-provider',
  };
  assert.deepEqual(
    validateTargetEnvironment(production, { target: 'production' }),
    { target: 'production' },
  );
  assert.throws(
    () => validateTargetEnvironment({
      ...production,
      FIRESTORE_EMULATOR_HOST: LOCAL_EMULATOR_HOST,
    }, { target: 'production' }),
    /must not define FIRESTORE_EMULATOR_HOST/,
  );
});

test('environment overrides replace case variants instead of creating bypasses', () => {
  assert.deepEqual(
    withCanonicalEnvironment(
      { Firestore_Emulator_Host: 'remote:8080', PATH: 'x' },
      { FIRESTORE_EMULATOR_HOST: LOCAL_EMULATOR_HOST },
    ),
    { PATH: 'x', FIRESTORE_EMULATOR_HOST: LOCAL_EMULATOR_HOST },
  );
  assert.throws(
    () => assertNoEmulatorEnvironment({ firestore_emulator_host: LOCAL_EMULATOR_HOST }),
    /Unset FIRESTORE_EMULATOR_HOST/,
  );
  assert.deepEqual(
    withoutCanonicalEnvironmentKeys(
      { Google_Application_Credentials: 'unsafe.json', PATH: 'x' },
      ['GOOGLE_APPLICATION_CREDENTIALS'],
    ),
    { PATH: 'x' },
  );
});

test('local child receives validated login values but no inherited production identity', () => {
  const environment = validLocalEnvironment({
    OPENROUTER_MODEL: 'z-ai/glm-5.2',
  });
  const child = buildLocalChildEnvironment(environment, {
    PATH: 'x',
    Firestore_Emulator_Host: 'remote.example:8080',
    GCP_PROJECT_ID: 'production-project',
    GCP_SERVICE_ACCOUNT_EMAIL: 'reader@production.iam.gserviceaccount.com',
    VERCEL_OIDC_TOKEN: 'must-not-survive',
  });
  assert.equal(child.VITE_GOOGLE_CLIENT_ID, environment.VITE_GOOGLE_CLIENT_ID);
  assert.equal(child.GOOGLE_CLIENT_ID, environment.GOOGLE_CLIENT_ID);
  assert.equal(child.SESSION_SECRET, environment.SESSION_SECRET);
  assert.equal(child.OPENROUTER_MODEL, 'z-ai/glm-5.2');
  assert.equal(child.GCP_PROJECT_ID, LOCAL_PROJECT_ID);
  assert.equal(child.FIRESTORE_EMULATOR_HOST, LOCAL_EMULATOR_HOST);
  assert.equal(child.GCP_SERVICE_ACCOUNT_EMAIL, undefined);
  assert.equal(child.VERCEL_OIDC_TOKEN, undefined);
});

test('production confirmation and Node runtime checks fail closed', () => {
  const link = {
    projectId: 'prj_123',
    projectName: 'sentinel-dashboard',
    orgId: 'team_123',
  };
  assert.doesNotThrow(() => assertProductionConfirmation(link, 'sentinel-dashboard'));
  assert.doesNotThrow(() => assertProductionConfirmation(link, 'prj_123'));
  assert.throws(() => assertProductionConfirmation(link, 'another-project'), /does not match/);
  assert.doesNotThrow(() => assertSameVercelLink(link, { ...link }));
  assert.throws(
    () => assertSameVercelLink(link, { ...link, projectId: 'prj_changed' }),
    /changed during the deployment gate/,
  );
  assert.equal(assertNodeVersion('22.18.0'), null);
  assert.match(assertNodeVersion('24.0.0'), /Node 22/);
  assert.throws(
    () => assertNodeVersion('24.0.0', { production: true }),
    /Node 22/,
  );
});

test('tracked-artifact classifier permits templates but blocks workbook and key material', () => {
  assert.deepEqual(findSensitiveTrackedPaths([
    '.env.example',
    '.env.development.example',
    'README.md',
  ]), []);
  assert.deepEqual(findSensitiveTrackedPaths([
    '.generated/sentinel.json',
    'private/information dashboard.xlsx',
    'ops/service-account.json',
    'cert/private.key',
  ]), [
    '.generated/sentinel.json',
    'private/information dashboard.xlsx',
    'ops/service-account.json',
    'cert/private.key',
  ]);
});

test('reads only a complete Vercel link file', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-link-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(() => readVercelLink(root), /vercel link/);
  await mkdir(path.join(root, '.vercel'));
  await writeFile(path.join(root, '.vercel', 'project.json'), JSON.stringify({
    orgId: 'team_123',
    projectId: 'prj_123',
    projectName: 'sentinel-dashboard',
  }));
  assert.deepEqual(await readVercelLink(root), {
    orgId: 'team_123',
    projectId: 'prj_123',
    projectName: 'sentinel-dashboard',
  });
});

test('browser scanner reports marker names without exposing secret values', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-bundle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist', 'safe.js'), 'console.log("synthetic")');
  assert.deepEqual(
    await scanBrowserDirectory('dist', { root, secretMarkers: [] }),
    { directory: 'dist', fileCount: 1 },
  );

  await writeFile(path.join(root, 'dist', 'unsafe.js'), 'const sdk = "firebase/auth";');
  await assert.rejects(
    () => scanBrowserDirectory('dist', { root, secretMarkers: [] }),
    /Firebase browser runtime.*unsafe\.js/,
  );
  await writeFile(path.join(root, 'dist', 'unsafe.js'), 'const value = "top-secret-value";');
  await assert.rejects(
    () => scanBrowserDirectory('dist', {
      root,
      secretMarkers: [{ key: 'SESSION_SECRET', value: 'top-secret-value' }],
    }),
    error => error.message.includes('SESSION_SECRET') && !error.message.includes('top-secret-value'),
  );
});

test('Vercel output scanner checks Function output for exact secrets', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-vercel-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const functionDirectory = path.join(root, '.vercel', 'output', 'functions', 'api.func');
  await mkdir(functionDirectory, { recursive: true });
  await writeFile(path.join(functionDirectory, 'index.js'), 'const value = "function-secret";');
  await assert.rejects(
    () => scanVercelBuildOutput('production', {
      root,
      secretMarkers: [{ key: 'SESSION_SECRET', value: 'function-secret' }],
    }),
    error => error.message.includes('SESSION_SECRET') && !error.message.includes('function-secret'),
  );
});

test('plan execution is sequential and fails before any deploy step after a check failure', async () => {
  const calls = [];
  const plan = buildDeploymentPlan('preview');
  await assert.rejects(
    () => executePlan(plan, {
      logger: () => {},
      runNpmImplementation: async args => {
        calls.push(args);
        throw new Error('test failure');
      },
    }),
    /test failure/,
  );
  assert.deepEqual(calls, [['test']]);
});

test('npm launcher keeps user values as distinct argv elements and never uses a shell string', () => {
  const launch = resolveNpmLaunch(
    ['run', 'auth:provision', '--', '--email', 'person+test@example.com'],
    {
      environment: { npm_execpath: 'C:\\npm\\npm-cli.js' },
      executable: 'C:\\node\\node.exe',
      fileExists: candidate => candidate === 'C:\\npm\\npm-cli.js',
    },
  );
  assert.deepEqual(launch, {
    command: 'C:\\node\\node.exe',
    args: [
      'C:\\npm\\npm-cli.js',
      'run',
      'auth:provision',
      '--',
      '--email',
      'person+test@example.com',
    ],
  });
  assert.match(formatNpmCommand(['run', 'test:rules']), /^npm run test:rules$/);
});

test('Windows cleanup targets only the owned positive child PID', async () => {
  const calls = [];
  const child = { exitCode: null, signalCode: null, pid: 4321 };
  const spawnImplementation = (command, args, options) => {
    calls.push({ command, args, options });
    return { exitCode: 0, signalCode: null };
  };
  await stopOwnedProcess(child, { platform: 'win32', spawnImplementation });
  assert.deepEqual(calls[0].command, 'taskkill.exe');
  assert.deepEqual(calls[0].args, ['/PID', '4321', '/T', '/F']);
  await stopOwnedProcess({ exitCode: null, signalCode: null, pid: 0 }, {
    platform: 'win32',
    spawnImplementation,
  });
  assert.equal(calls.length, 1);
});

test('child lifecycle attaches a spawn-error listener immediately', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  attachChildLifecycle(child);
  assert.equal(child.listenerCount('error'), 1);
  const completion = waitForChild(child);
  child.emit('error', new Error('spawn failed'));
  await assert.rejects(() => completion, /spawn failed/);
});

test('dry-run commands need no Vercel link and make no process calls', async () => {
  const output = [];
  await main(['preview', '--dry-run'], { logger: value => output.push(value) });
  assert.ok(output.some(line => line.includes('Deploy Vercel Preview')));
  assert.equal(output.some(line => line.includes('--prod')), false);

  const localOutput = [];
  await main([
    'local',
    '--email',
    'clinician@example.com',
    '--end-date',
    '2026-07-28',
    '--dry-run',
  ], { logger: value => localOutput.push(value) });
  assert.ok(localOutput.some(line => line.includes('demo-sentinel-dashboard')));
});
