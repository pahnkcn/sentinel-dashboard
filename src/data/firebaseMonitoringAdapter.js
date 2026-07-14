import {
  collection,
  doc,
  documentId,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';

import { db } from '../config/firestore.js';
import { decodeAssessment, decodeLog, decodeStudent } from '../domain/records.js';
import { decodeDatasetManifest } from './datasetManifest.js';
import { MONITORING_STREAMS } from './monitoringDataStore.js';
import { subscribeVerifiedDocument } from './subscribeVerifiedDocument.js';
import { subscribeVerifiedQuery } from './subscribeVerifiedQuery.js';
import { createVersionedDatasetCoordinator } from './versionedDatasetCoordinator.js';

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
      let active = true;
      let manifestVerified = false;
      let activeVersion = null;
      let stopManifest = () => {};
      let stopStreams = [];

      const reportEveryStream = error => {
        for (const stream of MONITORING_STREAMS) observer.error(stream, error);
      };

      const coordinator = createVersionedDatasetCoordinator({
        streams: MONITORING_STREAMS,
        onBegin: version => observer.beginDataset(version),
        onDataset: dataset => observer.replaceDataset(dataset),
        onVerified: stream => observer.verified(stream),
        onError: (stream, error) => observer.error(stream, error),
        clock,
      });

      const disconnectStreams = () => {
        const unsubscribe = stopStreams;
        stopStreams = [];
        for (const stop of unsubscribe) stop();
      };

      const connectVersion = version => {
        disconnectStreams();
        activeVersion = version;
        const token = coordinator.begin(version);
        const unsubscribe = [];

        try {
          for (const stream of STREAM_CONFIG) {
            const recordLimit = normalizedLimits[stream.name];
            const streamQuery = query(
              collection(
                firestore,
                'monitoringDatasets',
                version,
                stream.collectionName,
              ),
              orderBy(documentId()),
              limit(recordLimit + 1),
            );

            unsubscribe.push(subscribeVerifiedQuery({
              streamName: stream.name,
              streamQuery,
              decoder: stream.decoder,
              recordLimit,
              observer: {
                next: (name, payload) => coordinator.accept(token, name, payload),
                error: (name, error) => coordinator.fail(token, name, error),
              },
              listen: onSnapshot,
              clock,
            }));
          }
          stopStreams = unsubscribe;
        } catch (error) {
          for (const stop of unsubscribe) stop();
          reportEveryStream({ code: error?.code || 'dataset-listener-start-failed' });
        }
      };

      try {
        stopManifest = subscribeVerifiedDocument({
          documentReference: doc(firestore, 'monitoringManifests', 'current'),
          decoder: decodeDatasetManifest,
          observer: {
            next({ version }) {
              if (!active || (manifestVerified && activeVersion === version)) return;
              manifestVerified = true;
              connectVersion(version);
            },
            error(error) {
              if (!active) return;
              manifestVerified = false;
              activeVersion = null;
              disconnectStreams();
              reportEveryStream(error);
            },
          },
          listen: onSnapshot,
        });
      } catch (error) {
        active = false;
        disconnectStreams();
        throw error;
      }

      return () => {
        if (!active) return;
        active = false;
        stopManifest();
        disconnectStreams();
      };
    },
  };
}
