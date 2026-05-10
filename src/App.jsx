import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Brush
} from 'recharts';
import { 
  LayoutDashboard, Users, User, FileEdit, AlertTriangle, Activity, Clock, HeartPulse, ShieldCheck, UploadCloud, Download, Trash2, X, BookOpen, Database, Calendar
} from 'lucide-react';

// ==========================================
// FIREBASE CLOUD STORAGE CONFIGURATION
// ==========================================
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, writeBatch } from 'firebase/firestore';

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// ==========================================
// INITIAL STATES (CLEAN SLATE)
// ==========================================
const INITIAL_STUDENTS = [];
const INITIAL_LOGS = []; 
const INITIAL_ASSESSMENTS = [];

const COLORS = { 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444' };
const PIE_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

// Helper for Math (Sample Standard Deviation)
const getStats = (arr) => {
  if (!arr || arr.length === 0) return { mean: null, sd: null };
  if (arr.length === 1) return { mean: parseFloat(arr[0].toFixed(2)), sd: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (arr.length - 1);
  const sd = Math.sqrt(variance);
  return { mean: parseFloat(mean.toFixed(2)), sd: parseFloat(sd.toFixed(2)) };
};

// Helper for CSV escaping
const escapeCSV = (str) => {
  if (str === null || str === undefined) return '';
  const stringified = String(str);
  if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
    return `"${stringified.replace(/"/g, '""')}"`;
  }
  return stringified;
};

// Helper for chunking Firestore Batches (Limit 500 ops per batch)
const commitInBatches = async (collectionName, items, idField) => {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach(item => {
      batch.set(doc(db, 'artifacts', appId, 'public', 'data', collectionName, item[idField].toString()), item);
    });
    await batch.commit();
  }
};

const deleteInBatches = async (collectionName, items) => {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach(item => {
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', collectionName, item.id.toString()));
    });
    await batch.commit();
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('entry'); 
  const [entrySubTab, setEntrySubTab] = useState('daily'); 
  
  // ==========================================
  // CLOUD DATABASE SYSTEM (FIRESTORE)
  // ==========================================
  const [user, setUser] = useState(null);
  const [students, setStudents] = useState(INITIAL_STUDENTS);
  const [logs, setLogs] = useState(INITIAL_LOGS); 
  const [assessments, setAssessments] = useState(INITIAL_ASSESSMENTS);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const studentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'students');
    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'logs');
    const assessmentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'assessments');

    const unsubStudents = onSnapshot(studentsRef, (snapshot) => {
      setStudents(snapshot.docs.map(d => d.data()));
    }, (error) => console.error(error));

    const unsubLogs = onSnapshot(logsRef, (snapshot) => {
      setLogs(snapshot.docs.map(d => d.data()));
    }, (error) => console.error(error));

    const unsubAssessments = onSnapshot(assessmentsRef, (snapshot) => {
      setAssessments(snapshot.docs.map(d => d.data()));
    }, (error) => console.error(error));

    return () => { unsubStudents(); unsubLogs(); unsubAssessments(); };
  }, [user]);

  const [selectedStudent, setSelectedStudent] = useState('');
  const fileInputRef = useRef(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [csvUploadType, setCsvUploadType] = useState('daily'); 
  
  const [heatmapDate, setHeatmapDate] = useState(new Date().toISOString().split('T')[0]);

  // --- FORM STATES ---
  const [dailyForm, setDailyForm] = useState({
    studentId: '', date: new Date().toISOString().split('T')[0], week: 1,
    self: 1, buddy: 1, command: 1, fatigue: 1, injury: 0
  });

  const [demoForm, setDemoForm] = useState({
    studentId: '', name: '', room: '', age: '', gender: 'ชาย', school: '', region: 'กทม.', familyHistory: 'ไม่มี', financialBurden: 'ไม่มี'
  });

  const [assessForm, setAssessForm] = useState({
    studentId: '', week: 0, dass_d: '', dass_a: '', dass_s: '', cd_risc: '', drawing_note: ''
  });

  useEffect(() => {
    if (students.length > 0 && !selectedStudent) setSelectedStudent(students[0].id);
  }, [students, selectedStudent]);

  // --- SUBMIT HANDLERS (MANUAL TO CLOUD) ---
  const handleDailySubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    const sid = dailyForm.studentId.trim();
    if (!sid) { alert('กรุณาระบุรหัส นรม.'); return; }
    
    // Semantic ID Guarantee: Prevents duplicates and naturally handles upserts
    const logId = `log_${sid}_${dailyForm.date}`;
    const newLog = { ...dailyForm, id: logId, studentId: sid,
      self: parseInt(dailyForm.self), buddy: parseInt(dailyForm.buddy), command: parseInt(dailyForm.command), 
      fatigue: parseInt(dailyForm.fatigue), injury: parseInt(dailyForm.injury), week: parseInt(dailyForm.week)
    };
    
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'logs', logId), newLog);
    await ensureStudentExists(sid);
    
    alert(`บันทึกข้อมูลรายวันของ นรม.รหัส ${sid} ขึ้น Cloud สำเร็จ!`);
    setDailyForm({...dailyForm, studentId: ''}); 
  };

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    const sid = demoForm.studentId.trim();
    if (!sid) { alert('กรุณาระบุรหัส นรม.'); return; }
    
    await ensureStudentExists(sid, demoForm);
    alert(`อัปเดตประวัติ นรม.รหัส ${sid} ขึ้น Cloud สำเร็จ!`);
    setDemoForm({ studentId: '', name: '', room: '', age: '', gender: 'ชาย', school: '', region: 'กทม.', familyHistory: 'ไม่มี', financialBurden: 'ไม่มี' });
  };

  const handleAssessSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    const sid = assessForm.studentId.trim();
    if (!sid) { alert('กรุณาระบุรหัส นรม.'); return; }
    
    const assessId = `assess_${sid}_${assessForm.week}`;
    const newAssess = {
      id: assessId, studentId: sid, week: parseInt(assessForm.week),
      dass_d: assessForm.dass_d ? parseInt(assessForm.dass_d) : null,
      dass_a: assessForm.dass_a ? parseInt(assessForm.dass_a) : null,
      dass_s: assessForm.dass_s ? parseInt(assessForm.dass_s) : null,
      cd_risc: assessForm.cd_risc ? parseInt(assessForm.cd_risc) : null,
      drawing_note: assessForm.drawing_note
    };
    
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'assessments', assessId), newAssess);
    await ensureStudentExists(sid);
    
    alert(`บันทึกแบบประเมิน Wk ${assessForm.week} ของ นรม.รหัส ${sid} สำเร็จ!`);
    setAssessForm({ studentId: '', week: 0, dass_d: '', dass_a: '', dass_s: '', cd_risc: '', drawing_note: '' });
  };

  const ensureStudentExists = async (sid, demoData = null) => {
    if (!user) return;
    const existingStudent = students.find(s => s.id === sid);
    
    if (existingStudent) {
      if (demoData) {
        const updated = { ...existingStudent };
        updated.name = demoData.name && demoData.name.trim() !== '' ? demoData.name : updated.name;
        updated.room = demoData.room && demoData.room.trim() !== '' ? demoData.room : updated.room;
        updated.demographics = { ...demoData, age: parseInt(demoData.age)||0 };
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', sid), updated);
      }
    } else {
      const newStudent = {
        id: sid, 
        name: demoData && demoData.name && demoData.name.trim() !== '' ? demoData.name : `นรม. รหัส ${sid}`, 
        room: demoData && demoData.room && demoData.room.trim() !== '' ? demoData.room : 'ไม่ระบุ', 
        baseline: 'Medium', tag: '', isUnderCare: false,
        demographics: demoData ? { ...demoData, age: parseInt(demoData.age)||0 } : { age: 0, gender: 'ไม่ระบุ', school: 'ไม่ระบุ', region: 'ไม่ระบุ', familyHistory: 'ไม่ระบุ', financialBurden: 'ไม่ระบุ' },
        assessments: { dass21: { depression: 0, anxiety: 0, stress: 0 }, cdRisc: 0 }
      };
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', sid), newStudent);
    }
  };

  // --- SUBMIT HANDLERS (CSV BULK UPLOAD TO CLOUD) ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    setUploadStatus('กำลังประมวลผลและอัปโหลดขึ้น Cloud...');
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split('\n');
        let successCount = 0;
        const newStudentIds = new Set();
        
        const batch = writeBatch(db); 

        if (csvUploadType === 'daily') {
          for (let i = 1; i < lines.length; i++) { 
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length >= 8) { 
              const sid = values[0];
              const logId = `log_${sid}_${values[1]}`;
              const logData = {
                id: logId, studentId: sid, date: values[1], week: parseInt(values[2]) || 1,
                self: parseInt(values[3]) || 1, buddy: parseInt(values[4]) || 1, command: parseInt(values[5]) || 1, 
                fatigue: parseInt(values[6]) || 1, injury: parseInt(values[7]) || 0
              };
              batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'logs', logId), logData);
              newStudentIds.add(sid);
              successCount++;
            }
          }
        } else if (csvUploadType === 'demographic') {
          for (let i = 1; i < lines.length; i++) { 
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length >= 9) { 
              const sid = values[0];
              const studentName = values[1] || `นรม. รหัส ${sid}`;
              const studentRoom = values[2] || 'ไม่ระบุ';
              const demoData = { age: parseInt(values[3])||0, gender: values[4], region: values[5], school: values[6], familyHistory: values[7], financialBurden: values[8] };
              
              const existingStudent = students.find(s => s.id === sid);
              const studentToSave = existingStudent ? { ...existingStudent } : {
                id: sid, baseline: 'Medium', tag: '', isUnderCare: false,
                assessments: { dass21: { depression: 0, anxiety: 0, stress: 0 }, cdRisc: 0 }
              };
              
              studentToSave.name = studentName !== `นรม. รหัส ${sid}` ? studentName : (studentToSave.name || studentName);
              studentToSave.room = studentRoom !== 'ไม่ระบุ' ? studentRoom : (studentToSave.room || studentRoom);
              studentToSave.demographics = demoData;
              
              batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'students', sid), studentToSave);
              successCount++;
            }
          }
        } else if (csvUploadType === 'assessment') {
          for (let i = 1; i < lines.length; i++) { 
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length >= 7) { 
              const sid = values[0];
              const assessId = `assess_${sid}_${values[1]}`;
              const assessData = {
                id: assessId, studentId: sid, week: parseInt(values[1]) || 0,
                dass_d: values[2] ? parseInt(values[2]) : null, dass_a: values[3] ? parseInt(values[3]) : null,
                dass_s: values[4] ? parseInt(values[4]) : null, cd_risc: values[5] ? parseInt(values[5]) : null,
                drawing_note: values[6] || ''
              };
              batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'assessments', assessId), assessData);
              newStudentIds.add(sid);
              successCount++;
            }
          }
        }

        const existingIds = new Set(students.map(s => s.id));
        newStudentIds.forEach(id => {
          if (!existingIds.has(id)) {
            batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'students', id), {
              id: id, name: `นรม. รหัส ${id}`, room: 'ไม่ระบุ', baseline: 'Medium', tag: '', isUnderCare: false,
              demographics: { age: 0, gender: 'ไม่ระบุ', school: 'ไม่ระบุ', region: 'ไม่ระบุ', familyHistory: 'ไม่ระบุ', financialBurden: 'ไม่ระบุ' },
              assessments: { dass21: { depression: 0, anxiety: 0, stress: 0 }, cdRisc: 0 }
            });
          }
        });

        if (successCount > 0) {
          await batch.commit(); 
          setUploadStatus(`อัปโหลดขึ้น Cloud สำเร็จ! จำนวน ${successCount} รายการ`);
        } else throw new Error("Format Mismatch");

      } catch (error) {
        console.error(error);
        setUploadStatus('เกิดข้อผิดพลาด หรือรูปแบบไฟล์ CSV ไม่ถูกต้องตาม Template');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetData = async () => {
    if (!user) return;
    setUploadStatus('กำลังสั่งเคลียร์ฐานข้อมูลบน Cloud...');
    
    try {
      await deleteInBatches('logs', logs);
      await deleteInBatches('assessments', assessments);
      await deleteInBatches('students', students);

      setUploadStatus('ลบข้อมูลระบบ Cloud เสร็จสิ้น (รีเฟรชกราฟกลับเป็นศูนย์)'); 
      setShowConfirmReset(false);
      setSelectedStudent('');
    } catch(e) {
      console.error(e);
      setUploadStatus('เกิดข้อผิดพลาดในการลบข้อมูล');
    }
  };

  const downloadTemplate = () => {
    let header = ""; let example = ""; let filename = "";
    const BOM = "\uFEFF"; 

    if (csvUploadType === 'daily') {
      header = "studentId,date,week,self,buddy,command,fatigue,injury\n";
      example = "001,2026-05-12,1,1,1,1,2,0\n002,2026-05-12,1,3,2,2,8,0\n";
      filename = "Template_DailyLogs.csv";
    } else if (csvUploadType === 'demographic') {
      header = "studentId,name,room,age,gender,region,school,familyHistory,financialBurden\n";
      example = "001,นรม. กรกฎ (ใส่ชื่อจริง),101,18,ชาย,กทม.,เตรียมอุดมศึกษา,ไม่มี,ไม่มี\n002,นรม. ขจร (ใส่ชื่อจริง),102,19,ชาย,ภาคเหนือ,สวนกุหลาบวิทยาลัย,มี(ซึมเศร้า),สูง\n";
      filename = "Template_Demographics.csv";
    } else if (csvUploadType === 'assessment') {
      header = "studentId,week,dass_d,dass_a,dass_s,cd_risc,drawing_note\n";
      example = "001,0,2,4,6,85,วาดภาพปกติ\n002,4,14,10,18,,ไม่ให้ความร่วมมือ\n";
      filename = "Template_Assessments.csv";
    }

    const blob = new Blob([BOM + header + example], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click(); document.body.removeChild(link);
  };

  const handleExportMasterData = () => {
    let csv = "\uFEFF"; 
    csv += "Student_ID,Name,Room,Age,Gender,Region,School,Family_History,Financial_Burden,Baseline_Risk,Date,Week,Self_Color,Buddy_Color,Command_Color,Fatigue,Injury,DASS_Depression,DASS_Anxiety,DASS_Stress,CD_RISC,Drawing_Note\n";

    const assessMap = {};
    assessments.forEach(a => {
      assessMap[`${a.studentId}_${a.week}`] = a;
    });

    const allRows = [];

    students.forEach(student => {
      const sLogs = logs.filter(l => l.studentId === student.id);
      const sAssess = assessments.filter(a => a.studentId === student.id);
      
      const weeks = new Set([...sLogs.map(l => l.week), ...sAssess.map(a => a.week)]);
      
      if (weeks.size === 0) {
         allRows.push({ ...student, date: '', week: '', log: null, assess: null });
      } else {
         if (sLogs.length > 0) {
           sLogs.forEach(log => {
              const assess = assessMap[`${student.id}_${log.week}`] || null;
              allRows.push({ ...student, date: log.date, week: log.week, log, assess });
           });
         }
         sAssess.forEach(assess => {
            const hasLogForWeek = sLogs.some(l => l.week === assess.week);
            if (!hasLogForWeek) {
               allRows.push({ ...student, date: `Wk ${assess.week}`, week: assess.week, log: null, assess });
            }
         });
      }
    });

    allRows.forEach(row => {
       const dem = row.demographics || {};
       const l = row.log || {};
       const a = row.assess || {};
       
       const rowData = [
         row.id, row.name, row.room, dem.age, dem.gender, dem.region, dem.school, dem.familyHistory, dem.financialBurden, row.baseline,
         row.date, row.week,
         l.self, l.buddy, l.command, l.fatigue, l.injury !== undefined ? l.injury : '',
         a.dass_d !== null && a.dass_d !== undefined ? a.dass_d : '', 
         a.dass_a !== null && a.dass_a !== undefined ? a.dass_a : '', 
         a.dass_s !== null && a.dass_s !== undefined ? a.dass_s : '', 
         a.cd_risc !== null && a.cd_risc !== undefined ? a.cd_risc : '', 
         a.drawing_note
       ];
       
       csv += rowData.map(escapeCSV).join(",") + "\n";
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Sentinel_Research_MasterData_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click(); 
    document.body.removeChild(link);
  };

  // --- DEMO DATA GENERATOR (SAFE UNIQUE IDS) ---
  const loadDemoData = async () => {
    if (!user) return;
    setUploadStatus('กำลังสร้างข้อมูลจำลอง 112 วันขึ้น Cloud (อาจใช้เวลา 3-5 วินาที)...');
    
    const demoStudents = []; const demoLogs = []; const demoAssess = [];

    // จำนวนนักเรียน 10 คน และจัดห้องละ 2 คน
    for(let i=1; i<=10; i++) {
      const sid = i.toString().padStart(3, '0');
      const isHighRisk = Math.random() > 0.8;
      const roomNumber = `10${Math.ceil(i / 2)}`; 

      demoStudents.push({
        id: sid, name: `นรม. สมมติ ${sid}`, room: roomNumber, baseline: isHighRisk?'High':'Low', tag: '', isUnderCare: isHighRisk,
        demographics: { age: 18 + Math.floor(Math.random()*4), gender: 'ชาย', school: 'มัธยมปลาย', region: i%3===0?'กทม.':'ต่างจังหวัด', familyHistory: isHighRisk?'มี(ซึมเศร้า)':'ไม่มี', financialBurden: isHighRisk?'สูง':'ไม่มี' }
      });

      [0, 4, 8, 16].forEach(wk => {
        let baseStress = isHighRisk ? 14 : 6;
        let stress = Math.max(0, baseStress + (Math.random()*10 - 5) + (wk===8 ? 6 : 0) - (wk===16 ? 4 : 0)); 
        let cdRisc = Math.max(0, Math.min(100, (isHighRisk ? 40 : 70) + (wk*1.5) + (Math.random()*10 - 5))); 
        
        demoAssess.push({ 
            id: `assess_${sid}_${wk}`, studentId: sid, week: wk, 
            dass_d: Math.round(stress*0.8), dass_a: Math.round(stress*0.9), dass_s: Math.round(stress), 
            cd_risc: (wk===0||wk===8||wk===16)?Math.round(cdRisc):null, drawing_note: wk===0?'วาดภาพปกติ':'' 
        });
      });

      for(let w=1; w<=16; w++) {
        for(let d_index=0; d_index<7; d_index++) {
          // ใช้การสร้าง Date object ใหม่ทุกครั้งเพื่อป้องกันปัญหา UTC Timezone shift ของ Javascript
          let d = new Date(2026, 4, 12); // เดือน 4 ใน JS คือพฤษภาคม
          d.setDate(d.getDate() + ((w - 1) * 7) + d_index);
          let yyyy = d.getFullYear();
          let mm = String(d.getMonth() + 1).padStart(2, '0');
          let dd = String(d.getDate()).padStart(2, '0');
          let dateStr = `${yyyy}-${mm}-${dd}`;

          let mental = isHighRisk ? (w>=6 && w<=10 ? 3 : 2) : (w>=7 && w<=9 ? 2 : 1);
          if (Math.random() > 0.7) mental = Math.max(1, mental - 1);
          
          demoLogs.push({ 
            id: `log_${sid}_${dateStr}`, studentId: sid, date: dateStr, week: w, 
            self: mental, buddy: mental, command: mental, 
            fatigue: Math.floor(Math.random()*5)+ (w>=6&&w<=10?4:1), injury: 0 
          });
        }
      }
    }
    
    try {
      await commitInBatches('students', demoStudents, 'id');
      await commitInBatches('assessments', demoAssess, 'id');
      await commitInBatches('logs', demoLogs, 'id'); // การันตีนำเข้าครบถ้วน
      
      if (demoLogs.length > 0) setHeatmapDate(demoLogs[demoLogs.length-1].date);
      setUploadStatus('กระจายข้อมูลจำลองขึ้นฐานข้อมูล Cloud เรียบร้อยแล้ว (โหลดข้อมูล 112 วันสมบูรณ์)');
    } catch (err) {
      console.error(err);
      setUploadStatus('เกิดข้อผิดพลาดในการจำลองข้อมูลบน Cloud');
    }
  };

  const latestLogs = useMemo(() => {
    const map = {}; logs.forEach(log => { if (!map[log.studentId] || new Date(log.date) > new Date(map[log.studentId].date)) map[log.studentId] = log; });
    return map;
  }, [logs]);

  const populationWeeklyTrend = useMemo(() => {
    const weeksData = [];
    for (let w = 1; w <= 16; w++) {
      const weekLogs = logs.filter(l => l.week === w);
      const selfArr = weekLogs.map(l => l.self);
      const buddyArr = weekLogs.map(l => l.buddy);
      const cmdArr = weekLogs.map(l => l.command);
      
      const selfStats = getStats(selfArr);
      const buddyStats = getStats(buddyArr);
      const cmdStats = getStats(cmdArr);
      
      weeksData.push({
        week: `Wk ${w}`,
        self: selfStats.mean, self_sd: selfStats.sd,
        buddy: buddyStats.mean, buddy_sd: buddyStats.sd,
        command: cmdStats.mean, command_sd: cmdStats.sd
      });
    }
    return weeksData;
  }, [logs]);

  const assessWeeklyTrend = useMemo(() => {
    const weeks = [0, 4, 8, 16];
    return weeks.map(w => {
      const wData = assessments.filter(a => a.week === w);
      const dassStats = getStats(wData.map(a => a.dass_s).filter(x => x!==null));
      const cdStats = getStats(wData.map(a => a.cd_risc).filter(x => x!==null));
      return {
        week: `Wk ${w}`,
        dass_s: dassStats.mean, dass_s_sd: dassStats.sd,
        cd_risc: cdStats.mean, cd_risc_sd: cdStats.sd,
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

  const renderOverview = () => {
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
                    {/* interval={0} บังคับให้แกน X แสดงให้ครบทุกสัปดาห์ */}
                    <XAxis dataKey="week" tick={{fontSize: 10}} interval={0} />
                    <YAxis domain={[0, 4]} ticks={[1,2,3,4]} label={{ value: 'Mental Score', angle: -90, position: 'insideLeft', style: {fontSize: 12} }} />
                    <RechartsTooltip content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-3 border shadow rounded text-sm">
                            <p className="font-bold mb-1">{label}</p>
                            {payload.map((entry, idx) => entry.value !== null ? (
                              <p key={idx} style={{color: entry.color}}>
                                {entry.name}: {entry.value} (SD: {entry.payload[`${entry.dataKey}_sd`]})
                              </p>
                            ) : null)}
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Legend />
                    <Line type="monotone" dataKey="self" name="Self" stroke="#3b82f6" strokeWidth={2} dot={{r:3}} activeDot={{ r: 6 }} connectNulls />
                    <Line type="monotone" dataKey="buddy" name="Buddy" stroke="#10b981" strokeWidth={2} dot={{r:3}} connectNulls />
                    <Line type="monotone" dataKey="command" name="Command" stroke="#f59e0b" strokeWidth={2} dot={{r:3}} connectNulls />
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
                    {/* interval={0} บังคับให้แสดง Wk 0, 4, 8, 16 ให้ครบ */}
                    <XAxis dataKey="week" tick={{fontSize: 10}} interval={0} />
                    <YAxis yAxisId="left" domain={[0, 42]} label={{ value: 'DASS-21 (Stress)', angle: -90, position: 'insideLeft', style: {fontSize: 12} }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} label={{ value: 'CD-RISC', angle: 90, position: 'insideRight', style: {fontSize: 12} }} />
                    <RechartsTooltip content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-3 border shadow rounded text-sm">
                            <p className="font-bold mb-1">{label}</p>
                            {payload.map((entry, idx) => entry.value !== null ? (
                              <p key={idx} style={{color: entry.color}}>
                                {entry.name}: {entry.value} (SD: {entry.payload[`${entry.dataKey}_sd`]})
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

  const renderHeatmap = () => {
    if (students.length === 0) return <div className="text-center p-12 text-slate-500">ไม่พบข้อมูล กรุณานำเข้าข้อมูลก่อน</div>;
    
    const logsForDate = logs.filter(l => l.date === heatmapDate);
    const heatmapLogMap = {};
    logsForDate.forEach(l => heatmapLogMap[l.studentId] = l);
    
    const studentsWithHeatmapStatus = students.map(s => ({
      ...s, currentStatus: heatmapLogMap[s.id] || { self: 0, buddy: 0, command: 0, fatigue: 0, injury: 0 }
    }));

    const rooms = [...new Set(studentsWithHeatmapStatus.map(s => s.room))].filter(Boolean).sort();
    
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 border-b pb-4">
          <h3 className="text-lg font-bold text-slate-800">Heatmap สภาวะจิตใจรายห้องพัก</h3>
          <div className="flex items-center mt-3 md:mt-0 bg-slate-50 p-2 rounded-lg border border-slate-200">
            <Calendar size={18} className="text-slate-500 mr-2" />
            <label className="text-sm font-bold text-slate-700 mr-2">เลือกวันที่ดูข้อมูล:</label>
            <input 
              type="date" 
              className="bg-white border rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={heatmapDate}
              onChange={(e) => setHeatmapDate(e.target.value)}
            />
          </div>
        </div>

        {rooms.map(room => (
          <div key={room} className="mb-8">
            <h4 className="text-md font-semibold mb-3 text-slate-600 border-b pb-2">ห้องพัก: {room}</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-3 w-16">ID</th><th className="p-3 w-48">ชื่อ-สกุล</th>
                    <th className="p-3 text-center">Self<br/><span className="text-[10px] font-normal text-slate-400">({heatmapDate})</span></th>
                    <th className="p-3 text-center">Buddy<br/><span className="text-[10px] font-normal text-slate-400">({heatmapDate})</span></th>
                    <th className="p-3 text-center">Command<br/><span className="text-[10px] font-normal text-slate-400">({heatmapDate})</span></th>
                    <th className="p-3 text-center">Fatigue</th><th className="p-3 text-center">ป่วย/เจ็บ</th><th className="p-3">Alert Score</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsWithHeatmapStatus.filter(s => s.room === room).map(s => {
                    const hasData = s.currentStatus.self > 0;
                    return (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="p-3 font-medium text-slate-500">{s.id}</td><td className="p-3">{s.name}</td>
                      <td className="p-3"><div className={`w-full h-8 rounded ${!hasData ? 'bg-slate-100 border border-slate-200' : ''}`} style={hasData ? {backgroundColor: COLORS[s.currentStatus.self]} : {}}></div></td>
                      <td className="p-3"><div className={`w-full h-8 rounded ${!hasData ? 'bg-slate-100 border border-slate-200' : ''}`} style={hasData ? {backgroundColor: COLORS[s.currentStatus.buddy]} : {}}></div></td>
                      <td className="p-3"><div className={`w-full h-8 rounded ${!hasData ? 'bg-slate-100 border border-slate-200' : ''}`} style={hasData ? {backgroundColor: COLORS[s.currentStatus.command]} : {}}></div></td>
                      <td className="p-3 text-center font-bold text-slate-700">{hasData ? `${s.currentStatus.fatigue}/10` : '-'}</td>
                      <td className="p-3 text-center">{hasData ? (s.currentStatus.injury === 1 ? <span className="text-red-500 font-bold">Yes</span> : <span className="text-slate-300">-</span>) : '-'}</td>
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

    const studentLogs = logs.filter(l => l.studentId === selectedStudent).sort((a,b) => new Date(a.date) - new Date(b.date));
    const studentAssess = assessments.filter(a => a.studentId === selectedStudent).sort((a,b) => a.week - b.week);

    const chartDataColors = studentLogs.map(l => ({ 
      date: l.date, 
      displayDate: l.date.substring(5), 
      self: l.self, buddy: l.buddy, cmd: l.command 
    }));
    
    const chartDataPsych = studentAssess.map(a => ({ 
      week: `Wk ${a.week}`, dass_s: a.dass_s, cd_risc: a.cd_risc 
    }));

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
                <li className="flex justify-between"><span>ห้องพัก:</span> <span className="font-bold text-slate-800">{studentInfo.room}</span></li>
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
              <h4 className="font-bold text-slate-800 mb-4">แนวโน้ม 4 สี (Daily Color Trend - รายวัน)</h4>
              <div className="h-48">
                {chartDataColors.length>0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartDataColors} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="displayDate" tick={{fontSize: 10}} />
                      <YAxis domain={[0, 4]} ticks={[1,2,3,4]} style={{fontSize: 10}} />
                      <RechartsTooltip labelFormatter={(label) => `วันที่: ${label}`} /> <Legend />
                      <Line type="monotone" dataKey="self" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="buddy" stroke="#10b981" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="cmd" name="Command" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      {/* หน้ากราฟรายวันจะใส่ Brush ไว้ให้ซูมเลื่อนดูข้อมูลได้ โดยไม่บังคับแสดงแกน X ให้รกเกินไป */}
                      <Brush dataKey="displayDate" height={20} stroke="#cbd5e1" travellerWidth={10} /> 
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div className="text-center text-slate-400 mt-10">ไม่มีข้อมูลรายวัน</div>}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-4">แนวโน้มจิตวิทยาคลินิก (Psychological Assessments - รายสัปดาห์)</h4>
              <div className="h-48">
                {chartDataPsych.length>0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartDataPsych} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="week" tick={{fontSize: 10}} interval={0} />
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
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between">
        <div className="mb-4 md:mb-0">
          <h3 className="text-xl font-bold text-blue-800 flex items-center"><Database className="mr-2" /> ศูนย์จัดการข้อมูล (Data Center)</h3>
          <p className="text-sm text-slate-500 mt-1">คีย์ข้อมูลเข้า หรือ ล้างข้อมูลระบบ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportMasterData} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-4 py-2 rounded-lg text-sm font-bold flex items-center transition border border-transparent hover:border-emerald-200">
            <Download size={16} className="mr-2"/> ส่งออกข้อมูลวิจัย (Export)
          </button>
          
          <button onClick={loadDemoData} className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-4 py-2 rounded-lg text-sm font-bold flex items-center transition">
            <Activity size={16} className="mr-2"/> โหลดข้อมูลจำลอง (Demo)
          </button>
          
          <button onClick={() => setShowConfirmReset(true)} className="bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg text-sm font-bold flex items-center transition border border-transparent hover:border-red-200">
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

      {/* BULK UPLOAD SECTION */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative">
        <div className="border-b pb-4 mb-6 flex flex-col md:flex-row md:items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-blue-800 flex items-center">
              <UploadCloud className="mr-2" /> นำเข้าข้อมูลแบบกลุ่ม (CSV Upload)
            </h3>
            <p className="text-sm text-slate-500 mt-1">อัปโหลดไฟล์ .csv ที่ได้จากการกรอกใน Excel</p>
          </div>
          <div className="mt-4 md:mt-0">
            <label className="text-sm font-bold text-slate-700 mr-2">เลือกหมวดหมู่ไฟล์:</label>
            <select 
              className="bg-blue-50 border border-blue-200 text-blue-800 font-bold p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              value={csvUploadType}
              onChange={(e) => setCsvUploadType(e.target.value)}
            >
              <option value="daily">1. บันทึกรายวัน (4 สี)</option>
              <option value="demographic">2. ประวัติพื้นฐาน (Demographics)</option>
              <option value="assessment">3. แบบประเมินจิตวิทยา (Assessments)</option>
            </select>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="p-6 border-2 border-dashed border-blue-200 bg-blue-50/50 rounded-xl text-center">
            <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 inline-flex items-center">
              <UploadCloud className="mr-2" size={20} /> คลิกเพื่อเลือกไฟล์ .CSV
            </button>
            <p className="text-xs text-slate-500 mt-3">* ข้อมูลจะถูกดึงเข้าสู่ระบบและอัปเดตกราฟแบบ Real-time ทันที</p>
          </div>

          {uploadStatus && (
            <div className={`p-3 rounded-lg text-sm font-medium flex justify-between items-center ${uploadStatus.includes('สำเร็จ') ? 'bg-green-100 text-green-700' : uploadStatus.includes('รีเซ็ต') ? 'bg-slate-100 text-slate-600' : 'bg-orange-100 text-orange-700'}`}>
              <span>{uploadStatus}</span>
              <button onClick={() => setUploadStatus('')} className="hover:bg-black/10 p-1 rounded"><X size={14}/></button>
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h4 className="font-bold text-slate-700 text-sm mb-2 flex items-center justify-between">
              รูปแบบโครงสร้างไฟล์ (Format) ของหมวด {csvUploadType === 'daily' ? 'บันทึกรายวัน' : csvUploadType === 'demographic' ? 'ประวัติพื้นฐาน' : 'แบบประเมินจิตวิทยา'}
              <button onClick={downloadTemplate} className="text-blue-600 hover:text-blue-800 text-xs flex items-center bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition font-bold">
                <Download size={14} className="mr-1"/> โหลด Template Excel ไปใช้งาน
              </button>
            </h4>
            <div className="overflow-x-auto bg-white p-3 rounded border">
              <code className="text-xs text-slate-600 whitespace-pre">
                {csvUploadType === 'daily' && "studentId,date,week,self,buddy,command,fatigue,injury\n001,2026-05-12,1,1,1,1,2,0\n002,2026-05-12,1,3,2,2,8,0"}
                {csvUploadType === 'demographic' && "studentId,name,room,age,gender,region,school,familyHistory,financialBurden\n001,นรม. กรกฎ,101,18,ชาย,กทม.,เตรียมอุดม,ไม่มี,ไม่มี\n002,นรม. ขจร,101,19,ชาย,ภาคเหนือ,ปริ้นส์,มี(ซึมเศร้า),สูง"}
                {csvUploadType === 'assessment' && "studentId,week,dass_d,dass_a,dass_s,cd_risc,drawing_note\n001,0,2,4,6,85,วาดภาพปกติ\n002,4,14,10,18,,ไม่ให้ความร่วมมือ"}
              </code>
            </div>
          </div>
        </div>
      </div>

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
                  <input type="text" className="w-full p-2 border rounded-lg bg-slate-50 outline-none" value={dailyForm.studentId} onChange={(e) => setDailyForm({...dailyForm, studentId: e.target.value})} placeholder="เช่น 001" required />
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
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border">
                <div><label className="block text-xs font-bold mb-1">ระดับความล้า (1-10)</label><input type="number" min="1" max="10" className="w-full p-2 border rounded" value={dailyForm.fatigue} onChange={(e)=>setDailyForm({...dailyForm,fatigue:e.target.value})} /></div>
                <div><label className="block text-xs font-bold mb-1">เจ็บป่วย/งดฝึก</label><select className="w-full p-2 border rounded" value={dailyForm.injury} onChange={(e)=>setDailyForm({...dailyForm,injury:e.target.value})}><option value="0">ปกติ</option><option value="1">เจ็บป่วย/งด</option></select></div>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">บันทึกข้อมูลรายวัน</button>
            </form>
          )}

          {/* TAB 2: DEMOGRAPHICS */}
          {entrySubTab === 'demographic' && (
            <form onSubmit={handleDemoSubmit} className="space-y-5">
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm p-3 rounded-lg">* ข้อมูลส่วนนี้ควรกรอกเพียงครั้งแรกก่อนเริ่มการฝึก เพื่อใช้เป็น Baseline ทางสถิติ และการจัดกลุ่มห้องพัก</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold text-slate-700 mb-1">รหัสนักเรียน (ID)</label><input type="text" className="w-full p-2 border rounded-lg bg-slate-50" value={demoForm.studentId} onChange={(e) => setDemoForm({...demoForm, studentId: e.target.value})} placeholder="เช่น 001" required /></div>
                <div><label className="block text-sm font-bold text-slate-700 mb-1">ชื่อ-สกุล</label><input type="text" className="w-full p-2 border rounded-lg bg-slate-50" value={demoForm.name} onChange={(e) => setDemoForm({...demoForm, name: e.target.value})} placeholder="เช่น นรม. กรกฎ สุขใจ" required /></div>
                <div><label className="block text-sm font-bold text-slate-700 mb-1">ห้องพัก</label><input type="text" className="w-full p-2 border rounded-lg bg-slate-50" value={demoForm.room} onChange={(e) => setDemoForm({...demoForm, room: e.target.value})} placeholder="เช่น 101, 102" required /></div>
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
                <div><label className="block text-sm font-bold text-slate-700 mb-1">รหัสนักเรียน (ID)</label><input type="text" className="w-full p-2 border rounded-lg bg-slate-50" value={assessForm.studentId} onChange={(e) => setAssessForm({...assessForm, studentId: e.target.value})} placeholder="เช่น 001" required /></div>
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
              <Database size={20} /><span>ศูนย์จัดการข้อมูล (Data)</span>
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
              {activeTab === 'entry' && 'ศูนย์จัดการข้อมูล (Data Center)'}
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