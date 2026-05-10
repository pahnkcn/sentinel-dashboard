import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Brush, BarChart, Bar, ErrorBar
} from 'recharts';
import { 
  LayoutDashboard, Users, User, FileEdit, AlertTriangle, Activity, CheckCircle, Clock, HeartPulse, Stethoscope, UploadCloud, Download, Trash2, X, BookOpen, ShieldCheck, Database
} from 'lucide-react';

// ==========================================
// INITIAL STATES (CLEAN SLATE)
// ==========================================
const INITIAL_STUDENTS = [];
const INITIAL_LOGS = []; 
const INITIAL_ASSESSMENTS = [];

const COLORS = { 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444' };
const PIE_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

// Helper for Math
const getStats = (arr) => {
  if (!arr || arr.length === 0) return { mean: null, sd: null };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  const sd = Math.sqrt(variance);
  return { mean: parseFloat(mean.toFixed(2)), sd: parseFloat(sd.toFixed(2)) };
};

export default function App() {
  const [activeTab, setActiveTab] = useState('entry'); 
  const [entrySubTab, setEntrySubTab] = useState('daily'); // daily, demographic, assessment
  
  const [students, setStudents] = useState(INITIAL_STUDENTS);
  const [logs, setLogs] = useState(INITIAL_LOGS); 
  const [assessments, setAssessments] = useState(INITIAL_ASSESSMENTS);
  const [selectedStudent, setSelectedStudent] = useState('');
  
  const fileInputRef = useRef(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // --- FORM STATES ---
  const [dailyForm, setDailyForm] = useState({
    studentId: '', date: new Date().toISOString().split('T')[0], week: 1,
    self: 1, buddy: 1, command: 1, fatigue: 1, injury: 0
  });

  const [demoForm, setDemoForm] = useState({
    studentId: '', age: '', gender: 'ชาย', school: '', region: 'กทม.', familyHistory: 'ไม่มี', financialBurden: 'ไม่มี'
  });

  const [assessForm, setAssessForm] = useState({
    studentId: '', week: 0, dass_d: '', dass_a: '', dass_s: '', cd_risc: '', drawing_note: ''
  });

  useEffect(() => {
    if (students.length > 0 && !selectedStudent) setSelectedStudent(students[0].id);
  }, [students, selectedStudent]);

  // --- SUBMIT HANDLERS ---
  const handleDailySubmit = (e) => {
    e.preventDefault();
    const sid = dailyForm.studentId.trim();
    if (!sid) { alert('กรุณาระบุรหัส นรม.'); return; }
    
    setLogs([...logs, { ...dailyForm, id: Date.now(), studentId: sid,
      self: parseInt(dailyForm.self), buddy: parseInt(dailyForm.buddy), command: parseInt(dailyForm.command), 
      fatigue: parseInt(dailyForm.fatigue), injury: parseInt(dailyForm.injury), week: parseInt(dailyForm.week)
    }]);
    
    ensureStudentExists(sid);
    alert(`บันทึกข้อมูลรายวันของ นรม.รหัส ${sid} สำเร็จ!`);
    setDailyForm({...dailyForm, studentId: ''}); 
  };

  const handleDemoSubmit = (e) => {
    e.preventDefault();
    const sid = demoForm.studentId.trim();
    if (!sid) { alert('กรุณาระบุรหัส นรม.'); return; }
    
    ensureStudentExists(sid, demoForm);
    alert(`อัปเดตประวัติพื้นฐานของ นรม.รหัส ${sid} สำเร็จ!`);
    setDemoForm({ studentId: '', age: '', gender: 'ชาย', school: '', region: 'กทม.', familyHistory: 'ไม่มี', financialBurden: 'ไม่มี' });
  };

  const handleAssessSubmit = (e) => {
    e.preventDefault();
    const sid = assessForm.studentId.trim();
    if (!sid) { alert('กรุณาระบุรหัส นรม.'); return; }
    
    setAssessments([...assessments, {
      id: Date.now(), studentId: sid, week: parseInt(assessForm.week),
      dass_d: assessForm.dass_d ? parseInt(assessForm.dass_d) : null,
      dass_a: assessForm.dass_a ? parseInt(assessForm.dass_a) : null,
      dass_s: assessForm.dass_s ? parseInt(assessForm.dass_s) : null,
      cd_risc: assessForm.cd_risc ? parseInt(assessForm.cd_risc) : null,
      drawing_note: assessForm.drawing_note
    }]);
    ensureStudentExists(sid);
    alert(`บันทึกแบบประเมิน Wk ${assessForm.week} ของ นรม.รหัส ${sid} สำเร็จ!`);
    setAssessForm({ studentId: '', week: 0, dass_d: '', dass_a: '', dass_s: '', cd_risc: '', drawing_note: '' });
  };

  const ensureStudentExists = (sid, demoData = null) => {
    setStudents(prev => {
      const existingIndex = prev.findIndex(s => s.id === sid);
      if (existingIndex >= 0) {
        if (demoData) {
          const updated = [...prev];
          updated[existingIndex].demographics = { ...demoData, age: parseInt(demoData.age)||0 };
          return updated;
        }
        return prev;
      }
      return [...prev, {
        id: sid, name: `นรม. รหัส ${sid}`, room: 'ไม่ระบุ', baseline: 'Medium', tag: '', isUnderCare: false,
        demographics: demoData ? { ...demoData, age: parseInt(demoData.age)||0 } : { age: 0, gender: 'ไม่ระบุ', school: 'ไม่ระบุ', region: 'ไม่ระบุ', familyHistory: 'ไม่ระบุ', financialBurden: 'ไม่ระบุ' }
      }];
    });
  };

  const handleResetData = () => {
    setLogs([]); setAssessments([]); setStudents([]); setSelectedStudent('');
    setUploadStatus('รีเซ็ตข้อมูลกราฟและรายชื่อทั้งหมดกลับเป็นศูนย์เรียบร้อยแล้ว'); 
    setShowConfirmReset(false);
  };

  // --- DEMO DATA GENERATOR ---
  const loadDemoData = () => {
    const demoStudents = []; const demoLogs = []; const demoAssess = [];
    for(let i=1; i<=30; i++) {
      const sid = i.toString().padStart(3, '0');
      const isHighRisk = Math.random() > 0.8;
      demoStudents.push({
        id: sid, name: `นรม. สมมติ ${sid}`, room: i%2===0?'101':'102', baseline: isHighRisk?'High':'Low', tag: '', isUnderCare: isHighRisk,
        demographics: { age: 18 + Math.floor(Math.random()*4), gender: 'ชาย', school: 'มัธยมปลาย', region: i%3===0?'กทม.':'ต่างจังหวัด', familyHistory: isHighRisk?'มีประวัติ':'ไม่มี', financialBurden: isHighRisk?'สูง':'ไม่มี' }
      });

      // 16 Weeks Assessments
      [0, 4, 8, 16].forEach(wk => {
        let baseStress = isHighRisk ? 14 : 6;
        let stress = Math.max(0, baseStress + (Math.random()*10 - 5) + (wk===8 ? 6 : 0) - (wk===16 ? 4 : 0)); // Wk 8 พีค, Wk 16 ลง
        let cdRisc = Math.max(0, Math.min(100, (isHighRisk ? 40 : 70) + (wk*1.5) + (Math.random()*10 - 5))); // ภูมิคุ้มกันใจค่อยๆเพิ่ม
        
        if (wk === 0 || wk === 4 || wk === 8 || wk === 16) {
          demoAssess.push({ id: Date.now()+Math.random(), studentId: sid, week: wk, dass_d: Math.round(stress*0.8), dass_a: Math.round(stress*0.9), dass_s: Math.round(stress), cd_risc: (wk===0||wk===8||wk===16)?Math.round(cdRisc):null, drawing_note: wk===0?'วาดภาพปกติ':'' });
        }
      });

      // Daily Logs (Sample 1 per week for simplicity in demo)
      for(let w=1; w<=16; w++) {
        let mental = isHighRisk ? (w>=6 && w<=10 ? 3 : 2) : (w>=7 && w<=9 ? 2 : 1);
        demoLogs.push({ id: Date.now()+Math.random(), studentId: sid, date: `2026-05-${w.toString().padStart(2,'0')}`, week: w, self: mental, buddy: mental, command: mental, fatigue: Math.floor(Math.random()*5)+ (w>=6&&w<=10?4:1), injury: 0 });
      }
    }
    setStudents(demoStudents); setLogs(demoLogs); setAssessments(demoAssess);
    setUploadStatus('โหลดข้อมูลจำลอง 16 สัปดาห์เรียบร้อยแล้ว');
  };

  // --- DATA AGGREGATION ---
  const latestLogs = useMemo(() => {
    const map = {}; logs.forEach(log => { if (!map[log.studentId] || new Date(log.date) > new Date(map[log.studentId].date)) map[log.studentId] = log; });
    return map;
  }, [logs]);

  const studentsWithLatestStatus = useMemo(() => {
    return students.map(s => ({ ...s, currentStatus: latestLogs[s.id] || { self: 0, buddy: 0, command: 0, fatigue: 0, injury: 0 } }));
  }, [students, latestLogs]);

  // Overall Population Trend (Weekly)
  const populationWeeklyTrend = useMemo(() => {
    const weeksData = [];
    for (let w = 1; w <= 16; w++) {
      const weekLogs = logs.filter(l => l.week === w);
      const selfArr = weekLogs.map(l => l.self);
      const buddyArr = weekLogs.map(l => l.buddy);
      const cmdArr = weekLogs.map(l => l.command);
      weeksData.push({
        week: `Wk ${w}`,
        self: getStats(selfArr), buddy: getStats(buddyArr), command: getStats(cmdArr)
      });
    }
    return weeksData;
  }, [logs]);

  // Assessments Population Trend
  const assessWeeklyTrend = useMemo(() => {
    const weeks = [0, 4, 8, 16];
    return weeks.map(w => {
      const wData = assessments.filter(a => a.week === w);
      return {
        week: `Wk ${w}`,
        dass_s: getStats(wData.map(a => a.dass_s).filter(x => x!==null)),
        cd_risc: getStats(wData.map(a => a.cd_risc).filter(x => x!==null)),
      };
    });
  }, [assessments]);

  const getAlertBadge = (status) => {
    if (!status || !status.self || status.self === 0) return <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded-full">ยังไม่มีข้อมูล</span>;
    const maxScore = Math.max(status.self, status.buddy, status.command);
    if (maxScore >= 4) return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-bold">วิกฤต (Ill)</span>;
    if (maxScore === 3) return <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-bold">บาดเจ็บ (Injured)</span>;
    if (status.self === 1 && (status.buddy >= 3 || status.command >= 3)) return <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-bold">ปกปิด (Denial)</span>;
    return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">ปกติ</span>;
  };

  // --- RENDERERS ---
  const renderOverview = () => {
    // Pie data logic for current status overview
    const overallStats = { 1: 0, 2: 0, 3: 0, 4: 0, injury: 0, total: students.length };
    Object.values(latestLogs).forEach(log => {
      const maxMental = Math.max(log.self, log.buddy, log.command);
      if (overallStats[maxMental] !== undefined) overallStats[maxMental]++;
      if (log.injury === 1) overallStats.injury++;
    });

    const demographicStats = {
      avgAge: students.length > 0 ? (students.filter(s=>s.demographics.age>0).reduce((a,b)=>a+b.demographics.age,0)/Math.max(1,students.filter(s=>s.demographics.age>0).length)).toFixed(1) : 0,
      regions: students.reduce((acc, s) => { acc[s.demographics.region] = (acc[s.demographics.region] || 0) + 1; return acc; }, {}),
      familyHistoryCount: students.filter(s => s.demographics.familyHistory && s.demographics.familyHistory !== 'ไม่มี' && s.demographics.familyHistory !== 'ไม่ระบุ').length,
      financialBurdenCount: students.filter(s => s.demographics.financialBurden && s.demographics.financialBurden.includes('สูง')).length
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Users size={24} /></div>
            <div><p className="text-sm text-slate-500">นรม. ทั้งหมด</p><p className="text-2xl font-bold">{students.length}</p></div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-lg"><AlertTriangle size={24} /></div>
            <div><p className="text-sm text-slate-500">บันทึกรายวันแล้ว (Logs)</p><p className="text-2xl font-bold">{logs.length}</p></div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><ShieldCheck size={24} /></div>
            <div><p className="text-sm text-slate-500">แบบประเมินแล้ว (Assess)</p><p className="text-2xl font-bold">{assessments.length}</p></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-4 text-slate-800 flex items-center"><BookOpen className="mr-2 text-blue-600" size={20}/> ข้อมูลประชากรศาสตร์ (Demographic)</h3>
          {students.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-slate-100 rounded-lg p-4 bg-slate-50">
                <h4 className="text-sm font-semibold text-slate-500 mb-2">โปรไฟล์ทั่วไป</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between"><span>อายุเฉลี่ย:</span> <span className="font-bold text-slate-700">{demographicStats.avgAge} ปี</span></li>
                  <li className="flex justify-between"><span>กทม. / ต่างจังหวัด:</span> <span className="font-bold text-slate-700">{demographicStats.regions['กทม.'] || 0} / {students.length - (demographicStats.regions['กทม.'] || 0)}</span></li>
                </ul>
              </div>
              <div className="border border-slate-100 rounded-lg p-4 bg-slate-50">
                <h4 className="text-sm font-semibold text-slate-500 mb-2">ปัจจัยความเครียดจากประวัติ</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between"><span>ประวัติจิตเวชครอบครัว (มี):</span> <span className="font-bold text-orange-600">{demographicStats.familyHistoryCount} คน</span></li>
                  <li className="flex justify-between"><span>ภาระทางบ้าน (สูง):</span> <span className="font-bold text-orange-600">{demographicStats.financialBurdenCount} คน</span></li>
                </ul>
              </div>
            </div>
          ) : <div className="text-center text-slate-400 py-4">ไม่มีข้อมูล</div>}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold mb-4 text-slate-800">Population Trend: 4 Colors (Mean ± SD)</h3>
            <div className="h-72">
              {logs.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={populationWeeklyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="week" tick={{fontSize: 10}} />
                    <YAxis domain={[0, 4]} ticks={[1,2,3,4]} label={{ value: 'Mental Score', angle: -90, position: 'insideLeft', style: {fontSize: 12} }} />
                    <RechartsTooltip content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-3 border shadow rounded text-sm">
                            <p className="font-bold mb-1">{label}</p>
                            {payload.map((entry, idx) => (
                              <p key={idx} style={{color: entry.color}}>
                                {entry.name}: {entry.value?.mean} (SD: {entry.value?.sd})
                              </p>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Legend />
                    <Line type="monotone" dataKey="self" name="Self" stroke="#3b82f6" strokeWidth={2} dot={{r:3}} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="buddy" name="Buddy" stroke="#10b981" strokeWidth={2} dot={{r:3}} />
                    <Line type="monotone" dataKey="command" name="Command" stroke="#f59e0b" strokeWidth={2} dot={{r:3}} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="flex justify-center items-center h-full text-slate-400">ยังไม่มีข้อมูล</div>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold mb-4 text-slate-800">Population Trend: DASS-21 & CD-RISC (Mean)</h3>
            <div className="h-72">
              {assessments.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={assessWeeklyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="week" tick={{fontSize: 10}} />
                    <YAxis yAxisId="left" domain={[0, 42]} label={{ value: 'DASS-21 (Stress)', angle: -90, position: 'insideLeft', style: {fontSize: 12} }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} label={{ value: 'CD-RISC', angle: 90, position: 'insideRight', style: {fontSize: 12} }} />
                    <RechartsTooltip content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-3 border shadow rounded text-sm">
                            <p className="font-bold mb-1">{label}</p>
                            {payload.map((entry, idx) => entry.value?.mean !== null ? (
                              <p key={idx} style={{color: entry.color}}>
                                {entry.name}: {entry.value?.mean} (SD: {entry.value?.sd})
                              </p>
                            ) : null)}
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="dass_s" name="Stress (DASS)" stroke="#ef4444" strokeWidth={3} dot={{r:5}} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="cd_risc" name="Resilience (CD-RISC)" stroke="#8b5cf6" strokeWidth={3} dot={{r:5}} connectNulls strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="flex justify-center items-center h-full text-slate-400">ยังไม่มีข้อมูล</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDERING HEATMAP TAB ---
  const renderHeatmap = () => {
    if (students.length === 0) return <div className="text-center p-12 text-slate-500">ไม่พบข้อมูล กรุณานำเข้าข้อมูลก่อน</div>;
    const rooms = [...new Set(studentsWithLatestStatus.map(s => s.room))];
    
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold mb-4 text-slate-800">Heatmap สภาวะจิตใจล่าสุดแยกตามห้องพัก</h3>
        {rooms.map(room => (
          <div key={room} className="mb-8">
            <h4 className="text-md font-semibold mb-3 text-slate-600 border-b pb-2">ห้องพัก: {room}</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-3 w-16">ID</th><th className="p-3 w-48">ชื่อ-สกุล</th>
                    <th className="p-3 text-center">Self<br/><span className="text-xs font-normal text-slate-400">(ล่าสุด)</span></th>
                    <th className="p-3 text-center">Buddy<br/><span className="text-xs font-normal text-slate-400">(ล่าสุด)</span></th>
                    <th className="p-3 text-center">Command<br/><span className="text-xs font-normal text-slate-400">(ล่าสุด)</span></th>
                    <th className="p-3 text-center">Fatigue</th><th className="p-3 text-center">ป่วย/เจ็บ</th><th className="p-3">Alert Score</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsWithLatestStatus.filter(s => s.room === room).map(s => {
                    const hasData = s.currentStatus.self > 0;
                    return (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="p-3 font-medium text-slate-500">{s.id}</td><td className="p-3">{s.name}</td>
                      <td className="p-3"><div className={`w-full h-8 rounded ${!hasData && 'bg-slate-200'}`} style={{backgroundColor: COLORS[s.currentStatus.self]}}></div></td>
                      <td className="p-3"><div className={`w-full h-8 rounded ${!hasData && 'bg-slate-200'}`} style={{backgroundColor: COLORS[s.currentStatus.buddy]}}></div></td>
                      <td className="p-3"><div className={`w-full h-8 rounded ${!hasData && 'bg-slate-200'}`} style={{backgroundColor: COLORS[s.currentStatus.command]}}></div></td>
                      <td className="p-3 text-center font-bold text-slate-700">{hasData ? `${s.currentStatus.fatigue}/10` : '-'}</td>
                      <td className="p-3 text-center">{s.currentStatus.injury === 1 ? <span className="text-red-500 font-bold">Yes</span> : <span className="text-slate-300">-</span>}</td>
                      <td className="p-3">{getAlertBadge(s.currentStatus)}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderIndividual = () => {
    if (students.length === 0) return <div className="text-center p-12 text-slate-500">ไม่พบข้อมูล กรุณานำเข้าข้อมูลก่อน</div>;
    const studentInfo = students.find(s => s.id === selectedStudent);
    if(!studentInfo) return null;

    const studentLogs = logs.filter(l => l.studentId === selectedStudent).sort((a,b) => a.week - b.week);
    const studentAssess = assessments.filter(a => a.studentId === selectedStudent).sort((a,b) => a.week - b.week);

    const chartDataColors = studentLogs.map(l => ({ week: `Wk ${l.week}`, self: l.self, buddy: l.buddy, cmd: l.command }));
    const chartDataPsych = studentAssess.map(a => ({ week: `Wk ${a.week}`, dass_s: a.dass_s, cd_risc: a.cd_risc }));

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">วิเคราะห์ข้อมูลรายบุคคล (Individual Tracking)</h3>
          <select className="p-2 border rounded-lg bg-slate-50 font-bold" value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
            {students.map(s => <option key={s.id} value={s.id}>{s.id} - {s.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-6">
            <div>
              <h4 className="font-bold text-slate-800 mb-4 border-b pb-2 flex items-center"><User size={18} className="mr-2"/> ประวัติพื้นฐาน (Demographics)</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex justify-between"><span>อายุ/เพศ:</span> <span className="font-bold">{studentInfo.demographics.age||'-'} / {studentInfo.demographics.gender}</span></li>
                <li className="flex justify-between"><span>โรงเรียน:</span> <span>{studentInfo.demographics.school}</span></li>
                <li className="flex justify-between"><span>ภูมิลำเนา:</span> <span>{studentInfo.demographics.region}</span></li>
                <li className="flex justify-between"><span>ภาระทางบ้าน:</span> <span className={studentInfo.demographics.financialBurden.includes('สูง')?'text-red-500 font-bold':''}>{studentInfo.demographics.financialBurden}</span></li>
                <li className="flex justify-between"><span>ประวัติจิตเวช:</span> <span className={studentInfo.demographics.familyHistory!=='ไม่มี'&&studentInfo.demographics.familyHistory!=='ไม่ระบุ'?'text-red-500 font-bold':''}>{studentInfo.demographics.familyHistory}</span></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 mb-4 border-b pb-2 flex items-center"><ShieldCheck size={18} className="mr-2"/> ผลประเมินรู้วาด (Drawing Test)</h4>
              <p className="text-sm text-slate-600 italic">"{studentAssess.find(a=>a.week===0)?.drawing_note || 'ไม่มีข้อมูลบันทึก'}"</p>
            </div>
          </div>

          <div className="col-span-1 xl:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-4">แนวโน้ม 4 สี (Daily Color Trend)</h4>
              <div className="h-48">
                {chartDataColors.length>0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartDataColors} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="week" tick={{fontSize: 10}} />
                      <YAxis domain={[0, 4]} ticks={[1,2,3,4]} style={{fontSize: 10}} />
                      <RechartsTooltip /> <Legend />
                      <Line type="monotone" dataKey="self" stroke="#3b82f6" strokeWidth={2} />
                      <Line type="monotone" dataKey="buddy" stroke="#10b981" strokeWidth={2} />
                      <Line type="monotone" dataKey="cmd" name="Command" stroke="#f59e0b" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div className="text-center text-slate-400 mt-10">ไม่มีข้อมูลรายวัน</div>}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-4">แนวโน้มจิตวิทยาคลินิก (Psychological Assessments)</h4>
              <div className="h-48">
                {chartDataPsych.length>0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartDataPsych} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="week" tick={{fontSize: 10}} />
                      <YAxis yAxisId="left" domain={[0, 42]} style={{fontSize: 10}} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} style={{fontSize: 10}} />
                      <RechartsTooltip /> <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="dass_s" name="Stress (DASS)" stroke="#ef4444" strokeWidth={3} connectNulls />
                      <Line yAxisId="right" type="monotone" dataKey="cd_risc" name="CD-RISC" stroke="#8b5cf6" strokeWidth={3} strokeDasharray="5 5" connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div className="text-center text-slate-400 mt-10">ไม่มีข้อมูลแบบประเมิน</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDataEntry = () => (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-blue-800 flex items-center"><Database className="mr-2" /> ศูนย์จัดการข้อมูล (Data Center)</h3>
          <p className="text-sm text-slate-500 mt-1">คีย์ข้อมูลเข้า หรือ ล้างข้อมูลระบบ</p>
        </div>
        <div className="flex space-x-2">
          <button onClick={loadDemoData} className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-4 py-2 rounded-lg text-sm font-bold flex items-center transition">
            <Activity size={16} className="mr-2"/> โหลดข้อมูลจำลอง (Demo)
          </button>
          <button onClick={() => setShowConfirmReset(true)} className="bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg text-sm font-bold flex items-center transition">
            <Trash2 size={16} className="mr-2"/> ล้างข้อมูลทั้งหมด
          </button>
        </div>
      </div>

      {showConfirmReset && (
        <div className="bg-red-50 border border-red-200 p-6 rounded-xl text-center">
          <AlertTriangle size={32} className="text-red-500 mx-auto mb-2" />
          <h4 className="text-lg font-bold text-slate-800 mb-2">ยืนยันการล้างข้อมูล?</h4>
          <p className="text-sm text-slate-600 mb-4">ข้อมูลกราฟและรายชื่อทั้งหมดจะหายไป ไม่สามารถกู้คืนได้</p>
          <div className="flex justify-center space-x-4">
            <button onClick={() => setShowConfirmReset(false)} className="px-4 py-2 bg-slate-200 rounded font-medium">ยกเลิก</button>
            <button onClick={handleResetData} className="px-4 py-2 bg-red-600 text-white rounded font-medium">ลบข้อมูลทันที</button>
          </div>
        </div>
      )}

      {/* MANUAL ENTRY WITH TABS */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b">
          <button onClick={()=>setEntrySubTab('daily')} className={`flex-1 py-3 font-bold text-sm ${entrySubTab==='daily'?'bg-blue-50 text-blue-700 border-b-2 border-blue-600':'text-slate-500 hover:bg-slate-50'}`}>บันทึกรายวัน (4 สี)</button>
          <button onClick={()=>setEntrySubTab('demographic')} className={`flex-1 py-3 font-bold text-sm ${entrySubTab==='demographic'?'bg-blue-50 text-blue-700 border-b-2 border-blue-600':'text-slate-500 hover:bg-slate-50'}`}>ประวัติพื้นฐาน (Demographics)</button>
          <button onClick={()=>setEntrySubTab('assessment')} className={`flex-1 py-3 font-bold text-sm ${entrySubTab==='assessment'?'bg-blue-50 text-blue-700 border-b-2 border-blue-600':'text-slate-500 hover:bg-slate-50'}`}>แบบประเมินจิตวิทยา</button>
        </div>
        
        <div className="p-6">
          {/* TAB 1: DAILY */}
          {entrySubTab === 'daily' && (
            <form onSubmit={handleDailySubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">รหัสนักเรียน (ID)</label>
                  <input type="text" className="w-full p-2 border rounded-lg bg-slate-50 outline-none" value={dailyForm.studentId} onChange={(e) => setDailyForm({...dailyForm, studentId: e.target.value})} placeholder="เช่น 101" required />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">สัปดาห์ที่ (Week)</label>
                  <input type="number" min="1" max="16" className="w-full p-2 border rounded-lg bg-slate-50 outline-none" value={dailyForm.week} onChange={(e) => setDailyForm({...dailyForm, week: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">วันที่</label>
                  <input type="date" className="w-full p-2 border rounded-lg bg-slate-50 outline-none" value={dailyForm.date} onChange={(e) => setDailyForm({...dailyForm, date: e.target.value})} required />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border">
                <div><label className="block text-xs font-bold mb-1">Self</label><select className="w-full p-2 border rounded" value={dailyForm.self} onChange={(e)=>setDailyForm({...dailyForm,self:e.target.value})}><option value="1">1-เขียว</option><option value="2">2-เหลือง</option><option value="3">3-ส้ม</option><option value="4">4-แดง</option></select></div>
                <div><label className="block text-xs font-bold mb-1">Buddy</label><select className="w-full p-2 border rounded" value={dailyForm.buddy} onChange={(e)=>setDailyForm({...dailyForm,buddy:e.target.value})}><option value="1">1-เขียว</option><option value="2">2-เหลือง</option><option value="3">3-ส้ม</option><option value="4">4-แดง</option></select></div>
                <div><label className="block text-xs font-bold mb-1">Command</label><select className="w-full p-2 border rounded" value={dailyForm.command} onChange={(e)=>setDailyForm({...dailyForm,command:e.target.value})}><option value="1">1-เขียว</option><option value="2">2-เหลือง</option><option value="3">3-ส้ม</option><option value="4">4-แดง</option></select></div>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">บันทึกข้อมูลรายวัน</button>
            </form>
          )}

          {/* TAB 2: DEMOGRAPHICS */}
          {entrySubTab === 'demographic' && (
            <form onSubmit={handleDemoSubmit} className="space-y-5">
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm p-3 rounded-lg">* ข้อมูลส่วนนี้ควรกรอกเพียงครั้งแรกก่อนเริ่มการฝึก เพื่อใช้เป็น Baseline ทางสถิติ</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold text-slate-700 mb-1">รหัสนักเรียน (ID)</label><input type="text" className="w-full p-2 border rounded-lg bg-slate-50" value={demoForm.studentId} onChange={(e) => setDemoForm({...demoForm, studentId: e.target.value})} placeholder="เช่น 101" required /></div>
                <div><label className="block text-sm font-bold text-slate-700 mb-1">อายุ (ปี)</label><input type="number" className="w-full p-2 border rounded-lg bg-slate-50" value={demoForm.age} onChange={(e) => setDemoForm({...demoForm, age: e.target.value})} /></div>
                <div><label className="block text-sm font-bold text-slate-700 mb-1">ภูมิลำเนา (ภาค)</label><input type="text" className="w-full p-2 border rounded-lg bg-slate-50" value={demoForm.region} onChange={(e) => setDemoForm({...demoForm, region: e.target.value})} /></div>
                <div><label className="block text-sm font-bold text-slate-700 mb-1">โรงเรียนที่จบ</label><input type="text" className="w-full p-2 border rounded-lg bg-slate-50" value={demoForm.school} onChange={(e) => setDemoForm({...demoForm, school: e.target.value})} /></div>
                <div><label className="block text-sm font-bold text-slate-700 mb-1">ประวัติจิตเวชครอบครัว</label><select className="w-full p-2 border rounded-lg bg-slate-50" value={demoForm.familyHistory} onChange={(e) => setDemoForm({...demoForm, familyHistory: e.target.value})}><option value="ไม่มี">ไม่มี</option><option value="มี (ซึมเศร้า/วิตกกังวล)">มี (ซึมเศร้า/วิตกกังวล)</option><option value="มี (อื่นๆ)">มี (อื่นๆ)</option><option value="ไม่ระบุ">ไม่ระบุ</option></select></div>
                <div><label className="block text-sm font-bold text-slate-700 mb-1">ภาระความกังวลทางบ้าน</label><select className="w-full p-2 border rounded-lg bg-slate-50" value={demoForm.financialBurden} onChange={(e) => setDemoForm({...demoForm, financialBurden: e.target.value})}><option value="ไม่มี">ไม่มี/น้อย</option><option value="ปานกลาง">ปานกลาง</option><option value="สูง (การเงิน/ครอบครัว)">สูง (การเงิน/ครอบครัว)</option></select></div>
              </div>
              <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-4 rounded-lg">บันทึกประวัติพื้นฐาน</button>
            </form>
          )}

          {/* TAB 3: ASSESSMENTS */}
          {entrySubTab === 'assessment' && (
            <form onSubmit={handleAssessSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold text-slate-700 mb-1">รหัสนักเรียน (ID)</label><input type="text" className="w-full p-2 border rounded-lg bg-slate-50" value={assessForm.studentId} onChange={(e) => setAssessForm({...assessForm, studentId: e.target.value})} placeholder="เช่น 101" required /></div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">สัปดาห์ที่ประเมิน (Week)</label>
                  <select className="w-full p-2 border rounded-lg bg-slate-50" value={assessForm.week} onChange={(e) => setAssessForm({...assessForm, week: e.target.value})}>
                    <option value="0">Week 0 (ก่อนเริ่มฝึก)</option>
                    <option value="4">Week 4</option>
                    <option value="8">Week 8</option>
                    <option value="16">Week 16</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4">
                <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                  <h4 className="font-bold text-red-800 text-sm mb-2">DASS-21 (เก็บ Wk 0, 4, 8, 16)</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between"><label className="text-xs">Depression (D)</label><input type="number" className="w-20 p-1 border rounded" value={assessForm.dass_d} onChange={(e)=>setAssessForm({...assessForm,dass_d:e.target.value})} /></div>
                    <div className="flex items-center justify-between"><label className="text-xs">Anxiety (A)</label><input type="number" className="w-20 p-1 border rounded" value={assessForm.dass_a} onChange={(e)=>setAssessForm({...assessForm,dass_a:e.target.value})} /></div>
                    <div className="flex items-center justify-between"><label className="text-xs">Stress (S)</label><input type="number" className="w-20 p-1 border rounded" value={assessForm.dass_s} onChange={(e)=>setAssessForm({...assessForm,dass_s:e.target.value})} /></div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                    <h4 className="font-bold text-purple-800 text-sm mb-2">CD-RISC (เก็บ Wk 0, 8, 16)</h4>
                    <div className="flex items-center justify-between">
                      <label className="text-xs">คะแนนรวม (0-100)</label>
                      <input type="number" className="w-20 p-1 border rounded" value={assessForm.cd_risc} onChange={(e)=>setAssessForm({...assessForm,cd_risc:e.target.value})} disabled={assessForm.week==='4'} />
                    </div>
                    {assessForm.week === '4' && <p className="text-[10px] text-purple-600 mt-1">* Wk 4 ไม่มีการเก็บ CD-RISC ตามแผน</p>}
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg border">
                    <h4 className="font-bold text-slate-800 text-sm mb-2">บันทึกภาพวาด (Drawing Test)</h4>
                    <textarea className="w-full p-2 border rounded text-xs" rows="2" placeholder="เช่น ขาดมือ, วาดหัวโตกว่าปกติ..." value={assessForm.drawing_note} onChange={(e)=>setAssessForm({...assessForm, drawing_note:e.target.value})}></textarea>
                  </div>
                </div>
              </div>

              <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg">บันทึกแบบประเมินจิตวิทยา</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 flex flex-col md:flex-row">
      <div className="w-full md:w-64 bg-slate-900 text-white flex flex-col md:min-h-screen sticky top-0 z-10 shadow-xl">
        <div className="p-6 text-center border-b border-slate-800">
          <HeartPulse size={40} className="mx-auto mb-2 text-blue-400" />
          <h1 className="text-xl font-bold tracking-wider">SENTINEL</h1>
          <p className="text-xs text-slate-400 mt-1">Mental Health Dashboard</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <LayoutDashboard size={20} /><span>ภาพรวม (Overview)</span>
          </button>
          <button onClick={() => setActiveTab('heatmap')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'heatmap' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <Users size={20} /><span>สถานะรายห้อง (Heatmap)</span>
          </button>
          <button onClick={() => setActiveTab('individual')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'individual' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <User size={20} /><span>ติดตามรายบุคคล (Trends)</span>
          </button>
          <div className="pt-6 mt-6 border-t border-slate-800">
            <button onClick={() => setActiveTab('entry')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'entry' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'}`}>
              <Database size={20} /><span>ระบบจัดการข้อมูล (Data)</span>
            </button>
          </div>
        </nav>
      </div>

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {activeTab === 'overview' && 'ภาพรวมสุขภาพจิต นรม. (Population Trends)'}
              {activeTab === 'heatmap' && 'สถานะสุขภาพจิตแยกตามห้องพัก (Heatmap)'}
              {activeTab === 'individual' && 'การติดตามและวิเคราะห์แนวโน้มรายบุคคล'}
              {activeTab === 'entry' && 'ศูนย์จัดการข้อมูลประชากรและแบบประเมิน'}
            </h2>
            <p className="text-slate-500 text-sm mt-1 flex items-center">
              <Clock size={14} className="mr-1" /> ประมวลผลกราฟอัตโนมัติ
            </p>
          </div>
        </header>
        <main>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'heatmap' && renderHeatmap()}
          {activeTab === 'individual' && renderIndividual()}
          {activeTab === 'entry' && renderDataEntry()}
        </main>
      </div>
    </div>
  );
}