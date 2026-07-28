const MAX_UTTERANCE_LENGTH = 3_000;
const MAX_MEMORY_TEXT_LENGTH = 500;
const MAX_RECENT_TURNS = 2;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const PHONE_PATTERN = /(?<!\d)(?:\+?66|0)[\s().-]*\d(?:[\s().-]*\d){7,10}(?!\d)/gu;
const NATIONAL_ID_PATTERN = /(?<!\d)\d(?:[ -]?\d){12}(?!\d)/gu;
const SENSITIVE_NOTE_PATTERN = /(?:drawing[ _-]?note|clinical[ _-]?note|บันทึก(?:การรักษา|สุขภาพ|ส่วนตัว)?|ประวัติครอบครัว|ภาระการเงิน)\s*[:=][\s\S]*/iu;

function blankState() {
  return {
    topic: null,
    subjectAliases: [],
    roomAliases: [],
    metrics: [],
    dateRange: null,
    lastEvidenceId: null,
    recentTurns: [],
  };
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('th');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsEntity(text, value) {
  const candidate = String(value ?? '').trim();
  if (!candidate) return false;
  const escaped = escapeRegExp(candidate);
  if (/^[\p{L}\p{N}_]+$/u.test(candidate)) {
    return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(text);
  }
  return normalize(text).includes(normalize(candidate));
}

function replaceEntity(text, value, alias) {
  const candidate = String(value ?? '').trim();
  if (!candidate) return text;
  const escaped = escapeRegExp(candidate);
  if (/^[\p{L}\p{N}_]+$/u.test(candidate)) {
    return text.replace(
      new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'giu'),
      (_, prefix) => `${prefix}${alias}`,
    );
  }
  return text.replace(new RegExp(escaped, 'giu'), alias);
}

function redactGenericIdentifiers(value) {
  const redactions = new Set();
  let text = [...String(value ?? '')]
    .map(character => {
      const code = character.codePointAt(0);
      return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
        ? ' '
        : character;
    })
    .join('')
    .slice(0, MAX_UTTERANCE_LENGTH);

  const replace = (pattern, marker, category) => {
    text = text.replace(pattern, () => {
      redactions.add(category);
      return marker;
    });
  };
  replace(EMAIL_PATTERN, '[[REDACTED_EMAIL]]', 'email');
  replace(PHONE_PATTERN, '[[REDACTED_PHONE]]', 'phone');
  replace(NATIONAL_ID_PATTERN, '[[REDACTED_ID]]', 'national-id');
  text = text.replace(SENSITIVE_NOTE_PATTERN, () => {
    redactions.add('free-text-note');
    return '[[REDACTED_NOTE]]';
  });

  return { text: text.trim(), redactions: [...redactions] };
}

function createAliasRegistry() {
  const peopleById = new Map();
  const personIdByAlias = new Map();
  const roomsByName = new Map();
  const roomNameByAlias = new Map();

  function person(student) {
    const id = String(student?.id ?? '').trim();
    if (!id) throw new TypeError('student id is required for an alias');
    if (!peopleById.has(id)) {
      const alias = `[[P${peopleById.size + 1}]]`;
      const entry = {
        alias,
        display: String(student?.name || id),
        identifiers: [id, student?.name].map(String).map(item => item.trim()).filter(Boolean),
      };
      peopleById.set(id, entry);
      personIdByAlias.set(alias, id);
    }
    return peopleById.get(id).alias;
  }

  function room(roomName) {
    const name = String(roomName ?? '').trim();
    if (!name) throw new TypeError('room name is required for an alias');
    if (!roomsByName.has(name)) {
      const alias = `[[R${roomsByName.size + 1}]]`;
      roomsByName.set(name, { alias, display: name });
      roomNameByAlias.set(alias, name);
    }
    return roomsByName.get(name).alias;
  }

  function clear() {
    peopleById.clear();
    personIdByAlias.clear();
    roomsByName.clear();
    roomNameByAlias.clear();
  }

  return {
    person,
    room,
    personId(alias) {
      return personIdByAlias.get(alias) ?? null;
    },
    roomName(alias) {
      return roomNameByAlias.get(alias) ?? null;
    },
    restore(value) {
      if (typeof value === 'string') {
        let restored = value;
        for (const entry of peopleById.values()) {
          restored = restored.replaceAll(entry.alias, entry.display);
        }
        for (const entry of roomsByName.values()) {
          restored = restored.replaceAll(entry.alias, entry.display);
        }
        return restored;
      }
      if (Array.isArray(value)) return value.map(item => this.restore(item));
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, this.restore(item)]),
        );
      }
      return value;
    },
    containsRawEntity(value) {
      const text = String(value ?? '');
      return [...peopleById.values()].some(entry => (
        entry.identifiers.some(identifier => containsEntity(text, identifier))
      )) || [...roomsByName.keys()].some(name => containsEntity(text, name));
    },
    clear,
  };
}

function findAliasMentions(text, aliases, resolve) {
  return [...new Set(
    (String(text).match(/\[\[[PR]\d+\]\]/gu) ?? [])
      .filter(alias => resolve(alias))
      .filter(alias => aliases.includes(alias)),
  )];
}

export function createConversationPrivacy() {
  const aliases = createAliasRegistry();
  const evidenceCache = new Map();
  let state = blankState();
  let evidenceSequence = 0;

  return {
    aliases,

    prepareUtterance(rawUtterance, students = []) {
      let text = String(rawUtterance ?? '').normalize('NFKC').trim();
      const matchedStudentIds = new Set();
      const matchedRooms = [];
      const ambiguousNames = [];
      const orderedStudents = [...students].sort((left, right) => (
        String(right?.id ?? '').length - String(left?.id ?? '').length
      ));

      // IDs are unambiguous even when two roster entries share the same display name.
      for (const student of orderedStudents) {
        const identifier = String(student?.id ?? '').trim();
        if (!identifier || !containsEntity(text, identifier)) continue;
        const alias = aliases.person(student);
        text = replaceEntity(text, identifier, alias);
        matchedStudentIds.add(student.id);
      }

      const studentsByName = new Map();
      for (const student of students) {
        const name = String(student?.name ?? '').trim();
        if (!name) continue;
        const key = normalize(name);
        if (!studentsByName.has(key)) studentsByName.set(key, { name, students: [] });
        studentsByName.get(key).students.push(student);
      }
      const names = [...studentsByName.values()]
        .sort((left, right) => right.name.length - left.name.length);
      for (const entry of names) {
        if (!containsEntity(text, entry.name)) continue;
        const explicitlyMatched = entry.students.filter(student => matchedStudentIds.has(student.id));
        const resolved = entry.students.length === 1
          ? entry.students[0]
          : explicitlyMatched.length === 1 ? explicitlyMatched[0] : null;
        if (!resolved) {
          text = replaceEntity(text, entry.name, '[[AMBIGUOUS_PERSON]]');
          ambiguousNames.push(entry.name);
          continue;
        }
        const alias = aliases.person(resolved);
        text = replaceEntity(text, entry.name, alias);
        matchedStudentIds.add(resolved.id);
      }

      const roomNames = [...new Set(students.map(student => student?.room).filter(Boolean))]
        .sort((left, right) => String(right).length - String(left).length);
      for (const roomName of roomNames) {
        if (!containsEntity(text, roomName)) continue;
        const alias = aliases.room(roomName);
        text = replaceEntity(text, roomName, alias);
        matchedRooms.push(roomName);
      }

      const generic = redactGenericIdentifiers(text);
      const uniqueStudentIds = [...matchedStudentIds];
      const subjectAliases = uniqueStudentIds.map(id => aliases.person(
        students.find(student => student.id === id),
      ));
      const roomAliases = matchedRooms.map(name => aliases.room(name));
      const previousSubjects = state.subjectAliases;
      const previousRooms = state.roomAliases;

      return {
        utterance: generic.text,
        redactions: generic.redactions,
        matchedStudentIds: uniqueStudentIds,
        matchedRooms: [...new Set(matchedRooms)],
        ambiguousNames: [...new Set(ambiguousNames)],
        subjectAliases: [...new Set([
          ...subjectAliases,
          ...findAliasMentions(generic.text, previousSubjects, aliases.personId),
        ])],
        roomAliases: [...new Set([
          ...roomAliases,
          ...findAliasMentions(generic.text, previousRooms, aliases.roomName),
        ])],
      };
    },

    snapshot() {
      return structuredClone(state);
    },

    nextEvidenceId() {
      evidenceSequence += 1;
      return `E${evidenceSequence}`;
    },

    rememberEvidence(evidence) {
      const evidenceId = evidence?.source?.evidenceId || this.nextEvidenceId();
      evidenceCache.set(evidenceId, structuredClone(evidence));
      while (evidenceCache.size > 2) evidenceCache.delete(evidenceCache.keys().next().value);
      return evidenceId;
    },

    commitTurn({ utterance, answer, evidenceId, intent, subjectAliases, roomAliases, metrics, dateRange }) {
      const safeAnswer = redactGenericIdentifiers(answer).text.slice(0, MAX_MEMORY_TEXT_LENGTH);
      const safeUtterance = redactGenericIdentifiers(utterance).text.slice(0, MAX_MEMORY_TEXT_LENGTH);
      state = {
        topic: intent,
        subjectAliases: subjectAliases.length > 0 ? [...subjectAliases].slice(0, 5) : state.subjectAliases,
        roomAliases: roomAliases.length > 0 ? [...roomAliases] : state.roomAliases,
        metrics: metrics.length > 0 ? [...metrics] : state.metrics,
        dateRange: dateRange ?? state.dateRange,
        lastEvidenceId: evidenceId,
        recentTurns: [
          ...state.recentTurns,
          { utterance: safeUtterance, answer: safeAnswer },
        ].slice(-MAX_RECENT_TURNS),
      };
    },

    restoreAssistantPayload(payload) {
      return aliases.restore(payload);
    },

    assertOutboundSafe(body) {
      const serialized = JSON.stringify(body);
      if (aliases.containsRawEntity(serialized)) {
        throw Object.assign(new Error('privacy-raw-entity'), { code: 'privacy-blocked' });
      }
      if (EMAIL_PATTERN.test(serialized) || PHONE_PATTERN.test(serialized) || NATIONAL_ID_PATTERN.test(serialized)) {
        EMAIL_PATTERN.lastIndex = 0;
        PHONE_PATTERN.lastIndex = 0;
        NATIONAL_ID_PATTERN.lastIndex = 0;
        throw Object.assign(new Error('privacy-dlp-match'), { code: 'privacy-blocked' });
      }
      EMAIL_PATTERN.lastIndex = 0;
      PHONE_PATTERN.lastIndex = 0;
      NATIONAL_ID_PATTERN.lastIndex = 0;
      return true;
    },

    clear() {
      aliases.clear();
      evidenceCache.clear();
      evidenceSequence = 0;
      state = blankState();
    },
  };
}

export function createDisclosureReceipt({ body, evidence, redactions = [] }) {
  const byteCount = new TextEncoder().encode(JSON.stringify(body)).byteLength;
  return {
    mode: 'deidentified',
    subjectCount: evidence.subjects.length,
    roomCount: evidence.rooms.length,
    aliasesOnly: true,
    rawIdentifiersSent: false,
    redactions: [...new Set(redactions)],
    byteCount,
  };
}
