const MAX_ROSTER_SIZE = 250;
const MAX_IDENTIFIER_LENGTH = 500;
const DATASET_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function safeText(value, maxLength = MAX_IDENTIFIER_LENGTH) {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFKC').trim();
  return text && text.length <= maxLength ? text : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTerm(text, term, replacement) {
  const escaped = escapeRegExp(term);
  // Longer roster identifiers are redacted even when pasted into surrounding text.
  // Very short values use token boundaries to avoid replacing every matching letter.
  if ([...term].length >= 3) {
    return text.replace(new RegExp(escaped, 'giu'), replacement);
  }
  if (/^[\p{L}\p{N}_-]+$/u.test(term)) {
    return text.replace(
      new RegExp(`(^|[^\\p{L}\\p{N}_-])${escaped}(?=$|[^\\p{L}\\p{N}_-])`, 'giu'),
      (_, prefix) => `${prefix}${replacement}`,
    );
  }
  return text.replace(new RegExp(escaped, 'giu'), replacement);
}

function normalizeRoster(records) {
  if (!Array.isArray(records) || records.length > MAX_ROSTER_SIZE) {
    throw Object.assign(new Error('privacy-roster-invalid'), {
      publicCode: 'privacy-roster-unavailable',
    });
  }
  const people = [];
  const rooms = new Set();
  for (const record of records) {
    const id = safeText(record?.id, 128);
    const name = safeText(record?.name);
    const room = safeText(record?.room, 128);
    if (!id || !name) {
      throw Object.assign(new Error('privacy-roster-invalid'), {
        publicCode: 'privacy-roster-unavailable',
      });
    }
    people.push({ id, name });
    if (room) rooms.add(room);
  }
  return {
    people,
    rooms: [...rooms],
  };
}

export function createRosterRedactor(records) {
  const roster = normalizeRoster(records);
  const terms = [
    ...roster.people.flatMap(person => [
      { value: person.name, replacement: '[[REDACTED_PERSON]]' },
      { value: person.id, replacement: '[[REDACTED_PERSON]]' },
    ]),
    ...roster.rooms.map(room => ({ value: room, replacement: '[[REDACTED_ROOM]]' })),
  ].sort((left, right) => right.value.length - left.value.length);

  return {
    size: roster.people.length,
    sanitize(value) {
      let text = String(value ?? '').normalize('NFKC');
      let redactionCount = 0;
      for (const term of terms) {
        const next = replaceTerm(text, term.value, term.replacement);
        if (next !== text) redactionCount += 1;
        text = next;
      }
      return { text, redactionCount };
    },
    containsIdentifier(value) {
      const text = String(value ?? '');
      return terms.some(term => replaceTerm(text, term.value, term.replacement) !== text);
    },
  };
}

export function createAuthoritativeRosterGateway({
  readCurrentManifest,
  readStudents,
  cacheTtlMs = 5 * 60_000,
  now = Date.now,
} = {}) {
  if (typeof readCurrentManifest !== 'function' || typeof readStudents !== 'function') {
    throw new TypeError('authoritative roster readers are required');
  }
  let cache = null;

  async function currentRedactor(expectedDatasetVersion) {
    const manifest = await readCurrentManifest();
    const version = safeText(manifest?.version, 128);
    if (!version || !DATASET_VERSION.test(version)) {
      throw Object.assign(new Error('privacy-manifest-invalid'), {
        publicCode: 'privacy-roster-unavailable',
      });
    }
    if (version !== expectedDatasetVersion) {
      throw Object.assign(new Error('privacy-dataset-mismatch'), {
        publicCode: 'privacy-dataset-mismatch',
      });
    }
    const timestamp = now();
    if (cache?.version === version && timestamp - cache.loadedAt < cacheTtlMs) {
      return cache.redactor;
    }
    const records = await readStudents(version, MAX_ROSTER_SIZE + 1);
    const redactor = createRosterRedactor(records);
    cache = { version, loadedAt: timestamp, redactor };
    return redactor;
  }

  return {
    async sanitizeRequest(request) {
      const redactor = await currentRedactor(request.evidence.source.datasetVersion);
      let redactionCount = 0;
      const sanitize = value => {
        const result = redactor.sanitize(value);
        redactionCount += result.redactionCount;
        return result.text;
      };
      return {
        request: {
          ...request,
          utterance: sanitize(request.utterance),
          conversationState: {
            ...request.conversationState,
            recentTurns: request.conversationState.recentTurns.map(turn => ({
              utterance: sanitize(turn.utterance),
              answer: sanitize(turn.answer),
            })),
          },
        },
        redactionCount,
        rosterSize: redactor.size,
        assertProviderSafe(value) {
          if (redactor.containsIdentifier(JSON.stringify(value))) {
            throw Object.assign(new Error('privacy-provider-roster-match'), {
              publicCode: 'privacy-sensitive-data',
            });
          }
          return true;
        },
      };
    },
    clearCache() {
      cache = null;
    },
  };
}

export const PRIVACY_ROSTER_LIMIT = MAX_ROSTER_SIZE;
