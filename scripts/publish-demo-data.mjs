import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { validateSyntheticDataset } from './demo-data.mjs';
import {
  assertProjectId,
  chunkWrites,
  commitWrites,
  documentWrite,
  getAdcAccessToken,
} from './lib/firestore-rest.mjs';

const VERSION_PATTERN = /^demo-[A-Za-z0-9][A-Za-z0-9._-]{0,122}$/;

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function parsePublishArgs(args) {
  const datasetPath = readOption(args, '--dataset');
  const projectId = readOption(args, '--project-id');
  const version = readOption(args, '--version');
  if (!datasetPath) throw new Error('--dataset <synthetic.json> is required');
  if (!projectId) throw new Error('--project-id is required even for dry-run');
  if (!version) throw new Error('--version is required even for dry-run');
  return {
    datasetPath,
    projectId,
    version,
    commit: args.includes('--commit'),
    emulatorHost: readOption(args, '--emulator-host'),
  };
}

function assertDatasetVersion(version) {
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new Error('Dataset version must start with demo- and contain only safe characters');
  }
  return version;
}

function createDatasetWrites(projectId, version, dataset) {
  assertProjectId(projectId);
  assertDatasetVersion(version);
  validateSyntheticDataset(dataset);

  const writes = [];
  for (const stream of ['students', 'logs', 'assessments']) {
    for (const record of dataset.streams[stream]) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(record.id)) {
        throw new Error(`${stream} contains an unsafe document ID`);
      }
      writes.push(documentWrite(
        projectId,
        `monitoringDatasets/${version}/${stream}/${record.id}`,
        record,
        { exists: false },
      ));
    }
  }
  return writes;
}

async function publishDemoDataset({
  dataset,
  projectId,
  version,
  commit = false,
  emulatorHost,
  request = fetch,
  getAccessToken = getAdcAccessToken,
  clock = () => new Date(),
  onBatch = () => {},
}) {
  const writes = createDatasetWrites(projectId, version, dataset);
  const batches = chunkWrites(writes);
  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    projectId,
    version,
    dataClassification: dataset.manifest.dataClassification,
    schemaVersion: dataset.manifest.schemaVersion,
    recordCount: writes.length,
    batchCount: batches.length,
    manifestPath: 'monitoringManifests/current',
  };
  if (!commit) return summary;

  const accessToken = emulatorHost ? null : await getAccessToken();
  const tokenProvider = accessToken ? async () => accessToken : getAccessToken;
  for (const [index, batch] of batches.entries()) {
    await commitWrites({
      projectId,
      writes: batch,
      emulatorHost,
      request,
      getAccessToken: tokenProvider,
    });
    onBatch({ index: index + 1, total: batches.length, size: batch.length });
  }

  const publishedAt = clock();
  if (!(publishedAt instanceof Date) || Number.isNaN(publishedAt.getTime())) {
    throw new TypeError('Publisher clock must return a valid Date');
  }
  await commitWrites({
    projectId,
    writes: [documentWrite(projectId, 'monitoringManifests/current', {
      version,
      schemaVersion: dataset.manifest.schemaVersion,
      dataClassification: dataset.manifest.dataClassification,
      publishedAt,
    })],
    emulatorHost,
    request,
    getAccessToken: tokenProvider,
  });

  return { ...summary, publishedAt: publishedAt.toISOString() };
}

async function main(args = process.argv.slice(2)) {
  const options = parsePublishArgs(args);
  const dataset = JSON.parse(await readFile(options.datasetPath, 'utf8'));
  const summary = await publishDemoDataset({
    ...options,
    dataset,
    onBatch: batch => console.log(
      `Committed immutable batch ${batch.index}/${batch.total} (${batch.size} records)`,
    ),
  });
  console.log(JSON.stringify(summary, null, 2));
  if (!options.commit) {
    console.log('Dry-run only. Re-run with --commit after reviewing this summary.');
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
  assertDatasetVersion,
  createDatasetWrites,
  parsePublishArgs,
  publishDemoDataset,
};
