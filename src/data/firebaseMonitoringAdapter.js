import {
  collection,
  documentId,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';

import { db } from '../config/firestore.js';
import { decodeAssessment, decodeLog, decodeStudent } from '../domain/records.js';
import { decodeSnapshot } from './decodeSnapshot.js';

export const MONITORING_LIMITS = Object.freeze({
  students: 250,
  logs: 28_000,
  assessments: 1_000,
});

const STREAM_CONFIG = Object.freeze([
  { name: 'students', collectionName: 'students', decoder: decodeStudent },
  { name: 'logs', collectionName: 'logs', decoder: decodeLog },
  { name: 'assessments', collectionName: 'assessments', decoder: decodeAssessment },
]);

function validateLimit(stream, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${stream} monitoring limit must be a positive integer`);
  }
  return value;
}

export function createFirebaseMonitoringAdapter({
  firestore = db,
  limits = MONITORING_LIMITS,
  clock = Date.now,
} = {}) {
  const normalizedLimits = Object.fromEntries(
    STREAM_CONFIG.map(({ name }) => [name, validateLimit(name, limits[name])]),
  );

  return {
    connect(observer) {
      const unsubscribe = [];
      let active = true;

      try {
        for (const stream of STREAM_CONFIG) {
          const recordLimit = normalizedLimits[stream.name];
          const streamQuery = query(
            collection(firestore, stream.collectionName),
            orderBy(documentId()),
            limit(recordLimit + 1),
          );

          unsubscribe.push(onSnapshot(
            streamQuery,
            snapshot => {
              if (!active) return;
              const truncated = snapshot.docs.length > recordLimit;
              const decoded = decodeSnapshot(
                { docs: snapshot.docs.slice(0, recordLimit) },
                stream.decoder,
              );
              observer.next(stream.name, {
                ...decoded,
                truncated,
                receivedAt: clock(),
              });
            },
            error => {
              if (active) observer.error(stream.name, { code: error?.code || 'unknown' });
            },
          ));
        }
      } catch (error) {
        active = false;
        for (const stop of unsubscribe) stop();
        throw error;
      }

      return () => {
        if (!active) return;
        active = false;
        for (const stop of unsubscribe) stop();
      };
    },
  };
}
