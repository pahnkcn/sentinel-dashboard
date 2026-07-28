import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  assertProjectId,
  commitWrites,
  documentWrite,
  getAdcAccessToken,
} from './lib/firestore-rest.mjs';

const AUTHORIZED_ROLES = new Set(['clinician', 'admin']);

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function normalizeEmail(email) {
  if (typeof email !== 'string') throw new TypeError('Email is required');
  const normalized = email.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if (
    normalized.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new TypeError('Email must be a valid address');
  }
  return normalized;
}

function authorizedUserDocumentId(email) {
  return createHash('sha256').update(normalizeEmail(email), 'utf8').digest('hex');
}

function parseProvisionArgs(args) {
  const email = readOption(args, '--email');
  const role = readOption(args, '--role');
  const projectId = readOption(args, '--project-id');
  if (!email) throw new Error('--email is required');
  if (!role) throw new Error('--role clinician|admin is required');
  if (!projectId) throw new Error('--project-id is required even for dry-run');
  return {
    email,
    role,
    projectId,
    enabled: !args.includes('--disable'),
    commit: args.includes('--commit'),
    emulatorHost: readOption(args, '--emulator-host'),
  };
}

async function provisionAuthorizedUser({
  email,
  role,
  enabled = true,
  projectId,
  commit = false,
  emulatorHost,
  request = fetch,
  getAccessToken = getAdcAccessToken,
  clock = () => new Date(),
}) {
  assertProjectId(projectId);
  const normalizedEmail = normalizeEmail(email);
  if (!AUTHORIZED_ROLES.has(role)) throw new Error('Role must be clinician or admin');
  if (typeof enabled !== 'boolean') throw new TypeError('Enabled must be boolean');
  const documentId = authorizedUserDocumentId(normalizedEmail);
  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    projectId,
    documentPath: `authorizedUsers/${documentId}`,
    email: normalizedEmail,
    role,
    enabled,
  };
  if (!commit) return summary;

  const updatedAt = clock();
  if (!(updatedAt instanceof Date) || Number.isNaN(updatedAt.getTime())) {
    throw new TypeError('Provisioning clock must return a valid Date');
  }
  await commitWrites({
    projectId,
    writes: [documentWrite(projectId, summary.documentPath, {
      email: normalizedEmail,
      role,
      enabled,
      updatedAt,
    })],
    emulatorHost,
    request,
    getAccessToken,
  });
  return { ...summary, updatedAt: updatedAt.toISOString() };
}

async function main(args = process.argv.slice(2)) {
  const options = parseProvisionArgs(args);
  const summary = await provisionAuthorizedUser(options);
  console.log(JSON.stringify(summary, null, 2));
  if (!options.commit) {
    console.log('Dry-run only. Re-run with --commit after reviewing this user and project.');
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export {
  AUTHORIZED_ROLES,
  authorizedUserDocumentId,
  normalizeEmail,
  parseProvisionArgs,
  provisionAuthorizedUser,
};
