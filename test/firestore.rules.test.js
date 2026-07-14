import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';

import {
  assertFails,
  assertSucceeds,
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
const PROTECTED_COLLECTIONS = ['students', 'logs', 'assessments'];
const CURRENT_VERSION = 'release-1';

let testEnvironment;

function manifestReference(db, documentId = 'current') {
  return doc(db, 'monitoringManifests', documentId);
}

function recordCollection(db, collectionName, version = CURRENT_VERSION) {
  return collection(db, 'monitoringDatasets', version, collectionName);
}

function recordReference(db, collectionName, version = CURRENT_VERSION) {
  return doc(recordCollection(db, collectionName, version), 'seed');
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
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(manifestReference(db), { version: CURRENT_VERSION });

    for (const collectionName of PROTECTED_COLLECTIONS) {
      await setDoc(recordReference(db, collectionName), { seeded: true });
      await setDoc(
        doc(recordReference(db, collectionName), 'nested', 'secret'),
        { seeded: true },
      );
      await setDoc(recordReference(db, collectionName, 'release-0'), { seeded: true });
      await setDoc(recordReference(db, collectionName, 'release-2'), { seeded: true });
      await setDoc(doc(db, collectionName, 'legacy'), { seeded: true });
    }

    await setDoc(manifestReference(db, 'candidate'), { version: 'release-2' });
    await setDoc(doc(db, 'monitoringDatasets', CURRENT_VERSION, 'private', 'seed'), {
      seeded: true,
    });
    await setDoc(doc(db, 'private', 'seed'), { seeded: true });
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test('unauthenticated users cannot read protected data', async () => {
  const db = testEnvironment.unauthenticatedContext().firestore();

  await assertFails(getDoc(manifestReference(db)));
  for (const collectionName of PROTECTED_COLLECTIONS) {
    await assertFails(getDoc(recordReference(db, collectionName)));
  }
});

test('anonymous users without claims cannot read protected data', async () => {
  const db = testEnvironment.authenticatedContext('anonymous-user', {
    firebase: { sign_in_provider: 'anonymous' },
  }).firestore();

  await assertFails(getDoc(manifestReference(db)));
  await assertFails(getDoc(recordReference(db, 'students')));
});

test('ordinary verified users cannot read protected data', async () => {
  const db = testEnvironment.authenticatedContext('verified-user', {
    email_verified: true,
  }).firestore();

  await assertFails(getDoc(manifestReference(db)));
  await assertFails(getDoc(recordReference(db, 'students')));
});

test('unverified clinicians cannot read protected data', async () => {
  const db = testEnvironment.authenticatedContext('unverified-clinician', {
    email_verified: false,
    sentinelRole: 'clinician',
  }).firestore();

  await assertFails(getDoc(manifestReference(db)));
  await assertFails(getDoc(recordReference(db, 'students')));
});

for (const role of ['clinician', 'admin']) {
  test(`${role} users can read the exact manifest and current dataset`, async () => {
    const db = testEnvironment.authenticatedContext(`${role}-user`, {
      email_verified: true,
      sentinelRole: role,
    }).firestore();

    await assertSucceeds(getDoc(manifestReference(db)));
    for (const collectionName of PROTECTED_COLLECTIONS) {
      await assertSucceeds(getDoc(recordReference(db, collectionName)));
      await assertSucceeds(getDocs(recordCollection(db, collectionName)));
    }
  });
}

test('privileged users cannot list manifests or read inactive datasets', async () => {
  const db = testEnvironment.authenticatedContext('current-only-admin', {
    email_verified: true,
    sentinelRole: 'admin',
  }).firestore();

  await assertFails(getDocs(collection(db, 'monitoringManifests')));
  await assertFails(getDoc(manifestReference(db, 'candidate')));
  for (const collectionName of PROTECTED_COLLECTIONS) {
    await assertFails(getDoc(recordReference(db, collectionName, 'release-0')));
    await assertFails(getDoc(recordReference(db, collectionName, 'release-2')));
    await assertFails(getDoc(doc(db, collectionName, 'legacy')));
  }
});

test('all client create, update, and delete operations are denied', async () => {
  const clinicianDb = testEnvironment.authenticatedContext('clinician-writer', {
    email_verified: true,
    sentinelRole: 'clinician',
  }).firestore();
  const adminDb = testEnvironment.authenticatedContext('admin-writer', {
    email_verified: true,
    sentinelRole: 'admin',
  }).firestore();

  await assertFails(setDoc(
    doc(recordCollection(clinicianDb, 'students'), 'new'),
    { name: 'New' },
  ));
  await assertFails(updateDoc(recordReference(adminDb, 'logs'), { changed: true }));
  await assertFails(deleteDoc(recordReference(adminDb, 'assessments')));
  await assertFails(updateDoc(manifestReference(adminDb), { version: 'release-2' }));
});

test('unknown collections remain denied for privileged users', async () => {
  const db = testEnvironment.authenticatedContext('admin-user', {
    email_verified: true,
    sentinelRole: 'admin',
  }).firestore();

  await assertFails(getDoc(doc(db, 'private', 'seed')));
  await assertFails(getDoc(doc(db, 'monitoringDatasets', CURRENT_VERSION, 'private', 'seed')));
  await assertFails(setDoc(doc(db, 'private', 'new'), { secret: true }));
});

test('privileged users cannot read undeclared nested subcollections', async () => {
  const db = testEnvironment.authenticatedContext('nested-admin', {
    email_verified: true,
    sentinelRole: 'admin',
  }).firestore();

  for (const collectionName of PROTECTED_COLLECTIONS) {
    await assertFails(getDoc(
      doc(recordReference(db, collectionName), 'nested', 'secret'),
    ));
  }
});
