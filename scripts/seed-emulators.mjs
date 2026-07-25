import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_FIRESTORE_HOST = '127.0.0.1:8080';
const DATASET_VERSION = 'local-large-v2';
const DEFAULT_STUDENT_COUNT = 250;
const MAX_STUDENT_COUNT = 250;
const COMMIT_BATCH_SIZE = 450;
const TRAINING_WEEKS = 16;
const ASSESSMENT_WEEKS = Object.freeze([0, 4, 8, 16]);
const ROOMS = Object.freeze(
  ['A', 'B', 'C', 'D', 'E'].flatMap(building => (
    Array.from({ length: 5 }, (_, index) => `${building}-${index + 101}`)
  )),
);
const REGIONS = Object.freeze(['เหนือ', 'กลาง', 'ตะวันออก', 'ตะวันออกเฉียงเหนือ', 'ใต้']);

function assertStudentCount(studentCount) {
  if (
    !Number.isInteger(studentCount)
    || studentCount < 1
    || studentCount > MAX_STUDENT_COUNT
  ) {
    throw new RangeError(
      `Student count must be an integer between 1 and ${MAX_STUDENT_COUNT}`,
    );
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getLocalCalendarDate(clock = Date.now) {
  const now = new Date(clock());
  if (Number.isNaN(now.getTime())) {
    throw new TypeError('Fixture clock must return a valid date');
  }

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('Fixture end date must be a valid YYYY-MM-DD calendar date');
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError('Fixture end date must be a valid YYYY-MM-DD calendar date');
  }
  return date;
}

function createDatasetVersion(clock = Date.now) {
  const now = clock();
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new TypeError('Dataset clock must return a non-negative safe integer');
  }
  return `${DATASET_VERSION}-${now.toString(36)}`;
}

function chunkWrites(writes, batchSize = COMMIT_BATCH_SIZE) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new RangeError('Firestore commit batch size must be between 1 and 500');
  }

  const batches = [];
  for (let offset = 0; offset < writes.length; offset += batchSize) {
    batches.push(writes.slice(offset, offset + batchSize));
  }
  return batches;
}

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

function createDemoDocuments({
  studentCount = DEFAULT_STUDENT_COUNT,
  endDate = getLocalCalendarDate(),
} = {}) {
  assertStudentCount(studentCount);
  const trainingEndDate = parseCalendarDate(endDate);

  const students = Array.from({ length: studentCount }, (_, index) => {
    const sequence = index + 1;
    const identifier = String(sequence).padStart(4, '0');
    const riskBand = (sequence * 37) % 100;
    const baseline = riskBand < 58 ? 'Low' : riskBand < 86 ? 'Moderate' : 'High';
    const tag = baseline === 'High'
      ? 'priority'
      : baseline === 'Moderate'
        ? 'follow-up'
        : 'stable';
    const mentalSeverity = sequence % 23 === 0
      ? 3
      : baseline === 'High' || sequence % 7 === 0
        ? 2
        : 1;

    return {
      id: `demo-${identifier}`,
      name: `Mock Student ${identifier}`,
      room: ROOMS[index % ROOMS.length],
      baseline,
      tag,
      demographics: {
        age: 18 + (index % 6),
        gender: index % 2 === 0 ? 'ชาย' : 'หญิง',
        region: REGIONS[index % REGIONS.length],
        school: `Demo School ${(index % 8) + 1}`,
        familyHistory: sequence % 29 === 0 ? 'มีประวัติครอบครัว (ข้อมูลจำลอง)' : '',
        financialBurden: sequence % 13 === 0 ? 'ติดตาม (ข้อมูลจำลอง)' : '',
        physicalIssueDetail: sequence % 31 === 0 ? 'ติดตามอาการบาดเจ็บจำลอง' : '',
        mentalIssueDetail: mentalSeverity === 3 ? 'ส่งต่อประเมินเพิ่มเติม (ข้อมูลจำลอง)' : '',
        mentalSeverity,
      },
    };
  });

  const startDate = new Date(trainingEndDate);
  startDate.setUTCDate(trainingEndDate.getUTCDate() - ((TRAINING_WEEKS - 1) * 7));
  const logs = [];
  for (let week = 1; week <= TRAINING_WEEKS; week += 1) {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + ((week - 1) * 7));
    const calendarDate = date.toISOString().slice(0, 10);

    for (const [index, student] of students.entries()) {
      const riskOffset = student.baseline === 'High'
        ? 18
        : student.baseline === 'Moderate'
          ? 8
          : 0;
      const signal = ((index + 1) * 17 + week * 13 + riskOffset) % 100;
      const self = signal < 50 ? 1 : signal < 72 ? 2 : signal < 90 ? 3 : 4;
      const peerDelta = ((index + week) % 3) - 1;
      const commandDelta = ((index * 2 + week) % 3) - 1;
      logs.push({
        id: `log-${student.id}-${calendarDate}`,
        studentId: student.id,
        date: calendarDate,
        week,
        self,
        buddy: week % 2 === 0 ? clamp(self + peerDelta, 1, 4) : null,
        command: week % 4 === 0 ? clamp(self + commandDelta, 1, 4) : null,
        physicalInjury: (index + week) % 97 === 0
          ? 3
          : (index * 3 + week) % 29 === 0
            ? 2
            : 1,
      });
    }
  }

  const assessments = [];
  for (const week of ASSESSMENT_WEEKS) {
    for (const [index, student] of students.entries()) {
      const resilienceWeek = week === 0 || week === 8 || week === 16;
      const period = week / 4;
      const baselineOffset = student.baseline === 'High'
        ? 2
        : student.baseline === 'Moderate'
          ? 1
          : 0;
      assessments.push({
        id: `assessment-${student.id}-${week}`,
        studentId: student.id,
        week,
        dass_d: clamp(1 + ((index + period) % 4) + baselineOffset, 1, 5),
        dass_a: clamp(1 + ((index + period + 1) % 4) + baselineOffset, 1, 5),
        dass_s: clamp(1 + ((index + period + 2) % 4) + baselineOffset, 1, 5),
        cd_risc: resilienceWeek
          ? clamp(19 + ((index * 7 + week) % 19) - baselineOffset * 2, 0, 40)
          : null,
        grit: resilienceWeek
          ? clamp(15 + ((index * 5 + week) % 16) - baselineOffset, 0, 32)
          : null,
        drawing_note: week === 0 && (index + 1) % 41 === 0
          ? 'บันทึกตัวอย่างสำหรับทดสอบการแสดงผลเท่านั้น'
          : '',
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

async function commitBatch({ host, projectId, writes, request = fetch }) {
  let response;
  try {
    response = await request(
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
  } catch {
    throw new Error(
      `Cannot reach the Firestore emulator at ${host}. `
      + 'Run "npm.cmd run emulators" in another terminal and leave it running, '
      + 'then run this seed command again.',
    );
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firestore emulator seed failed (${response.status}): ${detail}`);
  }
}

async function seedEmulator() {
  const projectId = await readDemoProjectId();
  const host = process.env.FIRESTORE_EMULATOR_HOST || DEFAULT_FIRESTORE_HOST;
  assertLocalEmulatorTarget(projectId, host);

  const streams = createDemoDocuments();
  const version = createDatasetVersion();
  const writes = [];
  for (const [stream, documents] of Object.entries(streams)) {
    for (const document of documents) {
      writes.push(documentWrite(
        projectId,
        `monitoringDatasets/${version}/${stream}/${document.id}`,
        document,
      ));
    }
  }

  const batches = chunkWrites(writes);
  for (const [index, batch] of batches.entries()) {
    await commitBatch({ host, projectId, writes: batch });
    console.log(`Seed batch ${index + 1}/${batches.length}: ${batch.length} records`);
  }

  // Publish a fresh immutable version only after every record is available.
  await commitBatch({
    host,
    projectId,
    writes: [
      documentWrite(
        projectId,
        'monitoringManifests/current',
        { version },
      ),
    ],
  });

  console.log(
    `Seeded ${writes.length} synthetic records and manifest ${version} into ${projectId}.`,
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
  chunkWrites,
  commitBatch,
  createDatasetVersion,
  createDemoDocuments,
  DEFAULT_STUDENT_COUNT,
  DATASET_VERSION,
  documentWrite,
  getLocalCalendarDate,
  seedEmulator,
  toFirestoreValue,
};
