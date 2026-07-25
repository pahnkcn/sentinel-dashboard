const BROAD_PEOPLE_PATTERN = /(ใคร|รายชื่อ|บุคคล|นักเรียน|นร\.|นรม\.|จัดอันดับ|อันดับ|เสี่ยง|เฝ้าระวัง|priority|risk|rank|highest|lowest)/i;
const PREDICTION_PATTERN = /(คาดการณ์|พยากรณ์|ทำนาย|แนวโน้มข้างหน้า|prediction|predict|forecast|projection)/i;
const MAX_DETAILED_STUDENTS = 12;

function localIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function round(value) {
  return Number(value.toFixed(2));
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return null;
  return round(valid.reduce((total, value) => total + value, 0) / valid.length);
}

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('th');
}

function includesSearchTerm(searchText, value) {
  const term = normalizeSearchText(value).trim();
  return term.length >= 3 && searchText.includes(term);
}

function latestByWeek(assessments) {
  return assessments
    .filter(assessment => Number.isFinite(assessment.week))
    .sort((left, right) => left.week - right.week || left.id.localeCompare(right.id))
    .at(-1) ?? null;
}

function weeklySelfTrend(observations) {
  const latestByDate = new Map();
  for (const observation of observations) {
    const current = latestByDate.get(observation.date);
    if (!current || observation.id.localeCompare(current.id) >= 0) {
      latestByDate.set(observation.date, observation);
    }
  }
  const valuesByWeek = new Map();
  for (const observation of latestByDate.values()) {
    if (!Number.isFinite(observation.week) || !Number.isFinite(observation.self)) continue;
    if (!valuesByWeek.has(observation.week)) valuesByWeek.set(observation.week, []);
    valuesByWeek.get(observation.week).push(observation.self);
  }
  return [...valuesByWeek.entries()]
    .sort(([left], [right]) => left - right)
    .map(([week, values]) => ({ week, value: mean(values) }));
}

export function createLinearForecast(
  points,
  {
    valueKey = 'value',
    xKey = 'week',
    through = 16,
    horizon = 4,
    min = -Infinity,
    max = Infinity,
  } = {},
) {
  const valid = points
    .map(point => ({ x: Number(point[xKey]), y: Number(point[valueKey]) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x);

  if (valid.length < 3) return null;

  const xMean = mean(valid.map(point => point.x));
  const yMean = mean(valid.map(point => point.y));
  const denominator = valid.reduce(
    (total, point) => total + ((point.x - xMean) ** 2),
    0,
  );
  if (denominator === 0) return null;

  const slope = valid.reduce(
    (total, point) => total + ((point.x - xMean) * (point.y - yMean)),
    0,
  ) / denominator;
  const intercept = yMean - (slope * xMean);
  const lastX = valid.at(-1).x;
  const end = Math.min(through, lastX + horizon);
  const forecast = [];

  for (let x = Math.floor(lastX) + 1; x <= end; x += 1) {
    forecast.push({
      week: x,
      value: round(Math.min(max, Math.max(min, intercept + (slope * x)))),
    });
  }

  return forecast.length > 0
    ? {
        method: 'ordinary-least-squares linear trend',
        observedPoints: valid.length,
        slopePerWeek: round(slope),
        forecast,
      }
    : null;
}

function createOverviewForecast(overview) {
  const forecastMetric = (series, key, range) => createLinearForecast(
    series.map(point => ({
      week: Number(String(point.week).replace(/\D+/g, '')),
      value: point[key],
    })),
    { min: range[0], max: range[1] },
  );

  return {
    fourColors: {
      self: forecastMetric(overview.populationTrend, 'self', [1, 4]),
      buddy: forecastMetric(overview.populationTrend, 'buddy', [1, 4]),
      command: forecastMetric(overview.populationTrend, 'command', [1, 4]),
    },
    dass21: {
      depression: forecastMetric(overview.dassTrend, 'dass_d', [1, 5]),
      anxiety: forecastMetric(overview.dassTrend, 'dass_a', [1, 5]),
      stress: forecastMetric(overview.dassTrend, 'dass_s', [1, 5]),
    },
  };
}

function createCompactStudentProfile(student, analytics, observedLogs, assessments) {
  const individual = analytics.getIndividual({ studentId: student.id });
  if (!individual) return null;

  const latestObservation = individual.fourColorTrend.at(-1) ?? null;
  const studentAssessments = assessments.filter(item => item.studentId === student.id);
  const latestAssessment = latestByWeek(studentAssessments);
  const selfTrend = weeklySelfTrend(observedLogs.filter(log => log.studentId === student.id));

  return {
    id: student.id,
    name: student.name,
    room: student.room,
    gender: student.demographics?.gender || null,
    age: finiteOrNull(student.demographics?.age),
    tag: student.tag || null,
    mentalSeverity: finiteOrNull(student.demographics?.mentalSeverity),
    mentalSeverityLabel: individual.student.mentalSeverityLabel,
    latestObservation: latestObservation
      ? {
          date: latestObservation.date,
          self: finiteOrNull(latestObservation.self),
          buddy: finiteOrNull(latestObservation.buddy),
          command: finiteOrNull(latestObservation.command),
          buddyCarriedForward: latestObservation.isBuddyCF === true,
          commandCarriedForward: latestObservation.isCommandCF === true,
        }
      : null,
    latestAssessment: latestAssessment
      ? {
          week: latestAssessment.week,
          depression: finiteOrNull(latestAssessment.dass_d),
          anxiety: finiteOrNull(latestAssessment.dass_a),
          stress: finiteOrNull(latestAssessment.dass_s),
          cdRisc: finiteOrNull(latestAssessment.cd_risc),
          grit: finiteOrNull(latestAssessment.grit),
        }
      : null,
    selfTrendDirection: createLinearForecast(selfTrend, { min: 1, max: 4 })?.slopePerWeek ?? null,
  };
}

function createDetailedStudentProfile(profile, analytics, observedLogs) {
  const individual = analytics.getIndividual({ studentId: profile.id });
  const weeklyTrend = weeklySelfTrend(observedLogs.filter(log => log.studentId === profile.id));

  return {
    ...profile,
    demographics: {
      region: individual.student.demographics?.region || null,
      school: individual.student.demographics?.school || null,
      familyHistory: individual.student.demographics?.familyHistory || null,
      financialBurden: individual.student.demographics?.financialBurden || null,
      physicalIssueDetail: individual.student.demographics?.physicalIssueDetail || null,
      mentalIssueDetail: individual.student.demographics?.mentalIssueDetail || null,
    },
    fourColorTrend: individual.fourColorTrend,
    assessments: individual.assessments,
    resilienceTrend: individual.resilienceTrend,
    latestResilience: individual.latestResilience,
    drawingNote: individual.drawingNote,
    prediction: {
      self: createLinearForecast(weeklyTrend, { min: 1, max: 4 }),
    },
  };
}

function createRoomSummaries(analytics, date) {
  if (!date) return [];

  return analytics.getRoomStatus({ date }).rooms.map(room => {
    const observations = room.students.map(item => item.observation).filter(Boolean);
    const concernCount = observations.filter(observation => (
      observation.self === 4
      || observation.buddy === 4
      || observation.command === 4
    )).length;
    const physicalConcernCount = observations.filter(
      observation => observation.physicalInjury > 1,
    ).length;

    return {
      room: room.name,
      studentCount: room.students.length,
      observedCount: observations.length,
      concernCount,
      physicalConcernCount,
      meanSelf: mean(observations.map(observation => observation.self)),
      meanBuddy: mean(observations.map(observation => observation.buddy)),
      meanCommand: mean(observations.map(observation => observation.command)),
    };
  });
}

function latestObservedDate(logs) {
  return logs.reduce(
    (latest, log) => (!latest || log.date > latest ? log.date : latest),
    null,
  );
}

function buildSearchText(question, conversation) {
  const recentConversation = Array.isArray(conversation) ? conversation.slice(-6) : [];
  return normalizeSearchText(
    [question, ...recentConversation.map(message => message?.content)].filter(Boolean).join(' '),
  );
}

export function createChatContext({
  analytics,
  students = [],
  logs = [],
  assessments = [],
  datasetVersion = null,
  lastUpdatedAt = null,
  question = '',
  conversation = [],
  asOfDate = localIsoDate(),
} = {}) {
  if (!analytics || typeof analytics.getOverview !== 'function') {
    throw new TypeError('analytics is required to create chatbot context');
  }

  const observedLogs = logs.filter(log => (
    typeof log.date === 'string' && log.date <= asOfDate
  ));
  const overview = analytics.getOverview();
  const latestDate = latestObservedDate(observedLogs);
  const searchText = buildSearchText(question, conversation);
  const wantsPeople = BROAD_PEOPLE_PATTERN.test(searchText);
  const wantsPrediction = PREDICTION_PATTERN.test(searchText);
  const matchedStudentIds = new Set(
    students
      .filter(student => (
        includesSearchTerm(searchText, student.id)
        || includesSearchTerm(searchText, student.name)
      ))
      .map(student => student.id),
  );
  const matchedRooms = new Set(
    students
      .map(student => student.room)
      .filter(Boolean)
      .filter(room => includesSearchTerm(searchText, room)),
  );
  const compactProfiles = students
    .map(student => createCompactStudentProfile(
      student,
      analytics,
      observedLogs,
      assessments,
    ))
    .filter(Boolean);
  const relevantProfiles = compactProfiles.filter(profile => (
    wantsPeople
    || matchedStudentIds.has(profile.id)
    || matchedRooms.has(profile.room)
  ));
  const detailedProfiles = compactProfiles
    .filter(profile => matchedStudentIds.has(profile.id))
    .slice(0, MAX_DETAILED_STUDENTS)
    .map(profile => createDetailedStudentProfile(profile, analytics, observedLogs));

  return {
    source: {
      product: 'Sentinel Mental Health Dashboard',
      datasetVersion,
      verifiedAt: Number.isFinite(lastUpdatedAt)
        ? new Date(lastUpdatedAt).toISOString()
        : null,
      asOfDate,
      latestObservationDate: latestDate,
      recordCounts: {
        students: students.length,
        observations: observedLogs.length,
        assessments: assessments.length,
      },
    },
    glossary: {
      fourColors: 'Ordinal 1-4; a larger value is more concerning.',
      viewpoints: ['Self', 'Buddy', 'Command'],
      dass21: 'Dashboard dimension values are 1-5; larger is more concerning.',
      cdRisc: '0-40; dashboard interpretation treats larger as more resilient.',
      grit: '0-32; dashboard interpretation treats larger as more resilient.',
      carriedForward: 'Buddy/Command values marked carried-forward are presentation continuity, not new observations.',
    },
    overview,
    roomSummaries: createRoomSummaries(analytics, latestDate),
    relevantStudents: relevantProfiles,
    detailedStudents: detailedProfiles,
    prediction: wantsPrediction ? createOverviewForecast(overview) : null,
    retrieval: {
      questionMatchedStudentIds: [...matchedStudentIds],
      questionMatchedRooms: [...matchedRooms],
      includedRelevantStudentCount: relevantProfiles.length,
      includedDetailedStudentCount: detailedProfiles.length,
      detailedStudentLimit: MAX_DETAILED_STUDENTS,
    },
    constraints: [
      'Use only the supplied verified context for factual claims about this dashboard.',
      'Do not treat missing values or carried-forward values as new observations.',
      'Predictions are exploratory linear trends, not clinical diagnoses or guaranteed outcomes.',
      'The dashboard is decision support and does not replace assessment by qualified staff.',
    ],
  };
}
