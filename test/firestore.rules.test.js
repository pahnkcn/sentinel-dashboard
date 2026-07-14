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

let testEnvironment;

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

    for (const collectionName of PROTECTED_COLLECTIONS) {
      await setDoc(doc(db, collectionName, 'seed'), { seeded: true });
    }

    await setDoc(doc(db, 'private', 'seed'), { seeded: true });
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test('unauthenticated users cannot read protected data', async () => {
  const db = testEnvironment.unauthenticatedContext().firestore();

  for (const collectionName of PROTECTED_COLLECTIONS) {
    await assertFails(getDoc(doc(db, collectionName, 'seed')));
  }
});

test('anonymous users without claims cannot read protected data', async () => {
  const db = testEnvironment.authenticatedContext('anonymous-user', {
    firebase: { sign_in_provider: 'anonymous' },
  }).firestore();

  for (const collectionName of PROTECTED_COLLECTIONS) {
    await assertFails(getDoc(doc(db, collectionName, 'seed')));
  }
});

test('ordinary verified users cannot read protected data', async () => {
  const db = testEnvironment.authenticatedContext('verified-user', {
    email_verified: true,
  }).firestore();

  for (const collectionName of PROTECTED_COLLECTIONS) {
    await assertFails(getDoc(doc(db, collectionName, 'seed')));
  }
});

test('unverified clinicians cannot read protected data', async () => {
  const db = testEnvironment.authenticatedContext('unverified-clinician', {
    email_verified: false,
    sentinelRole: 'clinician',
  }).firestore();

  for (const collectionName of PROTECTED_COLLECTIONS) {
    await assertFails(getDoc(doc(db, collectionName, 'seed')));
  }
});

for (const role of ['clinician', 'admin']) {
  test(`${role} users can read and list protected data`, async () => {
    const db = testEnvironment.authenticatedContext(`${role}-user`, {
      email_verified: true,
      sentinelRole: role,
    }).firestore();

    for (const collectionName of PROTECTED_COLLECTIONS) {
      await assertSucceeds(getDoc(doc(db, collectionName, 'seed')));
      await assertSucceeds(getDocs(collection(db, collectionName)));
    }
  });
}

test('all client create, update, and delete operations are denied', async () => {
  const clinicianDb = testEnvironment.authenticatedContext('clinician-writer', {
    email_verified: true,
    sentinelRole: 'clinician',
  }).firestore();
  const adminDb = testEnvironment.authenticatedContext('admin-writer', {
    email_verified: true,
    sentinelRole: 'admin',
  }).firestore();

  await assertFails(setDoc(doc(clinicianDb, 'students', 'new'), { name: 'New' }));
  await assertFails(updateDoc(doc(adminDb, 'logs', 'seed'), { changed: true }));
  await assertFails(deleteDoc(doc(adminDb, 'assessments', 'seed')));
});

test('unknown collections remain denied for privileged users', async () => {
  const db = testEnvironment.authenticatedContext('admin-user', {
    email_verified: true,
    sentinelRole: 'admin',
  }).firestore();

  await assertFails(getDoc(doc(db, 'private', 'seed')));
  await assertFails(setDoc(doc(db, 'private', 'new'), { secret: true }));
});
