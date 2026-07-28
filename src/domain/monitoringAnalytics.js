const DASS_WEEKS = Object.freeze([0, 4, 8, 16]);
const RESILIENCE_WEEKS = Object.freeze([0, 8, 16]);
const FOUR_COLOR_FIELDS = Object.freeze(['self', 'buddy', 'command']);

function round(value) {
  return Number(value.toFixed(2));
}

function getLocalIsoDate() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

function calculateStats(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return { mean: null, sd: null, n: 0 };
  if (valid.length === 1) return { mean: round(valid[0]), sd: null, n: 1 };

  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const variance = valid.reduce(
    (sum, value) => sum + ((value - mean) ** 2),
    0,
  ) / (valid.length - 1);
  return { mean: round(mean), sd: round(Math.sqrt(variance)), n: valid.length };
}

function calculateStudentWeightedStats(logs, field) {
  const valuesByStudent = new Map();
  for (const log of logs) {
    const value = log[field];
    if (!Number.isFinite(value)) continue;
    if (!valuesByStudent.has(log.studentId)) valuesByStudent.set(log.studentId, []);
    valuesByStudent.get(log.studentId).push(value);
  }

  const studentMeans = [...valuesByStudent.values()].map(values => (
    values.reduce((sum, value) => sum + value, 0) / values.length
  ));
  return calculateStats(studentMeans);
}

function compareByDateThenId(left, right) {
  return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
}

function compareByWeekThenId(left, right) {
  return left.week - right.week || left.id.localeCompare(right.id);
}

function preferDeterministicRecord(map, key, record) {
  const current = map.get(key);
  if (!current || record.id.localeCompare(current.id) >= 0) map.set(key, record);
}

function deduplicateLogs(logs) {
  const byStudentAndDate = new Map();
  for (const log of logs) {
    preferDeterministicRecord(byStudentAndDate, `${log.studentId}\u0000${log.date}`, log);
  }
  return [...byStudentAndDate.values()];
}

function deduplicateAssessments(assessments) {
  const byStudentAndWeek = new Map();
  for (const assessment of assessments) {
    preferDeterministicRecord(
      byStudentAndWeek,
      `${assessment.studentId}\u0000${assessment.week}`,
      assessment,
    );
  }
  return [...byStudentAndWeek.values()];
}

function applyLocf(logs) {
  const byStudent = new Map();
  for (const log of logs) {
    if (!byStudent.has(log.studentId)) byStudent.set(log.studentId, []);
    byStudent.get(log.studentId).push(log);
  }

  const processed = [];
  for (const studentLogs of byStudent.values()) {
    studentLogs.sort(compareByDateThenId);
    const latestByField = Object.fromEntries(FOUR_COLOR_FIELDS.map(field => [field, null]));

    for (const log of studentLogs) {
      const point = { ...log };
      for (const field of FOUR_COLOR_FIELDS) {
        const prefix = field[0].toUpperCase() + field.slice(1);
        const observed = Number.isFinite(log[field]);
        if (observed) latestByField[field] = { value: log[field], date: log.date };
        point[field] = observed ? log[field] : (latestByField[field]?.value ?? null);
        point[`is${prefix}CF`] = !observed && latestByField[field] !== null;
        point[`${field}SourceDate`] = latestByField[field]?.date ?? null;
      }
      processed.push(point);
    }
  }
  return processed;
}

function interpretCdRisc(score) {
  if (!Number.isFinite(score)) return '-';
  if (score <= 29) return 'ต่ำ (Low)';
  if (score <= 32) return 'ปานกลาง (Average)';
  return 'สูง (High)';
}

function interpretGrit(score) {
  if (!Number.isFinite(score)) return '-';
  if (score <= 15) return 'ต่ำ (Low)';
  if (score <= 24) return 'ปานกลาง (Average)';
  return 'สูง (High)';
}

function interpretSeverity(level) {
  if (level === 1) return '1 - เฝ้าระวังทั่วไป (Monitoring)';
  if (level === 2) return '2 - ติดตามใกล้ชิด (Close Obs.)';
  if (level === 3) return '3 - วิกฤตส่งต่อ (Psychiatric Referral)';
  return '-';
}

function interpretPhysical(level) {
  if (level === 1) return 'ปกติ';
  if (level === 2) return 'บาดเจ็บเล็กน้อย';
  if (level === 3) return 'งดฝึก';
  return '-';
}

function latestAtOrBefore(assessments, week, predicate = () => true) {
  let latest = null;
  for (const assessment of assessments) {
    if (assessment.week > week) break;
    if (predicate(assessment)) latest = assessment;
  }
  return latest;
}

function hasResilienceScores(assessment) {
  return Number.isFinite(assessment.cd_risc) && Number.isFinite(assessment.grit);
}

function createPopulationTrend(logs) {
  return Array.from({ length: 16 }, (_, index) => {
    const week = index + 1;
    const weekLogs = logs.filter(log => log.week === week);
    const self = calculateStudentWeightedStats(weekLogs, 'self');
    const buddy = calculateStudentWeightedStats(weekLogs, 'buddy');
    const command = calculateStudentWeightedStats(weekLogs, 'command');
    return {
      week: `Wk ${week}`,
      self: self.mean,
      self_sd: self.sd,
      self_n: self.n,
      buddy: buddy.mean,
      buddy_sd: buddy.sd,
      buddy_n: buddy.n,
      command: command.mean,
      command_sd: command.sd,
      command_n: command.n,
    };
  });
}

function createDassTrend(assessments) {
  return DASS_WEEKS.map(week => {
    const weekAssessments = assessments.filter(assessment => assessment.week === week);
    const depression = calculateStats(weekAssessments.map(assessment => assessment.dass_d));
    const anxiety = calculateStats(weekAssessments.map(assessment => assessment.dass_a));
    const stress = calculateStats(weekAssessments.map(assessment => assessment.dass_s));
    return {
      week: `Wk ${week}`,
      dass_d: depression.mean,
      dass_d_sd: depression.sd,
      dass_d_n: depression.n,
      dass_a: anxiety.mean,
      dass_a_sd: anxiety.sd,
      dass_a_n: anxiety.n,
      dass_s: stress.mean,
      dass_s_sd: stress.sd,
      dass_s_n: stress.n,
    };
  });
}

function createResilienceTrend(assessments) {
  return RESILIENCE_WEEKS.map(week => {
    const weekAssessments = assessments.filter(assessment => assessment.week === week);
    const cdRisc = calculateStats(weekAssessments.map(assessment => assessment.cd_risc));
    const grit = calculateStats(weekAssessments.map(assessment => assessment.grit));
    return {
      week: `Wk ${week}`,
      cd_risc: cdRisc.mean,
      cd_risc_sd: cdRisc.sd,
      cd_risc_n: cdRisc.n,
      grit: grit.mean,
      grit_sd: grit.sd,
      grit_n: grit.n,
    };
  });
}

export function createMonitoringAnalytics({
  students = [],
  logs = [],
  assessments = [],
  asOfDate = getLocalIsoDate(),
} = {}) {
  const studentList = [...new Map(students.map(student => [student.id, student])).values()];
  const studentById = new Map(studentList.map(student => [student.id, student]));
  const observedLogs = deduplicateLogs(logs).filter(log => log.date <= asOfDate);
  const presentationLogs = applyLocf(observedLogs);
  const latestObservationDate = observedLogs.reduce(
    (latest, log) => (!latest || log.date > latest ? log.date : latest),
    null,
  );
  const observedLogsByStudent = new Map();
  const presentationLogsByStudent = new Map();
  for (const log of observedLogs) {
    if (!observedLogsByStudent.has(log.studentId)) observedLogsByStudent.set(log.studentId, []);
    observedLogsByStudent.get(log.studentId).push(log);
  }
  for (const log of presentationLogs) {
    if (!presentationLogsByStudent.has(log.studentId)) {
      presentationLogsByStudent.set(log.studentId, []);
    }
    presentationLogsByStudent.get(log.studentId).push(log);
  }
  for (const studentLogs of observedLogsByStudent.values()) studentLogs.sort(compareByDateThenId);
  for (const studentLogs of presentationLogsByStudent.values()) studentLogs.sort(compareByDateThenId);
  const assessmentList = deduplicateAssessments(assessments).sort(compareByWeekThenId);
  const assessmentsByStudent = new Map();

  for (const assessment of assessmentList) {
    if (!assessmentsByStudent.has(assessment.studentId)) {
      assessmentsByStudent.set(assessment.studentId, []);
    }
    assessmentsByStudent.get(assessment.studentId).push(assessment);
  }

  return {
    listStudents() {
      return studentList.slice();
    },

    getLatestObservationDate() {
      return latestObservationDate;
    },

    getOverview({ gender = 'all' } = {}) {
      const filteredStudents = gender === 'all'
        ? studentList
        : studentList.filter(student => student.demographics?.gender === gender);
      const filteredIds = new Set(filteredStudents.map(student => student.id));
      const filteredLogs = observedLogs.filter(log => filteredIds.has(log.studentId));
      const filteredAssessments = assessmentList.filter(assessment => (
        filteredIds.has(assessment.studentId)
      ));
      const latestLogByStudent = new Map();
      for (const log of presentationLogs) {
        const current = latestLogByStudent.get(log.studentId);
        if (!current || compareByDateThenId(current, log) < 0) {
          latestLogByStudent.set(log.studentId, log);
        }
      }

      const alerts = { red3: 0, redSelfPlus: 0, psychiatricCare: 0 };
      for (const student of studentList) {
        const log = latestLogByStudent.get(student.id);
        if (log?.self === 4 && log.buddy === 4 && log.command === 4) alerts.red3 += 1;
        else if (log?.self === 4 && (log.buddy === 4 || log.command === 4)) {
          alerts.redSelfPlus += 1;
        }
        if (student.demographics?.mentalSeverity === 3) alerts.psychiatricCare += 1;
      }

      return {
        totalStudents: studentList.length,
        filteredStudentCount: filteredStudents.length,
        alerts,
        populationTrend: createPopulationTrend(filteredLogs),
        dassTrend: createDassTrend(filteredAssessments),
        resilienceTrend: createResilienceTrend(filteredAssessments),
      };
    },

    getRoomStatus({ date } = {}) {
      const targetDate = date || latestObservationDate || '';

      const studentsByRoom = new Map();
      for (const student of studentList) {
        if (!student.room) continue;
        if (!studentsByRoom.has(student.room)) studentsByRoom.set(student.room, []);
        studentsByRoom.get(student.room).push(student);
      }

      const rooms = [...studentsByRoom.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'th', { numeric: true }))
        .map(([name, roomStudents]) => ({
          name,
          students: roomStudents
            .slice()
            .sort((left, right) => left.id.localeCompare(right.id, 'th', { numeric: true }))
            .map(student => {
              const studentObservedLogs = observedLogsByStudent.get(student.id) ?? [];
              const studentPresentationLogs = presentationLogsByStudent.get(student.id) ?? [];
              const latestPresentation = studentPresentationLogs
                .filter(log => log.date <= targetDate)
                .at(-1) ?? null;
              const exactObservation = studentObservedLogs
                .filter(log => log.date === targetDate)
                .at(-1) ?? null;
              const observation = latestPresentation
                ? {
                    ...latestPresentation,
                    date: targetDate,
                    physicalInjury: exactObservation?.physicalInjury ?? null,
                    ...Object.fromEntries(FOUR_COLOR_FIELDS.flatMap(field => {
                      const prefix = field[0].toUpperCase() + field.slice(1);
                      const sourceDate = latestPresentation[`${field}SourceDate`];
                      return [
                        [`is${prefix}CF`, sourceDate !== null && sourceDate !== targetDate],
                        [`${field}SourceDate`, sourceDate ?? null],
                      ];
                    })),
                  }
                : null;
              const studentAssessments = assessmentsByStudent.get(student.id) ?? [];
              const assessment = observation
                ? latestAtOrBefore(studentAssessments, observation.week)
                : null;
              const resilienceAssessment = observation
                ? latestAtOrBefore(
                    studentAssessments,
                    observation.week,
                    hasResilienceScores,
                  )
                : null;
              return {
                student,
                observation,
                assessment,
                resilienceAssessment,
                physicalLabel: observation
                  ? interpretPhysical(observation.physicalInjury)
                  : '-',
              };
            }),
        }));

      return { date: targetDate, rooms };
    },

    getIndividual({ studentId } = {}) {
      const student = studentById.get(studentId);
      if (!student) return null;

      const studentLogs = presentationLogs
        .filter(log => log.studentId === studentId)
        .sort(compareByDateThenId);
      const studentAssessments = (assessmentsByStudent.get(studentId) ?? []).slice();
      const latestResilience = studentAssessments.filter(hasResilienceScores).at(-1) ?? null;
      const baselineAssessment = studentAssessments.find(assessment => assessment.week === 0);

      return {
        student: {
          ...student,
          mentalSeverityLabel: interpretSeverity(student.demographics?.mentalSeverity),
        },
        fourColorTrend: studentLogs.map(log => ({
          date: log.date,
          show: log.date.slice(5),
          self: log.self,
          buddy: log.buddy,
          command: log.command,
          isSelfCF: log.isSelfCF,
          isBuddyCF: log.isBuddyCF,
          isCommandCF: log.isCommandCF,
          selfSourceDate: log.selfSourceDate,
          buddySourceDate: log.buddySourceDate,
          commandSourceDate: log.commandSourceDate,
        })),
        assessments: studentAssessments,
        resilienceTrend: studentAssessments.filter(assessment => (
          RESILIENCE_WEEKS.includes(assessment.week)
        )),
        latestResilience: latestResilience
          ? {
              ...latestResilience,
              cdRiscInterpretation: interpretCdRisc(latestResilience.cd_risc),
              gritInterpretation: interpretGrit(latestResilience.grit),
            }
          : null,
        drawingNote: baselineAssessment?.drawing_note || 'ไม่มีข้อมูล',
      };
    },
  };
}
