import { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Brush
} from 'recharts';
import { 
  LayoutDashboard, Users, User, Activity, Clock, HeartPulse, ShieldCheck, BookOpen, Calendar
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';

import { AccessGate } from './auth/AccessGate.jsx';
import { useAuthorization } from './auth/useAuthorization.js';
import { db, firebaseConfig } from './config/firebase.js';

// ==========================================
// HELPERS & CONSTANTS
// ==========================================
const COLORS = { 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444' };

const getStats = (arr) => {
  if (!arr || arr.length === 0) return { mean: null, sd: null };
  const validData = arr.filter(x => x !== null && !isNaN(x));
  if (validData.length === 0) return { mean: null, sd: null };
  if (validData.length === 1) return { mean: parseFloat(validData[0].toFixed(2)), sd: 0 };
  const mean = validData.reduce((a, b) => a + b, 0) / validData.length;
  const variance = validData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (validData.length - 1);
  return { mean: parseFloat(mean.toFixed(2)), sd: parseFloat(Math.sqrt(variance).toFixed(2)) };
};

const interpretCdRisc = (score) => {
  if (score === null || score === undefined || score === '') return '-';
  if (score <= 29) return 'ต่ำ (Low)';
  if (score <= 32) return 'ปานกลาง (Average)';
  return 'สูง (High)';
};

const interpretGrit = (score) => {
  if (score === null || score === undefined || score === '') return '-';
  if (score <= 15) return 'ต่ำ (Low)';
  if (score <= 24) return 'ปานกลาง (Average)';
  return 'สูง (High)';
};

const interpretSeverity = (level) => {
  if (level == 1) return '1 - เฝ้าระวังทั่วไป (Monitoring)';
  if (level == 2) return '2 - ติดตามใกล้ชิด (Close Obs.)';
  if (level == 3) return '3 - วิกฤตส่งต่อ (Psychiatric Referral)';
  return '-';
};

const interpretPhysical = (val) => {
  if (val == 1) return 'ปกติ';
  if (val == 2) return 'บาดเจ็บเล็กน้อย';
  if (val == 3) return 'งดฝึก';
  return '-';
};

const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-200/60 rounded-xl ${className}`} />
);

export default function App() {
  const authorization = useAuthorization();

  if (authorization.status !== 'authorized') {
    return <AccessGate authorization={authorization} />;
  }

  return <Dashboard key={authorization.user.uid} authorization={authorization} />;
}

function Dashboard({ authorization }) {
  const [activeTab, setActiveTab] = useState('overview');

  const { user, role, signOut } = authorization;
  const [students, setStudents] = useState([]);
  const [rawLogs, setRawLogs] = useState([]);
  const [assessments, setAssessments] = useState([]);
  
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingAssessments, setLoadingAssessments] = useState(true);

  const [genderFilter, setGenderFilter] = useState('all');

  useEffect(() => {
    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      setStudents(snapshot.docs.map(d => d.data()));
      setLoadingStudents(false);
    });
    const unsubLogs = onSnapshot(collection(db, 'logs'), (snapshot) => {
      setRawLogs(snapshot.docs.map(d => d.data()));
      setLoadingLogs(false);
    });
    const unsubAssessments = onSnapshot(collection(db, 'assessments'), (snapshot) => {
      setAssessments(snapshot.docs.map(d => d.data()));
      setLoadingAssessments(false);
    });
    return () => { unsubStudents(); unsubLogs(); unsubAssessments(); };
  }, [user]);

  const [selectedStudent, setSelectedStudent] = useState('');
  const [heatmapDate, setHeatmapDate] = useState(new Date().toISOString().split('T')[0]);
  const activeStudentId = students.some(student => student.id === selectedStudent)
    ? selectedStudent
    : (students[0]?.id ?? '');

  // ==========================================
  // LOCF LOGIC: ลากเส้นคะแนน Buddy/Command 
  // ==========================================
  const processedLogs = useMemo(() => {
    const studentLogsMap = {};
    rawLogs.forEach(l => {
      if (!studentLogsMap[l.studentId]) studentLogsMap[l.studentId] = [];
      studentLogsMap[l.studentId].push(l);
    });

    const finalLogs = [];
    Object.keys(studentLogsMap).forEach(sid => {
      const sLogs = studentLogsMap[sid].sort((a, b) => new Date(a.date) - new Date(b.date));
      let lastBuddy = null;
      let lastCommand = null;

      sLogs.forEach(l => {
        let currentBuddy = l.buddy;
        let currentCommand = l.command;
        let isBuddyCF = false;  // สัญลักษณ์ว่าถูก Carried Forward (ลากมา)
        let isCommandCF = false;

        // Buddy Logic
        if (currentBuddy !== undefined && currentBuddy !== null) {
          lastBuddy = currentBuddy;
        } else if (lastBuddy !== null) {
          currentBuddy = lastBuddy;
          isBuddyCF = true;
        }

        // Command Logic
        if (currentCommand !== undefined && currentCommand !== null) {
          lastCommand = currentCommand;
        } else if (lastCommand !== null) {
          currentCommand = lastCommand;
          isCommandCF = true;
        }

        finalLogs.push({
          ...l,
          buddy: currentBuddy,
          command: currentCommand,
          isBuddyCF,
          isCommandCF
        });
      });
    });
    return finalLogs;
  }, [rawLogs]);


  // --- ANALYTICS (Filtered by Gender) ---
  const filteredStudents = useMemo(() => {
    if (genderFilter === 'all') return students;
    return students.filter(s => s.demographics?.gender === genderFilter);
  }, [students, genderFilter]);

  const filteredLogs = useMemo(() => {
    const sids = new Set(filteredStudents.map(s => s.id));
    return processedLogs.filter(l => sids.has(l.studentId));
  }, [processedLogs, filteredStudents]);

  const filteredAssess = useMemo(() => {
    const sids = new Set(filteredStudents.map(s => s.id));
    return assessments.filter(a => sids.has(a.studentId));
  }, [assessments, filteredStudents]);

  const populationTrend = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const w = i + 1;
    const wL = filteredLogs.filter(l => l.week === w);
    const selfStats = getStats(wL.map(l => l.self));
    const buddyStats = getStats(wL.map(l => l.buddy));
    const cmdStats = getStats(wL.map(l => l.command));
    return { week: `Wk ${w}`, self: selfStats.mean, self_sd: selfStats.sd, buddy: buddyStats.mean, buddy_sd: buddyStats.sd, command: cmdStats.mean, command_sd: cmdStats.sd };
  }), [filteredLogs]);

  const dassTrend = useMemo(() => [0, 4, 8, 16].map(w => {
    const wA = filteredAssess.filter(a => a.week === w);
    return { 
      week: `Wk ${w}`, 
      dass_d: getStats(wA.map(a => a.dass_d)).mean, dass_d_sd: getStats(wA.map(a => a.dass_d)).sd,
      dass_a: getStats(wA.map(a => a.dass_a)).mean, dass_a_sd: getStats(wA.map(a => a.dass_a)).sd,
      dass_s: getStats(wA.map(a => a.dass_s)).mean, dass_s_sd: getStats(wA.map(a => a.dass_s)).sd
    };
  }), [filteredAssess]);

  const resilienceTrend = useMemo(() => [0, 8, 16].map(w => {
    const wA = filteredAssess.filter(a => a.week === w);
    return { 
      week: `Wk ${w}`, 
      cd_risc: getStats(wA.map(a => a.cd_risc)).mean, cd_risc_sd: getStats(wA.map(a => a.cd_risc)).sd, 
      grit: getStats(wA.map(a => a.grit)).mean, grit_sd: getStats(wA.map(a => a.grit)).sd 
    };
  }), [filteredAssess]);

  // ==========================================
  // RENDERS
  // ==========================================
  const renderOverview = () => {
    const latestLogsMap = {};
    processedLogs.forEach(l => {
      if (!latestLogsMap[l.studentId] || new Date(l.date) > new Date(latestLogsMap[l.studentId].date)) {
        latestLogsMap[l.studentId] = l;
      }
    });

    let red3Count = 0;
    let redSelfPlusCount = 0;
    let psychCareCount = 0;

    students.forEach(s => {
      const l = latestLogsMap[s.id];
      if (l) {
        if (l.self === 4 && l.buddy === 4 && l.command === 4) red3Count++;
        else if (l.self === 4 && (l.buddy === 4 || l.command === 4)) redSelfPlusCount++;
      }
      if (s.demographics?.mentalSeverity == 3) psychCareCount++;
    });

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-4 flex items-center text-slate-800"><BookOpen className="mr-2 text-blue-500" size={20} /> Demographic & Alert Status</h3>
          {loadingStudents ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <p className="text-xs font-bold text-slate-500 mb-1">นรม. ในระบบ</p>
                <p className="text-2xl font-black text-slate-800">{students.length}</p>
              </div>
              <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                <p className="text-xs font-bold text-rose-500 mb-1">วิกฤต 3 ด้าน (แดงล้วน)</p>
                <p className="text-2xl font-black text-rose-700">{red3Count}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                <p className="text-xs font-bold text-orange-600 mb-1">เฝ้าระวัง (Self แดง + 1)</p>
                <p className="text-2xl font-black text-orange-700">{redSelfPlusCount}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                <p className="text-xs font-bold text-purple-600 mb-1">ติดตามโดยจิตเวช</p>
                <p className="text-2xl font-black text-purple-700">{psychCareCount}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold flex items-center text-slate-800"><Activity className="mr-2 text-blue-500" size={20} /> Population Trend: 4 Colors</h3>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              {['all', 'ชาย', 'หญิง'].map(g => (
                <button key={g} onClick={() => setGenderFilter(g)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${genderFilter === g ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                  {g === 'all' ? 'ทั้งหมด' : g}
                </button>
              ))}
            </div>
          </div>
          {loadingLogs ? <Skeleton className="h-72" /> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={populationTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis domain={[1, 4]} ticks={[1, 2, 3, 4]} />
                  <RechartsTooltip content={({ active, payload, label }) => active && payload ? (
                    <div className="bg-white p-3 border rounded-lg shadow-xl text-xs">
                      <p className="font-bold mb-2 border-b pb-1">{label} (N={filteredStudents.length})</p>
                      {payload.map((e, i) => <p key={i} style={{ color: e.color }}>{e.name}: {e.value} (SD: {e.payload[`${e.dataKey}_sd`]})</p>)}
                    </div>
                  ) : null} />
                  <Legend iconType="circle" />
                  <Line type="monotone" dataKey="self" name="Self" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="buddy" name="Buddy" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="command" name="Command" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold mb-6 flex items-center text-slate-800"><ShieldCheck className="mr-2 text-rose-500" size={20} /> DASS-21 (Mean 1-5)</h3>
            {loadingAssessments ? <Skeleton className="h-72" /> : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dassTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} />
                    <YAxis domain={[1, 5]} ticks={[1,2,3,4,5]} />
                    <RechartsTooltip content={({ active, payload, label }) => active && payload ? (
                      <div className="bg-white p-3 border rounded-lg shadow-xl text-xs">
                        <p className="font-bold mb-2 border-b pb-1">{label}</p>
                        {payload.map((e, i) => e.value ? <p key={i} style={{ color: e.color }}>{e.name}: {e.value} (SD: {e.payload[`${e.dataKey}_sd`]})</p> : null)}
                      </div>
                    ) : null} />
                    <Legend iconType="circle" />
                    <Line type="monotone" dataKey="dass_d" name="Depression" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5 }} connectNulls />
                    <Line type="monotone" dataKey="dass_a" name="Anxiety" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5 }} connectNulls />
                    <Line type="monotone" dataKey="dass_s" name="Stress" stroke="#ef4444" strokeWidth={3} dot={{ r: 5 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold mb-6 flex items-center text-slate-800"><ShieldCheck className="mr-2 text-purple-500" size={20} /> CD-RISC & GRIT</h3>
            {loadingAssessments ? <Skeleton className="h-72" /> : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={resilienceTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} />
                    <YAxis yAxisId="left" domain={[0, 40]} label={{ value: 'CD-RISC', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 32]} label={{ value: 'GRIT', angle: 90, position: 'insideRight', style: { fontSize: 10 } }} />
                    <RechartsTooltip content={({ active, payload, label }) => active && payload ? (
                      <div className="bg-white p-3 border rounded-lg shadow-xl text-xs">
                        <p className="font-bold mb-2 border-b pb-1">{label}</p>
                        {payload.map((e, i) => e.value ? <p key={i} style={{ color: e.color }}>{e.name}: {e.value} (SD: {e.payload[`${e.dataKey}_sd`]})</p> : null)}
                      </div>
                    ) : null} />
                    <Legend iconType="circle" />
                    <Line yAxisId="left" type="monotone" dataKey="cd_risc" name="CD-RISC" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 5 }} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="grit" name="GRIT" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} connectNulls strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderHeatmap = () => {
    const lDate = processedLogs.filter(l => l.date === heatmapDate);
    const mLog = {}; lDate.forEach(l => mLog[l.studentId] = l);
    
    const mAssess = {};
    assessments.forEach(a => {
      if (!mAssess[a.studentId] || a.week > mAssess[a.studentId].week) mAssess[a.studentId] = a;
    });

    const rooms = [...new Set(students.map(s => s.room))].filter(Boolean).sort();

    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm min-h-[600px]">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-b pb-6">
          <h3 className="text-xl font-black text-slate-800">Heatmap สถานะรายห้องพัก</h3>
          <div className="flex items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            <Calendar size={18} className="text-slate-400 mr-3" />
            <span className="text-sm font-bold text-slate-600 mr-3">เลือกวันที่:</span>
            <input type="date" className="bg-white border rounded-lg px-3 py-1.5 text-sm font-bold outline-none" value={heatmapDate} onChange={(e) => setHeatmapDate(e.target.value)} />
          </div>
        </div>
        
        <div className="flex space-x-6 text-xs text-slate-500 mb-6 bg-slate-50 inline-flex p-3 rounded-lg border border-slate-100">
           <span><b className="text-blue-600">D</b> = Depression (ซึมเศร้า)</span>
           <span><b className="text-orange-500">A</b> = Anxiety (วิตกกังวล)</span>
           <span><b className="text-rose-500">S</b> = Stress (ความเครียด)</span>
        </div>

        {loadingStudents || loadingLogs ? (
          <div className="space-y-6">{[1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}</div>
        ) : rooms.length > 0 ? rooms.map(rm => (
          <div key={rm} className="mb-10">
            <h4 className="text-lg font-bold mb-4 text-blue-700 bg-blue-50/50 inline-block px-4 py-1 rounded-full border border-blue-100">ห้องพัก: {rm}</h4>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50/80 text-slate-500">
                  <tr>
                    <th className="p-4 font-bold">ID</th>
                    <th className="p-4 font-bold">ชื่อ-สกุล</th>
                    <th className="p-4 font-bold text-center">Self</th>
                    <th className="p-4 font-bold text-center">Buddy</th>
                    <th className="p-4 font-bold text-center">Command</th>
                    <th className="p-4 font-bold text-center text-purple-600 border-l">CD-RISC</th>
                    <th className="p-4 font-bold text-center text-emerald-600">GRIT</th>
                    <th className="p-4 font-bold text-center text-blue-600" title="Depression (ซึมเศร้า)">D</th>
                    <th className="p-4 font-bold text-center text-orange-500" title="Anxiety (วิตกกังวล)">A</th>
                    <th className="p-4 font-bold text-center text-rose-500" title="Stress (ความเครียด)">S</th>
                    <th className="p-4 font-bold text-center border-l">ป่วยกาย</th>
                  </tr>
                </thead>
                <tbody>
                  {students.filter(s => s.room === rm).map(s => {
                    const stL = mLog[s.id] || { self: 0, buddy: 0, command: 0, physicalInjury: 0, isBuddyCF: false, isCommandCF: false };
                    const stA = mAssess[s.id] || {};
                    return (
                      <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                        <td className="p-4 font-medium text-slate-400">{s.id}</td>
                        <td className="p-4 font-bold text-slate-700">{s.name}</td>
                        <td className="p-4 text-center">
                          <div className="w-6 h-6 mx-auto rounded-md shadow-inner" style={{ backgroundColor: COLORS[stL.self] || '#f1f5f9' }}></div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="w-6 h-6 mx-auto rounded-md shadow-inner" style={{ backgroundColor: COLORS[stL.buddy] || '#f1f5f9' }}></div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="w-6 h-6 mx-auto rounded-md shadow-inner" style={{ backgroundColor: COLORS[stL.command] || '#f1f5f9' }}></div>
                        </td>
                        <td className="p-4 text-center font-bold text-slate-600 border-l">{stA.cd_risc ?? '-'}</td>
                        <td className="p-4 text-center font-bold text-slate-600">{stA.grit ?? '-'}</td>
                        <td className="p-4 text-center font-bold text-slate-600">{stA.dass_d ?? '-'}</td>
                        <td className="p-4 text-center font-bold text-slate-600">{stA.dass_a ?? '-'}</td>
                        <td className="p-4 text-center font-bold text-slate-600">{stA.dass_s ?? '-'}</td>
                        <td className="p-4 text-center font-bold text-slate-600 border-l">{stL.self > 0 ? interpretPhysical(stL.physicalInjury) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )) : <div className="text-center p-20 text-slate-400">ยังไม่มีข้อมูล นรม. ในระบบ หรือวันที่เลือกไม่มีข้อมูล</div>}
      </div>
    );
  };

  const renderIndividual = () => {
    const s = students.find(x => x.id === activeStudentId);
    if (loadingStudents) return <div className="space-y-6"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
    if (!s) return <div className="p-12 text-center text-slate-400 font-bold bg-white rounded-2xl border border-dashed border-slate-300">กรุณาเลือกนักเรียนจากเมนู</div>;
    
    // ใช้ processedLogs เพื่อให้กราฟลากเชื่อมจุด (LOCF) แบบไม่ขาดตอน
    const sL = processedLogs.filter(l => l.studentId === activeStudentId).sort((a, b) => new Date(a.date) - new Date(b.date));
    const sA = assessments.filter(a => a.studentId === activeStudentId).sort((a, b) => a.week - b.week);
    
    const resilienceIndividualData = sA.filter(a => [0, 8, 16].includes(a.week));
    const latestAssess = sA.length > 0 ? sA[sA.length - 1] : {};

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold">ผลวิเคราะห์: <span className="text-blue-600">{s.name}</span></h3>
          <select className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={activeStudentId} onChange={(e) => setSelectedStudent(e.target.value)}>
            {students.map(sx => <option key={sx.id} value={sx.id}>{sx.id} - {sx.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <h4 className="font-bold border-b pb-3 text-blue-600 flex items-center"><User size={18} className="mr-2"/> ข้อมูลพื้นฐาน</h4>
            <div className="text-sm space-y-3">
              <div className="flex justify-between items-center"><span className="text-slate-500">เพศ:</span><b className="text-slate-800">{s.demographics?.gender || '-'}</b></div>
              <div className="flex justify-between items-center"><span className="text-slate-500">ห้องพัก:</span><b className="text-slate-800">{s.room}</b></div>
              <div className="flex justify-between items-center"><span className="text-slate-500">ป่วยกาย (Detail):</span><b className="text-slate-800">{s.demographics?.physicalIssueDetail || '-'}</b></div>
              <div className="flex justify-between items-center"><span className="text-slate-500">สุขภาพจิต (Detail):</span><b className="text-slate-800">{s.demographics?.mentalIssueDetail || '-'}</b></div>
              <div className="flex justify-between items-center"><span className="text-slate-500">ความรุนแรงจิตเวช:</span><b className={s.demographics?.mentalSeverity == 3 ? 'text-rose-500' : 'text-slate-800'}>{interpretSeverity(s.demographics?.mentalSeverity)}</b></div>
            </div>
            <div className="pt-4 border-t mt-4">
              <h4 className="font-bold text-purple-600 mb-3 flex items-center">ผลประเมินล่าสุด (Latest)</h4>
              <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 text-sm space-y-2">
                <div className="flex justify-between"><span>CD-RISC:</span><b className="text-purple-700">{latestAssess.cd_risc ?? '-'} ({interpretCdRisc(latestAssess.cd_risc)})</b></div>
                <div className="flex justify-between"><span>GRIT:</span><b className="text-emerald-600">{latestAssess.grit ?? '-'} ({interpretGrit(latestAssess.grit)})</b></div>
              </div>
            </div>
            <div className="pt-4 border-t mt-4">
              <h4 className="font-bold text-slate-800 mb-2 flex items-center"><ShieldCheck size={18} className="mr-2 text-purple-500"/> Note (Drawing Test)</h4>
              <p className="text-sm text-slate-600 italic bg-slate-50 p-4 rounded-xl border border-slate-100">"{sA.find(x => x.week === 0)?.drawing_note || 'ไม่มีข้อมูล'}"</p>
            </div>
          </div>
          <div className="col-span-1 xl:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="font-bold mb-6 text-slate-800 flex items-center"><Activity size={18} className="mr-2 text-blue-500"/> 4 Colors Trend (รายวัน)</h4>
              {loadingLogs ? <Skeleton className="h-56" /> : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sL.map(l => ({ date: l.date, show: l.date.substring(5), self: l.self, buddy: l.buddy, cmd: l.command }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="show" tick={{ fontSize: 10 }} />
                      <YAxis domain={[1, 4]} ticks={[1, 2, 3, 4]} />
                      <RechartsTooltip />
                      <Line type="stepAfter" dataKey="self" stroke="#3b82f6" strokeWidth={3} dot={false} />
                      <Line type="stepAfter" dataKey="buddy" stroke="#10b981" strokeWidth={3} dot={false} />
                      <Line type="stepAfter" dataKey="cmd" name="Command" stroke="#f59e0b" strokeWidth={3} dot={false} />
                      <Brush dataKey="date" height={20} stroke="#cbd5e1" travellerWidth={10} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h4 className="font-bold mb-6 text-slate-800 flex items-center"><ShieldCheck size={18} className="mr-2 text-rose-500"/> DASS-21</h4>
                {loadingAssessments ? <Skeleton className="h-56" /> : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sA}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} tickFormatter={v => `Wk ${v}`} />
                        <YAxis domain={[1, 5]} ticks={[1,2,3,4,5]} />
                        <RechartsTooltip />
                        <Line type="monotone" dataKey="dass_d" name="D" stroke="#3b82f6" strokeWidth={3} />
                        <Line type="monotone" dataKey="dass_a" name="A" stroke="#f59e0b" strokeWidth={3} />
                        <Line type="monotone" dataKey="dass_s" name="S" stroke="#ef4444" strokeWidth={3} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h4 className="font-bold mb-6 text-slate-800 flex items-center"><ShieldCheck size={18} className="mr-2 text-purple-500"/> CD-RISC & GRIT</h4>
                {loadingAssessments ? <Skeleton className="h-56" /> : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={resilienceIndividualData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} tickFormatter={v => `Wk ${v}`} />
                        <YAxis yAxisId="left" domain={[0, 40]} />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 32]} />
                        <RechartsTooltip />
                        <Line yAxisId="left" type="monotone" dataKey="cd_risc" name="CD-RISC" stroke="#8b5cf6" strokeWidth={3} />
                        <Line yAxisId="right" type="monotone" dataKey="grit" name="GRIT" stroke="#10b981" strokeWidth={3} strokeDasharray="5 5" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 flex flex-col md:flex-row">
      <div className="w-full md:w-72 bg-[#0f172a] text-white flex flex-col md:min-h-screen sticky top-0 z-20 shadow-2xl">
        <div className="p-8 text-center border-b border-white/5">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <HeartPulse size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tighter">SENTINEL</h1>
          <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em] mt-1 opacity-60">Mental Health Dashboard</p>
        </div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          {[
            { id: 'overview', label: 'ภาพรวม (Overview)', icon: LayoutDashboard },
            { id: 'heatmap', label: 'สถานะรายห้อง (Heatmap)', icon: Users },
            { id: 'individual', label: 'ติดตามรายบุคคล (Trends)', icon: User },
          ].map(m => (
            <button key={m.id} onClick={() => setActiveTab(m.id)} className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl transition-all duration-300 font-bold ${activeTab === m.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 translate-x-2' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              <m.icon size={20} /><span>{m.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-6 border-t border-white/5 bg-slate-900/50">
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            Authorized · {role}
          </p>
          <p className="mt-1 truncate text-[10px] text-slate-500">{user.email}</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-3 text-xs font-bold text-slate-400 transition hover:text-white"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 md:p-12 overflow-y-auto bg-[#f8fafc]">
        <header className="mb-12 flex justify-between items-end">
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">
              {activeTab === 'overview' && 'Population Trends'}
              {activeTab === 'heatmap' && 'Room Status'}
              {activeTab === 'individual' && 'Individual Tracking'}
            </h2>
            <p className="text-slate-400 text-sm mt-3 flex items-center font-bold font-mono">
              <Clock size={16} className="mr-2" /> live syncing from {firebaseConfig.projectId}
            </p>
          </div>
        </header>
        <main className="max-w-7xl">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'heatmap' && renderHeatmap()}
          {activeTab === 'individual' && renderIndividual()}
        </main>
      </div>
    </div>
  );
}
