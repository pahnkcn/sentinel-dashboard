import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_FIRESTORE_HOST = '127.0.0.1:8080';
const DATASET_VERSION = 'local-demo-v1';

function assertLocalEmulatorTarget(projectId, host) {
  if (!/^demo-[a-z0-9-]+$/.test(projectId)) {
    throw new Error('Refusing to seed: Firebase project ID must start with demo-');
  }
  if (!/^(?:127\.0\.0\.1|localhost):\d{1,5}$/.test(host)) {
    throw new Error('Refusing to seed: Firestore emulator must use a loopback host');
  }
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }

  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'boolean':
      return { booleanValue: value };
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Fixture numbers must be finite');
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    case 'object':
      return {
        mapValue: {
          fields: Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, toFirestoreValue(entry)]),
          ),
        },
      };
    default:
      throw new TypeError(`Unsupported fixture value: ${typeof value}`);
  }
}

function documentWrite(projectId, path, data) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${path}`,
      fields: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]),
      ),
    },
  };
}

function createDemoDocuments() {
  const students = [
    { id: 'demo-001', name: 'Demo Student 01', room: 'A-101', baseline: 'Low', tag: 'stable' },
    { id: 'demo-002', name: 'Demo Student 02', room: 'A-101', baseline: 'Moderate', tag: 'follow-up' },
    { id: 'demo-003', name: 'Demo Student 03', room: 'A-102', baseline: 'Low', tag: 'stable' },
    { id: 'demo-004', name: 'Demo Student 04', room: 'A-102', baseline: 'High', tag: 'priority' },
    { id: 'demo-005', name: 'Demo Student 05', room: 'B-201', baseline: 'Moderate', tag: 'follow-up' },
    { id: 'demo-006', name: 'Demo Student 06', room: 'B-201', baseline: 'Low', tag: 'stable' },
  ].map((student, index) => ({
    ...student,
    demographics: {
      age: 18 + (index % 3),
      gender: index % 2 === 0 ? 'ชาย' : 'หญิง',
      region: ['เหนือ', 'กลาง', 'ตะวันออก'][index % 3],
      school: 'Demo School',
      familyHistory: '',
      financialBurden: index === 4 ? 'ติดตาม' : '',
      physicalIssueDetail: '',
      mentalIssueDetail: '',
      mentalSeverity: index === 3 ? 3 : index === 1 || index === 4 ? 2 : 1,
    },
  }));

  const startDate = new Date('2026-05-04T00:00:00.000Z');
  const logs = [];
  for (let week = 1; week <= 12; week += 1) {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + ((week - 1) * 7));
    const calendarDate = date.toISOString().slice(0, 10);

    for (const [index, student] of students.entries()) {
      const concernOffset = student.id === 'demo-004' ? 2 : student.id === 'demo-002' ? 1 : 0;
      const self = Math.min(4, 1 + ((week + index + concernOffset) % 3) + concernOffset);
      logs.push({
        id: `log-${student.id}-${calendarDate}`,
        studentId: student.id,
        date: calendarDate,
        week,
        self,
        buddy: week % 2 === 0 ? Math.min(4, self + (index % 2)) : null,
        command: week % 4 === 0 ? Math.min(4, self + (index % 2)) : null,
        physicalInjury: student.id === 'demo-005' && week >= 10 ? 2 : 1,
      });
    }
  }

  const assessments = [];
  for (const week of [0, 4, 8]) {
    for (const [index, student] of students.entries()) {
      const resilienceWeek = week === 0 || week === 8;
      assessments.push({
        id: `assessment-${student.id}-${week}`,
        studentId: student.id,
        week,
        dass_d: Math.min(5, 1 + ((week / 4 + index) % 3)),
        dass_a: Math.min(5, 1 + ((week / 4 + index + 1) % 3)),
        dass_s: Math.min(5, 1 + ((week / 4 + index + 2) % 3)),
        cd_risc: resilienceWeek ? 24 + index : null,
        grit: resilienceWeek ? 20 + index : null,
        drawing_note: '',
      });
    }
  }

  return { students, logs, assessments };
}

async function readDemoProjectId() {
  const firebaserc = JSON.parse(await readFile(new URL('../.firebaserc', import.meta.url), 'utf8'));
  const projectId = firebaserc?.projects?.default;
  if (typeof projectId !== 'string') {
    throw new Error('Missing default Firebase project in .firebaserc');
  }
  return projectId;
}

async function seedEmulator() {
  const projectId = await readDemoProjectId();
  const host = process.env.FIRESTORE_EMULATOR_HOST || DEFAULT_FIRESTORE_HOST;
  assertLocalEmulatorTarget(projectId, host);

  const streams = createDemoDocuments();
  const writes = [];
  for (const [stream, documents] of Object.entries(streams)) {
    for (const document of documents) {
      writes.push(documentWrite(
        projectId,
        `monitoringDatasets/${DATASET_VERSION}/${stream}/${document.id}`,
        document,
      ));
    }
  }

  // The manifest is intentionally the final write so clients never select an
  // incomplete dataset version.
  writes.push(documentWrite(
    projectId,
    'monitoringManifests/current',
    { version: DATASET_VERSION },
  ));

  const response = await fetch(
    `http://${host}/v1/projects/${projectId}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firestore emulator seed failed (${response.status}): ${detail}`);
  }

  console.log(
    `Seeded ${writes.length - 1} synthetic records and manifest ${DATASET_VERSION} into ${projectId}.`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  seedEmulator().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export {
  assertLocalEmulatorTarget,
  createDemoDocuments,
  DATASET_VERSION,
  documentWrite,
  seedEmulator,
  toFirestoreValue,
};
