const DASS_WEEKS = Object.freeze([0, 4, 8, 16]);
const RESILIENCE_WEEKS = Object.freeze([0, 8, 16]);

function round(value) {
  return Number(value.toFixed(2));
}

function calculateStats(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return { mean: null, sd: null };
  if (valid.length === 1) return { mean: round(valid[0]), sd: 0 };

  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const variance = valid.reduce(
    (sum, value) => sum + ((value - mean) ** 2),
    0,
  ) / (valid.length - 1);
  return { mean: round(mean), sd: round(Math.sqrt(variance)) };
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
    let lastBuddy = null;
    let lastCommand = null;

    for (const log of studentLogs) {
      const buddyObserved = log.buddy !== null;
      const commandObserved = log.command !== null;

      if (buddyObserved) lastBuddy = { value: log.buddy, date: log.date };
      if (commandObserved) lastCommand = { value: log.command, date: log.date };

      processed.push({
        ...log,
        buddy: buddyObserved ? log.buddy : (lastBuddy?.value ?? null),
        command: commandObserved ? log.command : (lastCommand?.value ?? null),
        isBuddyCF: !buddyObserved && lastBuddy !== null,
        isCommandCF: !commandObserved && lastCommand !== null,
        buddySourceDate: lastBuddy?.date ?? null,
        commandSourceDate: lastCommand?.date ?? null,
      });
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

function latestAtOrBefore(assessments, week) {
  let latest = null;
  for (const assessment of assessments) {
    if (assessment.week > week) break;
    latest = assessment;
  }
  return latest;
}

function createPopulationTrend(logs) {
  return Array.from({ length: 16 }, (_, index) => {
    const week = index + 1;
    const weekLogs = logs.filter(log => log.week === week);
    const self = calculateStats(weekLogs.map(log => log.self));
    const buddy = calculateStats(weekLogs.map(log => log.buddy));
    const command = calculateStats(weekLogs.map(log => log.command));
    return {
      week: `Wk ${week}`,
      self: self.mean,
      self_sd: self.sd,
      buddy: buddy.mean,
      buddy_sd: buddy.sd,
      command: command.mean,
      command_sd: command.sd,
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
      dass_a: anxiety.mean,
      dass_a_sd: anxiety.sd,
      dass_s: stress.mean,
      dass_s_sd: stress.sd,
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
      grit: grit.mean,
      grit_sd: grit.sd,
    };
  });
}

export function createMonitoringAnalytics({ students = [], logs = [], assessments = [] } = {}) {
  const studentList = [...new Map(students.map(student => [student.id, student])).values()];
  const studentById = new Map(studentList.map(student => [student.id, student]));
  const processedLogs = applyLocf(deduplicateLogs(logs));
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

    getOverview({ gender = 'all' } = {}) {
      const filteredStudents = gender === 'all'
        ? studentList
        : studentList.filter(student => student.demographics?.gender === gender);
      const filteredIds = new Set(filteredStudents.map(student => student.id));
      const filteredLogs = processedLogs.filter(log => filteredIds.has(log.studentId));
      const filteredAssessments = assessmentList.filter(assessment => (
        filteredIds.has(assessment.studentId)
      ));
      const latestLogByStudent = new Map();
      for (const log of processedLogs) {
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
      const observationByStudent = new Map();
      for (const log of processedLogs) {
        if (log.date === date) observationByStudent.set(log.studentId, log);
      }

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
              const observation = observationByStudent.get(student.id) ?? null;
              const studentAssessments = assessmentsByStudent.get(student.id) ?? [];
              const assessment = observation
                ? latestAtOrBefore(studentAssessments, observation.week)
                : null;
              return {
                student,
                observation,
                assessment,
                physicalLabel: observation
                  ? interpretPhysical(observation.physicalInjury)
                  : '-',
              };
            }),
        }));

      return { date, rooms };
    },

    getIndividual({ studentId } = {}) {
      const student = studentById.get(studentId);
      if (!student) return null;

      const studentLogs = processedLogs
        .filter(log => log.studentId === studentId)
        .sort(compareByDateThenId);
      const studentAssessments = (assessmentsByStudent.get(studentId) ?? []).slice();
      const latestAssessment = studentAssessments.at(-1) ?? null;
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
          isBuddyCF: log.isBuddyCF,
          isCommandCF: log.isCommandCF,
          buddySourceDate: log.buddySourceDate,
          commandSourceDate: log.commandSourceDate,
        })),
        assessments: studentAssessments,
        resilienceTrend: studentAssessments.filter(assessment => (
          RESILIENCE_WEEKS.includes(assessment.week)
        )),
        latestAssessment: latestAssessment
          ? {
              ...latestAssessment,
              cdRiscInterpretation: interpretCdRisc(latestAssessment.cd_risc),
              gritInterpretation: interpretGrit(latestAssessment.grit),
            }
          : null,
        drawingNote: baselineAssessment?.drawing_note || 'ไม่มีข้อมูล',
      };
    },
  };
}
