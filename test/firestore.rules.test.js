import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';

import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-sentinel-dashboard-rules';
const RULES_URL = new URL('../firestore.rules', import.meta.url);
const CURRENT_VERSION = 'demo-release-1';

let testEnvironment;

function protectedReferences(db) {
  return [
    doc(db, 'monitoringManifests', 'current'),
    doc(db, 'monitoringDatasets', CURRENT_VERSION, 'students', 'demo-0001'),
    doc(db, 'monitoringDatasets', CURRENT_VERSION, 'logs', 'demo-log-0001'),
    doc(db, 'monitoringDatasets', CURRENT_VERSION, 'assessments', 'demo-assessment-0001'),
    doc(db, 'authorizedUsers', 'synthetic-email-hash'),
  ];
}

before(async () => {
  const rules = await readFile(RULES_URL, 'utf8');

  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules,
    },
  });

  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const reference of protectedReferences(db)) {
      await setDoc(reference, { synthetic: true });
    }
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

for (const [label, createContext] of [
  ['unauthenticated', environment => environment.unauthenticatedContext()],
  ['Firebase-authenticated', environment => environment.authenticatedContext('demo-user', {
    email: 'demo@example.invalid',
    email_verified: true,
    sentinelRole: 'admin',
  })],
]) {
  test(`${label} clients cannot read any Firestore document or collection`, async () => {
    const db = createContext(testEnvironment).firestore();

    for (const reference of protectedReferences(db)) {
      await assertFails(getDoc(reference));
    }
    await assertFails(getDocs(collection(db, 'monitoringManifests')));
    await assertFails(getDocs(collection(
      db,
      'monitoringDatasets',
      CURRENT_VERSION,
      'students',
    )));
  });
}

test('all client create, update, and delete operations are denied', async () => {
  const db = testEnvironment.authenticatedContext('demo-admin', {
    email_verified: true,
    sentinelRole: 'admin',
  }).firestore();
  const [manifest, student] = protectedReferences(db);

  await assertFails(setDoc(doc(db, 'private', 'new'), { synthetic: true }));
  await assertFails(updateDoc(manifest, { version: 'demo-release-2' }));
  await assertFails(deleteDoc(student));
});

test('nested and unknown paths are denied without future-rule inheritance', async () => {
  const db = testEnvironment.authenticatedContext('demo-clinician', {
    email_verified: true,
    sentinelRole: 'clinician',
  }).firestore();

  await assertFails(getDoc(doc(db, 'private', 'secret')));
  await assertFails(getDoc(doc(
    db,
    'monitoringDatasets',
    CURRENT_VERSION,
    'students',
    'demo-0001',
    'nested',
    'secret',
  )));
});
