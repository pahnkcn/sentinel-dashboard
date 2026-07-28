import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_PROFILE,
  generateSyntheticDataset,
} from './demo-data.mjs';
import {
  assertLocalEmulatorTarget,
  chunkWrites,
  documentWrite,
  toFirestoreValue,
} from './lib/firestore-rest.mjs';
import { publishDemoDataset } from './publish-demo-data.mjs';

const DEFAULT_FIRESTORE_HOST = '127.0.0.1:8080';
const DATASET_VERSION = 'demo-local-v2';
const DEFAULT_STUDENT_COUNT = 100;

function getLocalCalendarDate(clock = Date.now) {
  const now = new Date(clock());
  if (Number.isNaN(now.getTime())) throw new TypeError('Fixture clock must return a valid date');
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDatasetVersion(clock = Date.now) {
  const now = clock();
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new TypeError('Dataset clock must return a non-negative safe integer');
  }
  return `${DATASET_VERSION}-${now.toString(36)}`;
}

function createDemoDocuments({
  studentCount = DEFAULT_STUDENT_COUNT,
  endDate = getLocalCalendarDate(),
  seed = 'sentinel-local-emulator-v2',
  profile = DEFAULT_PROFILE,
} = {}) {
  return generateSyntheticDataset({ profile, studentCount, endDate, seed }).streams;
}

async function readDemoProjectId() {
  const firebaserc = JSON.parse(await readFile(new URL('../.firebaserc', import.meta.url), 'utf8'));
  const projectId = firebaserc?.projects?.default;
  if (typeof projectId !== 'string') throw new Error('Missing default Firebase project in .firebaserc');
  return projectId;
}

async function seedEmulator({
  studentCount = DEFAULT_STUDENT_COUNT,
  endDate = getLocalCalendarDate(),
  seed = 'sentinel-local-emulator-v2',
  request = fetch,
  clock = Date.now,
} = {}) {
  const projectId = await readDemoProjectId();
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || DEFAULT_FIRESTORE_HOST;
  assertLocalEmulatorTarget(projectId, emulatorHost);
  const dataset = generateSyntheticDataset({
    profile: DEFAULT_PROFILE,
    studentCount,
    endDate,
    seed,
  });
  const version = createDatasetVersion(clock);
  return publishDemoDataset({
    dataset,
    projectId,
    version,
    commit: true,
    emulatorHost,
    request,
    clock: () => new Date(clock()),
    onBatch: batch => console.log(
      `Seed batch ${batch.index}/${batch.total}: ${batch.size} synthetic records`,
    ),
  });
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

async function main(args = process.argv.slice(2)) {
  const studentCountText = readOption(args, '--students');
  const result = await seedEmulator({
    studentCount: studentCountText ? Number(studentCountText) : DEFAULT_STUDENT_COUNT,
    endDate: readOption(args, '--end-date') ?? getLocalCalendarDate(),
    seed: readOption(args, '--seed') ?? 'sentinel-local-emulator-v2',
  });
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export {
  assertLocalEmulatorTarget,
  chunkWrites,
  createDatasetVersion,
  createDemoDocuments,
  DATASET_VERSION,
  DEFAULT_STUDENT_COUNT,
  documentWrite,
  getLocalCalendarDate,
  seedEmulator,
  toFirestoreValue,
};
