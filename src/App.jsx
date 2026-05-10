import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Brush
} from 'recharts';
import { 
  LayoutDashboard, Users, User, AlertTriangle, Activity, Clock, HeartPulse, ShieldCheck, UploadCloud, Download, BookOpen, Database, Calendar
} from 'lucide-react';

// ==========================================
// FIREBASE CLOUD STORAGE CONFIGURATION
// ==========================================
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, writeBatch, query, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBNNcFjfkIko-mN9zpATT_lD0FQuX5wDdA",
  authDomain: "sentinel-dashboard-9a05c.firebaseapp.com",
  databaseURL: "https://sentinel-dashboard-9a05c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sentinel-dashboard-9a05c",
  storageBucket: "sentinel-dashboard-9a05c.firebasestorage.app",
  messagingSenderId: "659194434716",
  appId: "1:659194434716:web:5a683e788742760ebf8959",
  measurementId: "G-RLSQKNJY2G"
};

// Safely initialize Firebase (avoid re-init on hot reload)
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  const { getApp } = require('firebase/app');
  app = getApp();
}
const auth = getAuth(app);
const db = getFirestore(app);

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

const escapeCSV = (str) => {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
};

const commitInBatches = async (collectionName, items, idField) => {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach(item => {
      batch.set(doc(db, collectionName, item[idField].toString()), item);
    });
    await batch.commit();
  }
};

const deleteInBatches = async (collectionName, items) => {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach(item => {
      batch.delete(doc(db, collectionName, item.id.toString()));
    });
    await batch.commit();
  }
};

// ==========================================
// FIX #1: downloadTemplate was called but never defined
// ==========================================
const downloadTemplate = (type) => {
  const templates = {
    daily: {
      filename: 'template_daily.csv',
      content: 'studentId,date,week,self,buddy,command,fatigue,injury\n001,2026-05-12,1,1,1,1,2,0\n002,2026-05-12,1,2,1,1,3,0'
    },
    demographic: {
      filename: 'template_demographic.csv',
      content: 'id,name,room,age,gender,region,school,familyHistory,financialBurden\n001,นรม. ตัวอย่าง,101,19,ชาย,กทม.,มัธยมปลาย,ไม่มี,ไม่มี'
    },
    assessment: {
      filename: 'template_assessment.csv',
      content: 'studentId,week,dass_d,dass_a,dass_s,cd_risc,drawing_note\n001,0,6,5,8,75,วาดภาพปกติ'
    }
  };
  const t = templates[type] || templates.daily;
  const blob = new Blob(['\uFEFF' + t.content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', t.filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ==========================================
// LOADING SKELETON
// ==========================================
const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-200 rounded-xl ${className}`} />
);

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [entrySubTab, setEntrySubTab] = useState('daily');

  // ==========================================
  // FIX #2: Split loading states per collection
  // so UI renders immediately while data loads
  // ==========================================
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingAssessments, setLoadingAssessments] = useState(true);

  // Step 1: Authenticate
  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error("Auth Failure:", err));
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Step 2: Subscribe to Firestore ONLY after auth resolves
  // Each collection subscribes independently so partial data shows immediately
  useEffect(() => {
    if (!user) return;

    const unsubStudents = onSnapshot(
      collection(db, 'students'),
      (snapshot) => {
        setStudents(snapshot.docs.map(d => d.data()));
        setLoadingStudents(false);
      },
      (error) => {
        console.error("Firestore Students Error:", error);
        setLoadingStudents(false);
      }
    );

    const unsubLogs = onSnapshot(
      collection(db, 'logs'),
      (snapshot) => {
        setLogs(snapshot.docs.map(d => d.data()));
        setLoadingLogs(false);
      },
      (error) => {
        console.error("Firestore Logs Error:", error);
        setLoadingLogs(false);
      }
    );

    const unsubAssessments = onSnapshot(
      collection(db, 'assessments'),
      (snapshot) => {
        setAssessments(snapshot.docs.map(d => d.data()));
        setLoadingAssessments(false);
      },
      (error) => {
        console.error("Firestore Assessments Error:", error);
        setLoadingAssessments(false);
      }
    );

    return () => { unsubStudents(); unsubLogs(); unsubAssessments(); };
  }, [user]);

  const [selectedStudent, setSelectedStudent] = useState('');
  const fileInputRef = useRef(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [csvUploadType, setCsvUploadType] = useState('daily');
  const [heatmapDate, setHeatmapDate] = useState(new Date().toISOString().split('T')[0]);

  const [dailyForm, setDailyForm] = useState({ studentId: '', date: new Date().toISOString().split('T')[0], week: 1, self: 1, buddy: 1, command: 1, fatigue: 1, injury: 0 });
  const [demoForm, setDemoForm] = useState({ studentId: '', name: '', room: '', age: '', gender: 'ชาย', school: '', region: 'กทม.', familyHistory: 'ไม่มี', financialBurden: 'ไม่มี' });
  const [assessForm, setAssessForm] = useState({ studentId: '', week: 0, dass_d: '', dass_a: '', dass_s: '', cd_risc: '', drawing_note: '' });

  useEffect(() => {
    if (students.length > 0 && !selectedStudent) setSelectedStudent(students[0].id);
  }, [students, selectedStudent]);

  const ensureStudentExists = async (sid, demoData = null) => {
    const existing = students.find(s => s.id === sid);
    if (existing) {
      if (demoData) {
        await setDoc(doc(db, 'students', sid), { ...existing, ...demoData, age: parseInt(demoData.age) || 0 });
      }
    } else {
      const nw = {
        id: sid,
        name: demoData?.name || `นรม. รหัส ${sid}`,
        room: demoData?.room || 'ไม่ระบุ',
        baseline: 'Medium', tag: '', isUnderCare: false,
        demographics: demoData
          ? { ...demoData, age: parseInt(demoData.age) || 0 }
          : { age: 0, gender: 'ไม่ระบุ', school: 'ไม่ระบุ', region: 'ไม่ระบุ', familyHistory: 'ไม่มี', financialBurden: 'ไม่มี' }
      };
      await setDoc(doc(db, 'students', sid), nw);
    }
  };

  const handleDailySubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    const sid = dailyForm.studentId.trim();
    if (!sid) { alert('กรุณาระบุรหัส นรม.'); return; }
    const logId = `log_${sid}_${dailyForm.date}`;
    const data = { ...dailyForm, id: logId, studentId: sid, self: parseInt(dailyForm.self), buddy: parseInt(dailyForm.buddy), command: parseInt(dailyForm.command), fatigue: parseInt(dailyForm.fatigue), injury: parseInt(dailyForm.injury), week: parseInt(dailyForm.week) };
    await setDoc(doc(db, 'logs', logId), data);
    await ensureStudentExists(sid);
    alert('บันทึกข้อมูลรายวันสำเร็จ');
    setDailyForm({ ...dailyForm, studentId: '' });
  };

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    const sid = demoForm.studentId.trim();
    if (!sid) { alert('กรุณาระบุรหัส นรม.'); return; }
    await ensureStudentExists(sid, demoForm);
    alert('บันทึกประวัติพื้นฐานสำเร็จ');
    setDemoForm({ studentId: '', name: '', room: '', age: '', gender: 'ชาย', school: '', region: 'กทม.', familyHistory: 'ไม่มี', financialBurden: 'ไม่มี' });
  };

  const handleAssessSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    const sid = assessForm.studentId.trim();
    const assessId = `assess_${sid}_${assessForm.week}`;
    const data = { id: assessId, studentId: sid, week: parseInt(assessForm.week), dass_d: assessForm.dass_d ? parseInt(assessForm.dass_d) : null, dass_a: assessForm.dass_a ? parseInt(assessForm.dass_a) : null, dass_s: assessForm.dass_s ? parseInt(assessForm.dass_s) : null, cd_risc: assessForm.cd_risc ? parseInt(assessForm.cd_risc) : null, drawing_note: assessForm.drawing_note };
    await setDoc(doc(db, 'assessments', assessId), data);
    await ensureStudentExists(sid);
    alert('บันทึกแบบประเมินสำเร็จ');
    setAssessForm({ studentId: '', week: 0, dass_d: '', dass_a: '', dass_s: '', cd_risc: '', drawing_note: '' });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    setUploadStatus('กำลังนำเข้าข้อมูล...');
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const lines = evt.target.result.split('\n');
        const batch = writeBatch(db);
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const v = lines[i].split(',').map(x => x.trim());
          if (csvUploadType === 'daily' && v.length >= 8) {
            const id = `log_${v[0]}_${v[1]}`;
            batch.set(doc(db, 'logs', id), { id, studentId: v[0], date: v[1], week: parseInt(v[2]) || 1, self: parseInt(v[3]) || 1, buddy: parseInt(v[4]) || 1, command: parseInt(v[5]) || 1, fatigue: parseInt(v[6]) || 1, injury: parseInt(v[7]) || 0 });
            count++;
          } else if (csvUploadType === 'demographic' && v.length >= 9) {
            batch.set(doc(db, 'students', v[0]), { id: v[0], name: v[1], room: v[2], demographics: { age: parseInt(v[3]) || 0, gender: v[4], region: v[5], school: v[6], familyHistory: v[7], financialBurden: v[8] }, baseline: 'Medium', tag: '', isUnderCare: false });
            count++;
          } else if (csvUploadType === 'assessment' && v.length >= 7) {
            const id = `assess_${v[0]}_${v[1]}`;
            batch.set(doc(db, 'assessments', id), { id, studentId: v[0], week: parseInt(v[1]) || 0, dass_d: v[2] ? parseInt(v[2]) : null, dass_a: v[3] ? parseInt(v[3]) : null, dass_s: v[4] ? parseInt(v[4]) : null, cd_risc: v[5] ? parseInt(v[5]) : null, drawing_note: v[6] || '' });
            count++;
          }
        }
        await batch.commit();
        setUploadStatus(`นำเข้าสำเร็จ ${count} รายการ`);
      } catch (err) {
        console.error(err);
        setUploadStatus('เกิดข้อผิดพลาดในการอ่านไฟล์');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetData = async () => {
    if (!user) return;
    setUploadStatus('กำลังล้างข้อมูล Cloud...');
    try {
      await deleteInBatches('logs', logs);
      await deleteInBatches('assessments', assessments);
      await deleteInBatches('students', students);
      setUploadStatus('ล้างข้อมูลสำเร็จ');
      setShowConfirmReset(false);
    } catch (e) {
      setUploadStatus('ล้มเหลว: ' + e.message);
    }
  };

  const loadDemoData = async () => {
    if (!user) return;
    setUploadStatus('กำลังสร้าง Demo ขึ้น Cloud...');
    const dS = []; const dL = []; const dA = [];
    for (let i = 1; i <= 10; i++) {
      const sid = i.toString().padStart(3, '0');
      const rm = `10${Math.ceil(i / 2)}`;
      dS.push({ id: sid, name: `นรม. สมมติ ${sid}`, room: rm, baseline: 'Medium', tag: '', isUnderCare: false, demographics: { age: 19, gender: 'ชาย', region: 'กทม.', school: 'มัธยมปลาย', familyHistory: 'ไม่มี', financialBurden: 'ไม่มี' } });
      [0, 4, 8, 16].forEach(wk => dA.push({ id: `assess_${sid}_${wk}`, studentId: sid, week: wk, dass_d: 6, dass_a: 5, dass_s: 8, cd_risc: 75, drawing_note: 'วาดภาพปกติ' }));
      for (let w = 1; w <= 16; w++) {
        for (let d_idx = 0; d_idx < 7; d_idx++) {
          let date = new Date(2026, 4, 12);
          date.setDate(date.getDate() + ((w - 1) * 7) + d_idx);
          const dStr = date.toISOString().split('T')[0];
          dL.push({ id: `log_${sid}_${dStr}`, studentId: sid, date: dStr, week: w, self: 1, buddy: 1, command: 1, fatigue: 2, injury: 0 });
        }
      }
    }
    await commitInBatches('students', dS, 'id');
    await commitInBatches('assessments', dA, 'id');
    await commitInBatches('logs', dL, 'id');
    setUploadStatus('โหลด Demo สำเร็จ');
  };

  const handleExportMasterData = () => {
    let csv = "\uFEFF";
    csv += "Student_ID,Name,Room,Age,Gender,Region,School,Baseline_Risk,Date,Week,Self,Buddy,Command,Fatigue,DASS_Stress,CD_RISC\n";
    students.forEach(s => {
      const sL = logs.filter(l => l.studentId === s.id);
      sL.forEach(l => {
        const a = assessments.find(ax => ax.studentId === s.id && ax.week === l.week) || {};
        const r = [s.id, s.name, s.room, s.demographics?.age, s.demographics?.gender, s.demographics?.region, s.demographics?.school, s.baseline, l.date, l.week, l.self, l.buddy, l.command, l.fatigue, a.dass_s || '', a.cd_risc || ''];
        csv += r.map(escapeCSV).join(",") + "\n";
      });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', "Sentinel_Research_MasterData.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const populationTrend = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const w = i + 1;
    const wL = logs.filter(l => l.week === w);
    const selfStats = getStats(wL.map(l => l.self));
    const buddyStats = getStats(wL.map(l => l.buddy));
    const cmdStats = getStats(wL.map(l => l.command));
    return { week: `Wk ${w}`, self: selfStats.mean, self_sd: selfStats.sd, buddy: buddyStats.mean, buddy_sd: buddyStats.sd, command: cmdStats.mean, command_sd: cmdStats.sd };
  }), [logs]);

  const psychTrend = useMemo(() => [0, 4, 8, 16].map(w => {
    const wA = assessments.filter(a => a.week === w);
    const dassStats = getStats(wA.map(a => a.dass_s).filter(x => x !== null));
    const cdStats = getStats(wA.map(a => a.cd_risc).filter(x => x !== null));
    return { week: `Wk ${w}`, dass_s: dassStats.mean, dass_s_sd: dassStats.sd, cd_risc: cdStats.mean, cd_risc_sd: cdStats.sd };
  }), [assessments]);

  // ==========================================
  // RENDERS
  // ==========================================
  const renderOverview = () => {
    const isLoading = loadingStudents || loadingLogs || loadingAssessments;
    const demoStats = {
      avgAge: students.length > 0 ? (students.filter(s => s.demographics?.age > 0).reduce((a, b) => a + (b.demographics?.age || 0), 0) / Math.max(1, students.filter(s => s.demographics?.age > 0).length)).toFixed(1) : 0,
      familyRisk: students.filter(s => s.demographics?.familyHistory !== 'ไม่มี').length,
      burdenRisk: students.filter(s => s.demographics?.financialBurden === 'สูง').length
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'นรม. ทั้งหมด', value: students.length, icon: Users, bg: 'bg-blue-50', color: 'text-blue-600' },
            { label: 'บันทึกรายวัน (Logs)', value: logs.length, icon: Activity, bg: 'bg-rose-50', color: 'text-rose-600' },
            { label: 'แบบประเมิน (Assess)', value: assessments.length, icon: ShieldCheck, bg: 'bg-purple-50', color: 'text-purple-600' },
          ].map(({ label, value, icon: Icon, bg, color }) => (
            <div key={label} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
              <div className={`p-3 ${bg} ${color} rounded-xl`}><Icon size={24} /></div>
              <div>
                <p className="text-sm font-medium opacity-60">{label}</p>
                {isLoading ? <Skeleton className="h-8 w-16 mt-1" /> : <p className="text-2xl font-bold">{value}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-4 flex items-center text-slate-800"><BookOpen className="mr-2 text-blue-500" size={20} /> Demographic & Baseline Data</h3>
          {loadingStudents ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-24" /><Skeleton className="h-24" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-50 p-4 rounded-xl">
                <p className="text-sm font-bold text-slate-500 mb-2">โปรไฟล์ทั่วไป</p>
                <p className="text-sm">อายุเฉลี่ย: <b>{demoStats.avgAge} ปี</b></p>
                <p className="text-sm">นรม. ในคัดกรอง: <b>{students.length} นาย</b></p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl">
                <p className="text-sm font-bold text-slate-500 mb-2">ปัจจัยความเสี่ยง</p>
                <p className="text-sm text-rose-600">ประวัติจิตเวชครอบครัว: <b>{demoStats.familyRisk} นาย</b></p>
                <p className="text-sm text-rose-600">ภาระกังวลทางบ้านสูง: <b>{demoStats.burdenRisk} นาย</b></p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold mb-6 flex items-center text-slate-800"><Activity className="mr-2 text-blue-500" size={20} /> Population Trend: 4 Colors</h3>
            {loadingLogs ? <Skeleton className="h-72" /> : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={populationTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} />
                    <YAxis domain={[1, 4]} ticks={[1, 2, 3, 4]} />
                    <RechartsTooltip content={({ active, payload, label }) => active && payload ? (
                      <div className="bg-white p-3 border rounded-lg shadow-xl text-xs">
                        <p className="font-bold mb-2 border-b pb-1">{label}</p>
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
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold mb-6 flex items-center text-slate-800"><ShieldCheck className="mr-2 text-purple-500" size={20} /> Psychological Baseline (Mean)</h3>
            {loadingAssessments ? <Skeleton className="h-72" /> : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={psychTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} />
                    <YAxis yAxisId="left" domain={[0, 42]} label={{ value: 'DASS-21', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} label={{ value: 'CD-RISC', angle: 90, position: 'insideRight', style: { fontSize: 10 } }} />
                    <RechartsTooltip content={({ active, payload, label }) => active && payload ? (
                      <div className="bg-white p-3 border rounded-lg shadow-xl text-xs">
                        <p className="font-bold mb-2 border-b pb-1">{label}</p>
                        {payload.map((e, i) => e.value ? <p key={i} style={{ color: e.color }}>{e.name}: {e.value} (SD: {e.payload[`${e.dataKey}_sd`]})</p> : null)}
                      </div>
                    ) : null} />
                    <Legend iconType="circle" />
                    <Line yAxisId="left" type="monotone" dataKey="dass_s" name="Stress (DASS)" stroke="#ef4444" strokeWidth={3} dot={{ r: 5 }} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="cd_risc" name="CD-RISC" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 5 }} connectNulls strokeDasharray="5 5" />
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
    const lDate = logs.filter(l => l.date === heatmapDate);
    const m = {};
    lDate.forEach(l => m[l.studentId] = l);
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
        {loadingStudents || loadingLogs ? (
          <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>
        ) : rooms.length > 0 ? rooms.map(rm => (
          <div key={rm} className="mb-10">
            <h4 className="text-lg font-bold mb-4 text-blue-700 bg-blue-50/50 inline-block px-4 py-1 rounded-full">ห้องพัก: {rm}</h4>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50/80 text-slate-500">
                  <tr><th className="p-4">ID</th><th className="p-4">ชื่อ-สกุล</th><th className="p-4 text-center">Self</th><th className="p-4 text-center">Buddy</th><th className="p-4 text-center">Command</th><th className="p-4 text-center">Fatigue</th></tr>
                </thead>
                <tbody>
                  {students.filter(s => s.room === rm).map(s => {
                    const st = m[s.id] || { self: 0, buddy: 0, command: 0, fatigue: 0 };
                    return (
                      <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                        <td className="p-4 text-slate-400">{s.id}</td>
                        <td className="p-4 font-bold text-slate-700">{s.name}</td>
                        <td className="p-4"><div className="w-full h-8 rounded-lg shadow-inner" style={{ backgroundColor: COLORS[st.self] || '#f1f5f9' }}></div></td>
                        <td className="p-4"><div className="w-full h-8 rounded-lg shadow-inner" style={{ backgroundColor: COLORS[st.buddy] || '#f1f5f9' }}></div></td>
                        <td className="p-4"><div className="w-full h-8 rounded-lg shadow-inner" style={{ backgroundColor: COLORS[st.command] || '#f1f5f9' }}></div></td>
                        <td className="p-4 text-center font-bold text-slate-600">{st.self > 0 ? `${st.fatigue}/10` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )) : <div className="text-center p-20 text-slate-400">ยังไม่มีข้อมูล นรม. ในระบบ</div>}
      </div>
    );
  };

  const renderIndividual = () => {
    const s = students.find(x => x.id === selectedStudent);
    if (loadingStudents) return <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;
    if (!s) return <div className="p-12 text-center text-slate-400">กรุณาเลือกนักเรียนจากเมนู</div>;
    const sL = logs.filter(l => l.studentId === selectedStudent).sort((a, b) => new Date(a.date) - new Date(b.date));
    const sA = assessments.filter(a => a.studentId === selectedStudent).sort((a, b) => a.week - b.week);

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold">ผลวิเคราะห์: {s.name}</h3>
          <select className="bg-slate-50 border rounded-xl px-4 py-2 font-bold outline-none" value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
            {students.map(sx => <option key={sx.id} value={sx.id}>{sx.id} - {sx.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <h4 className="font-bold border-b pb-2 text-blue-600">ข้อมูลพื้นฐาน</h4>
            <div className="text-sm space-y-2">
              <p>ห้องพัก: <b>{s.room}</b></p>
              <p>ภูมิลำเนา: <b>{s.demographics?.region}</b></p>
              <p>ภาระทางบ้าน: <b className={s.demographics?.financialBurden === 'สูง' ? 'text-rose-500' : ''}>{s.demographics?.financialBurden}</b></p>
              <p>ประวัติจิตเวช: <b className={s.demographics?.familyHistory !== 'ไม่มี' ? 'text-rose-500' : ''}>{s.demographics?.familyHistory}</b></p>
            </div>
            <div className="pt-4 border-t">
              <h4 className="font-bold text-slate-800 mb-2">Note (Drawing Test)</h4>
              <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg">"{sA.find(x => x.week === 0)?.drawing_note || 'ไม่มีข้อมูล'}"</p>
            </div>
          </div>
          <div className="col-span-1 xl:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="font-bold mb-4">4 Colors Trend (รายวัน)</h4>
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
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="font-bold mb-4">Psychological Assessments (รายสัปดาห์)</h4>
              {loadingAssessments ? <Skeleton className="h-56" /> : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sA}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} />
                      <YAxis yAxisId="left" domain={[0, 42]} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                      <RechartsTooltip />
                      <Line yAxisId="left" type="monotone" dataKey="dass_s" name="Stress" stroke="#ef4444" strokeWidth={4} />
                      <Line yAxisId="right" type="monotone" dataKey="cd_risc" name="CD-RISC" stroke="#8b5cf6" strokeWidth={4} strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDataEntry = () => (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-black text-blue-900 flex items-center"><Database className="mr-3 text-blue-500" /> Data Center</h3>
          <p className="text-sm text-slate-500 mt-2">ศูนย์จัดการฐานข้อมูล Cloud (Live Sync Active)</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleExportMasterData} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center shadow-lg transition-all"><Download size={18} className="mr-2" /> Export CSV</button>
          <button onClick={loadDemoData} className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-6 py-2.5 rounded-xl text-sm font-bold flex items-center border border-indigo-200 transition-all">Load Demo</button>
          <button onClick={() => setShowConfirmReset(true)} className="bg-rose-50 text-rose-700 hover:bg-rose-100 px-6 py-2.5 rounded-xl text-sm font-bold flex items-center border border-rose-200 transition-all">Reset Cloud</button>
        </div>
      </div>

      {showConfirmReset && (
        <div className="bg-rose-600 p-8 rounded-2xl text-center text-white shadow-2xl animate-pulse">
          <AlertTriangle size={48} className="mx-auto mb-4" />
          <h4 className="text-xl font-bold mb-6">ยืนยันการล้างฐานข้อมูล Cloud ถาวร?</h4>
          <div className="flex justify-center space-x-4">
            <button onClick={() => setShowConfirmReset(false)} className="px-8 py-2 bg-white/20 rounded-xl font-bold">ยกเลิก</button>
            <button onClick={handleResetData} className="px-8 py-2 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50">ยืนยันการลบ</button>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-8 gap-4 border-b pb-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center"><UploadCloud className="mr-3 text-blue-500" /> นำเข้า CSV (Bulk)</h3>
          <select className="bg-blue-50 text-blue-800 font-bold text-sm rounded-xl px-4 py-2 outline-none border border-blue-100" value={csvUploadType} onChange={(e) => setCsvUploadType(e.target.value)}>
            <option value="daily">บันทึกรายวัน (4 สี)</option>
            <option value="demographic">ประวัติพื้นฐาน (Demographic)</option>
            <option value="assessment">แบบประเมิน (Assessment)</option>
          </select>
        </div>
        <div className="space-y-6">
          <div className="p-12 border-4 border-dashed border-slate-100 bg-slate-50/50 rounded-3xl text-center hover:border-blue-200 transition-all cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
            <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-white shadow-lg group-hover:scale-110 transition-transform"><UploadCloud size={32} /></div>
            <p className="text-lg font-bold text-blue-900 tracking-tight">คลิกเพื่ออัปโหลดไฟล์ข้อมูล</p>
            <p className="text-xs text-slate-400 mt-2 font-medium italic">* ทุกคนจะเห็นข้อมูลที่อัปโหลดพร้อมกันทันที</p>
          </div>
          {uploadStatus && <div className="bg-blue-50 text-blue-700 p-4 rounded-xl text-center font-bold text-sm border border-blue-100">{uploadStatus}</div>}
          {/* FIX: downloadTemplate now passes the current csvUploadType */}
          <div className="flex justify-center">
            <button onClick={() => downloadTemplate(csvUploadType)} className="text-blue-500 font-bold text-xs flex items-center hover:underline bg-blue-50 px-4 py-1 rounded-full">
              <Download size={14} className="mr-1" /> Download Template ({csvUploadType}) ตัวอย่างที่นี่
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex bg-slate-50 p-1">
          {['daily', 'demographic', 'assessment'].map(t => (
            <button key={t} onClick={() => setEntrySubTab(t)} className={`flex-1 py-3 font-bold text-xs rounded-xl transition-all ${entrySubTab === t ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-400'}`}>
              {t === 'daily' ? 'บันทึกรายวัน' : t === 'demographic' ? 'ประวัติ' : 'แบบประเมิน'}
            </button>
          ))}
        </div>
        <div className="p-8">
          {entrySubTab === 'daily' && (
            <form onSubmit={handleDailySubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div><label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">รหัส นรม.</label><input type="text" className="w-full p-3 border-2 border-slate-100 rounded-xl bg-slate-50 outline-none focus:border-blue-400" value={dailyForm.studentId} onChange={(e) => setDailyForm({ ...dailyForm, studentId: e.target.value })} placeholder="001" required /></div>
                <div><label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">สัปดาห์ที่</label><input type="number" min="1" max="16" className="w-full p-3 border-2 border-slate-100 rounded-xl bg-slate-50 outline-none focus:border-blue-400" value={dailyForm.week} onChange={(e) => setDailyForm({ ...dailyForm, week: e.target.value })} required /></div>
                <div><label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">วันที่</label><input type="date" className="w-full p-3 border-2 border-slate-100 rounded-xl bg-slate-50 outline-none focus:border-blue-400" value={dailyForm.date} onChange={(e) => setDailyForm({ ...dailyForm, date: e.target.value })} required /></div>
              </div>
              <div className="grid grid-cols-3 gap-4 p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
                {['self', 'buddy', 'command'].map(k => (
                  <div key={k}><label className="block text-[10px] font-black text-blue-400 mb-2 uppercase tracking-widest">{k}</label><select className="w-full p-2 border border-blue-200 rounded-lg font-bold text-blue-900" value={dailyForm[k]} onChange={(e) => setDailyForm({ ...dailyForm, [k]: e.target.value })}><option value="1">1-เขียว</option><option value="2">2-เหลือง</option><option value="3">3-ส้ม</option><option value="4">4-แดง</option></select></div>
                ))}
              </div>
              <button type="submit" className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl shadow-slate-200 tracking-widest uppercase hover:bg-black transition-all">ยืนยันการบันทึกรายวัน</button>
            </form>
          )}
          {entrySubTab === 'demographic' && (
            <form onSubmit={handleDemoSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div><label className="block text-xs font-bold text-slate-400 mb-1">รหัส นรม.</label><input type="text" className="w-full p-3 border rounded-xl" value={demoForm.studentId} onChange={(e) => setDemoForm({ ...demoForm, studentId: e.target.value })} placeholder="001" required /></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">ชื่อ-สกุล</label><input type="text" className="w-full p-3 border rounded-xl" value={demoForm.name} onChange={(e) => setDemoForm({ ...demoForm, name: e.target.value })} placeholder="นรม. กรกฎ" required /></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">ห้องพัก</label><input type="text" className="w-full p-3 border rounded-xl" value={demoForm.room} onChange={(e) => setDemoForm({ ...demoForm, room: e.target.value })} placeholder="101" required /></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">อายุ</label><input type="number" className="w-full p-3 border rounded-xl" value={demoForm.age} onChange={(e) => setDemoForm({ ...demoForm, age: e.target.value })} placeholder="19" /></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">เพศ</label><select className="w-full p-3 border rounded-xl" value={demoForm.gender} onChange={(e) => setDemoForm({ ...demoForm, gender: e.target.value })}><option>ชาย</option><option>หญิง</option></select></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">ภูมิลำเนา</label><select className="w-full p-3 border rounded-xl" value={demoForm.region} onChange={(e) => setDemoForm({ ...demoForm, region: e.target.value })}><option>กทม.</option><option>ภาคกลาง</option><option>ภาคเหนือ</option><option>ภาคใต้</option><option>ภาคอีสาน</option></select></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">ประวัติจิตเวชครอบครัว</label><select className="w-full p-3 border rounded-xl" value={demoForm.familyHistory} onChange={(e) => setDemoForm({ ...demoForm, familyHistory: e.target.value })}><option>ไม่มี</option><option>มี</option></select></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">ภาระทางบ้าน</label><select className="w-full p-3 border rounded-xl" value={demoForm.financialBurden} onChange={(e) => setDemoForm({ ...demoForm, financialBurden: e.target.value })}><option>ไม่มี</option><option>ปานกลาง</option><option>สูง</option></select></div>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-blue-700 transition-all">บันทึกประวัติพื้นฐาน</button>
            </form>
          )}
          {entrySubTab === 'assessment' && (
            <form onSubmit={handleAssessSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="block text-xs font-bold text-slate-400 mb-1">รหัส นรม.</label><input type="text" className="w-full p-3 border rounded-xl" value={assessForm.studentId} onChange={(e) => setAssessForm({ ...assessForm, studentId: e.target.value })} placeholder="001" required /></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">สัปดาห์</label><select className="w-full p-3 border rounded-xl font-bold outline-none" value={assessForm.week} onChange={(e) => setAssessForm({ ...assessForm, week: e.target.value })}><option value="0">Wk 0</option><option value="4">Wk 4</option><option value="8">Wk 8</option><option value="16">Wk 16</option></select></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">DASS-21 Depression</label><input type="number" min="0" max="42" className="w-full p-3 border rounded-xl" value={assessForm.dass_d} onChange={(e) => setAssessForm({ ...assessForm, dass_d: e.target.value })} placeholder="0-42" /></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">DASS-21 Anxiety</label><input type="number" min="0" max="42" className="w-full p-3 border rounded-xl" value={assessForm.dass_a} onChange={(e) => setAssessForm({ ...assessForm, dass_a: e.target.value })} placeholder="0-42" /></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">DASS-21 Stress</label><input type="number" min="0" max="42" className="w-full p-3 border rounded-xl" value={assessForm.dass_s} onChange={(e) => setAssessForm({ ...assessForm, dass_s: e.target.value })} placeholder="0-42" /></div>
                <div><label className="block text-xs font-bold text-slate-400 mb-1">CD-RISC Score</label><input type="number" min="0" max="100" className="w-full p-3 border rounded-xl" value={assessForm.cd_risc} onChange={(e) => setAssessForm({ ...assessForm, cd_risc: e.target.value })} placeholder="0-100" /></div>
                <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-400 mb-1">Drawing Test Note</label><textarea className="w-full p-3 border rounded-xl" rows="3" value={assessForm.drawing_note} onChange={(e) => setAssessForm({ ...assessForm, drawing_note: e.target.value })} placeholder="สังเกตุจากภาพวาด..." /></div>
              </div>
              <button type="submit" className="w-full bg-purple-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-purple-700 transition-all">บันทึกผลการประเมิน</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );

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
            { id: 'entry', label: 'จัดการข้อมูล (Data)', icon: Database },
          ].map(m => (
            <button key={m.id} onClick={() => setActiveTab(m.id)} className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl transition-all duration-300 font-bold ${activeTab === m.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 translate-x-2' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              <m.icon size={20} /><span>{m.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-6 text-center border-t border-white/5 bg-slate-900/50">
          {authLoading
            ? <p className="text-[10px] text-orange-400 font-bold uppercase tracking-widest animate-pulse">Connecting to Cloud...</p>
            : user
              ? <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest italic">Live Cloud Sync: Active</p>
              : <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">Auth Failed — Offline</p>
          }
        </div>
      </div>

      <div className="flex-1 p-6 md:p-12 overflow-y-auto bg-[#f8fafc]">
        <header className="mb-12 flex justify-between items-end">
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">
              {activeTab === 'overview' && 'Population Trends'}
              {activeTab === 'heatmap' && 'Room Status'}
              {activeTab === 'individual' && 'Individual Tracking'}
              {activeTab === 'entry' && 'Data Center'}
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
          {activeTab === 'entry' && renderDataEntry()}
        </main>
      </div>
    </div>
  );
}
