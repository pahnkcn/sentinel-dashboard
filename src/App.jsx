import React, { useState, useMemo, useRef } from 'react';
import { 
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Brush 
} from 'recharts';
import { 
  LayoutDashboard, Users, User, FileEdit, AlertTriangle, Activity, CheckCircle, Clock, HeartPulse, Stethoscope, UploadCloud, Download
} from 'lucide-react';

// --- MOCK DATA GENERATOR ---
const INITIAL_STUDENTS = [
  { id: '001', name: 'นรม. กรกฎ', room: '101', baseline: 'Low', tag: '', isUnderCare: false },
  { id: '002', name: 'นรม. ขจร', room: '101', baseline: 'High', tag: 'เฝ้าระวัง (ต่อต้าน)', isUnderCare: true },
  { id: '003', name: 'นรม. คมสัน', room: '101', baseline: 'Medium', tag: '', isUnderCare: false },
  { id: '004', name: 'นรม. จิรายุ', room: '102', baseline: 'Medium', tag: '', isUnderCare: false },
  { id: '005', name: 'นรม. ฉัตรชัย', room: '102', baseline: 'High', tag: 'รักษา (ซึมเศร้า)', isUnderCare: true },
  { id: '006', name: 'นรม. ชลทิศ', room: '102', baseline: 'Low', tag: '', isUnderCare: false },
];

const generateInitialLogs = (students) => {
  const logs = [];
  const startDate = new Date('2026-05-12');
  let logId = 1;
  const totalDays = 30; // จำลอง 30 วันเพื่อความรวดเร็วของตัวอย่าง

  students.forEach(student => {
    let currentFatigue = Math.floor(Math.random() * 3) + 1; 
    let currentMental = student.baseline === 'High' ? 2 : 1;

    for (let day = 0; day < totalDays; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + day);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      currentFatigue = Math.min(10, Math.max(1, currentFatigue + (Math.random() * 3 - 1)));
      if (currentFatigue > 7 && Math.random() > 0.5) {
         currentMental = Math.min(4, currentMental + (student.baseline === 'High' ? 1 : 0.5));
      } else if (currentFatigue < 4) {
         currentMental = Math.max(1, currentMental - 0.5);
      }

      const selfScore = Math.min(4, Math.max(1, Math.round(currentMental)));
      logs.push({
        id: logId++, studentId: student.id, date: dateStr,
        self: selfScore, buddy: selfScore, command: selfScore,
        fatigue: Math.round(currentFatigue), injury: (Math.random() > 0.95) ? 1 : 0
      });
    }
  });
  return logs;
};

const INITIAL_LOGS = generateInitialLogs(INITIAL_STUDENTS);

const COLORS = { 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444' };
const PIE_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

export default function App() {
  const [activeTab, setActiveTab] = useState('entry'); // เปิดหน้า Data Entry เป็นหน้าแรกให้เห็นระบบอัปโหลด
  const [students] = useState(INITIAL_STUDENTS);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [selectedStudent, setSelectedStudent] = useState('002');
  
  // State สำหรับการอัปโหลดไฟล์
  const fileInputRef = useRef(null);
  const [uploadStatus, setUploadStatus] = useState('');

  const [entryForm, setEntryForm] = useState({
    studentId: '001', date: new Date().toISOString().split('T')[0],
    self: 1, buddy: 1, command: 1, fatigue: 1, injury: 0
  });

  // --- ระบบ MANAUL ENTRY ---
  const handleEntrySubmit = (e) => {
    e.preventDefault();
    const newLog = { ...entryForm, id: Date.now(), 
      self: parseInt(entryForm.self), buddy: parseInt(entryForm.buddy), 
      command: parseInt(entryForm.command), fatigue: parseInt(entryForm.fatigue), 
      injury: parseInt(entryForm.injury) 
    };
    setLogs([...logs, newLog]);
    alert('บันทึกข้อมูลรายบุคคลสำเร็จ!');
  };

  // --- ระบบ CSV UPLOAD ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadStatus('กำลังประมวลผล...');
    const reader = new FileReader();
    
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split('\n');
        // คาดหวัง header: studentId,date,self,buddy,command,fatigue,injury
        
        const newLogs = [];
        let successCount = 0;

        for (let i = 1; i < lines.length; i++) { // ข้าม header บรรทัดที่ 0
          if (!lines[i].trim()) continue;
          
          const values = lines[i].split(',').map(v => v.trim());
          if (values.length >= 7) {
            newLogs.push({
              id: Date.now() + i,
              studentId: values[0],
              date: values[1],
              self: parseInt(values[2]) || 1,
              buddy: parseInt(values[3]) || 1,
              command: parseInt(values[4]) || 1,
              fatigue: parseInt(values[5]) || 1,
              injury: parseInt(values[6]) || 0
            });
            successCount++;
          }
        }

        if (newLogs.length > 0) {
          setLogs(prevLogs => [...prevLogs, ...newLogs]);
          setUploadStatus(`อัปโหลดสำเร็จ! นำเข้าข้อมูลใหม่จำนวน ${successCount} รายการ`);
        } else {
          setUploadStatus('ไม่พบข้อมูลที่ถูกต้องในไฟล์ กรุณาตรวจสอบ Format');
        }
      } catch (error) {
        setUploadStatus('เกิดข้อผิดพลาดในการอ่านไฟล์');
      }
    };
    reader.readAsText(file);
    // เคลียร์ input เผื่อต้องการอัปโหลดไฟล์เดิมซ้ำ
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // โหลด Template CSV ให้ธุรการเอาไปกรอกใน Excel
  const downloadTemplate = () => {
    const header = "studentId,date,self,buddy,command,fatigue,injury\n";
    const example = "001,2026-06-12,1,1,1,2,0\n002,2026-06-12,3,2,2,8,0\n";
    const blob = new Blob([header + example], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'Sentinel_DataEntry_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- DERIVED DATA ---
  const latestLogs = useMemo(() => {
    const map = {};
    logs.forEach(log => {
      if (!map[log.studentId] || new Date(log.date) > new Date(map[log.studentId].date)) {
        map[log.studentId] = log;
      }
    });
    return map;
  }, [logs]);

  const studentsWithLatestStatus = useMemo(() => {
    return students.map(s => ({
      ...s, currentStatus: latestLogs[s.id] || { self: 0, buddy: 0, command: 0, fatigue: 0, injury: 0 }
    }));
  }, [students, latestLogs]);

  const overallStats = useMemo(() => {
    const stats = { 1: 0, 2: 0, 3: 0, 4: 0, injury: 0, total: students.length };
    Object.values(latestLogs).forEach(log => {
      const maxMental = Math.max(log.self, log.buddy, log.command);
      if (stats[maxMental] !== undefined) stats[maxMental]++;
      if (log.injury === 1) stats.injury++;
    });
    return stats;
  }, [latestLogs, students.length]);

  const pieData = [
    { name: 'Healthy (ปกติ)', value: overallStats[1] || 0 },
    { name: 'Reacting (เริ่มมีอาการ)', value: overallStats[2] || 0 },
    { name: 'Injured (บาดเจ็บทางใจ)', value: overallStats[3] || 0 },
    { name: 'Ill (ป่วย/วิกฤต)', value: overallStats[4] || 0 },
  ];

  const getAlertBadge = (status) => {
    if (!status || !status.self) return <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded-full">ไม่มีข้อมูล</span>;
    const maxScore = Math.max(status.self, status.buddy, status.command);
    if (maxScore >= 4) return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-bold">วิกฤต (Ill)</span>;
    if (maxScore === 3) return <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-bold">บาดเจ็บ (Injured)</span>;
    if (status.self === 1 && (status.buddy >= 3 || status.command >= 3)) return <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-bold">ปกปิดความเสี่ยง (Denial)</span>;
    return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">ปกติ</span>;
  };

  // --- RENDERERS ---
  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Users size={24} /></div>
          <div><p className="text-sm text-slate-500">นรม. ทั้งหมด</p><p className="text-2xl font-bold">{students.length}</p></div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-lg"><AlertTriangle size={24} /></div>
          <div><p className="text-sm text-slate-500">กลุ่มสีแดง/ส้ม (ล่าสุด)</p><p className="text-2xl font-bold">{overallStats[3] + overallStats[4]}</p></div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg"><Activity size={24} /></div>
          <div><p className="text-sm text-slate-500">ป่วยทางกาย (ล่าสุด)</p><p className="text-2xl font-bold">{overallStats.injury}</p></div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Stethoscope size={24} /></div>
          <div><p className="text-sm text-slate-500">อยู่ในการดูแล (Tag)</p><p className="text-2xl font-bold">{students.filter(s => s.isUnderCare).length}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-4 text-slate-800">สัดส่วนสภาวะจิตใจปัจจุบัน</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label>
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-4 text-slate-800">เคสที่ต้องเฝ้าระวัง / รักษา</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600">
                <tr><th className="p-3 rounded-tl-lg">ID</th><th className="p-3">ชื่อ-สกุล</th><th className="p-3">Baseline</th><th className="p-3 rounded-tr-lg">Tag / การดูแล</th></tr>
              </thead>
              <tbody>
                {students.filter(s => s.isUnderCare).map(s => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-3 font-medium">{s.id}</td><td className="p-3">{s.name}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded text-xs ${s.baseline === 'High' ? 'bg-red-100 text-red-700' : 'bg-slate-100'}`}>{s.baseline} Risk</span></td>
                    <td className="p-3"><span className="text-red-600 font-semibold">{s.tag}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHeatmap = () => {
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
                    <th className="p-3 text-center">Self<br/><span className="text-xs font-normal text-slate-400">(ทุกวัน)</span></th>
                    <th className="p-3 text-center">Buddy<br/><span className="text-xs font-normal text-slate-400">(2ครั้ง/wk)</span></th>
                    <th className="p-3 text-center">Command<br/><span className="text-xs font-normal text-slate-400">(1ครั้ง/wk)</span></th>
                    <th className="p-3 text-center">Physical<br/>Fatigue</th><th className="p-3 text-center">ป่วย/เจ็บ</th><th className="p-3">Alert Score</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsWithLatestStatus.filter(s => s.room === room).map(s => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="p-3 font-medium text-slate-500">{s.id}</td><td className="p-3">{s.name}</td>
                      <td className="p-3"><div className="w-full h-8 rounded" style={{backgroundColor: COLORS[s.currentStatus.self]}}></div></td>
                      <td className="p-3"><div className="w-full h-8 rounded" style={{backgroundColor: COLORS[s.currentStatus.buddy]}}></div></td>
                      <td className="p-3"><div className="w-full h-8 rounded" style={{backgroundColor: COLORS[s.currentStatus.command]}}></div></td>
                      <td className="p-3 text-center font-bold text-slate-700">{s.currentStatus.fatigue}/10</td>
                      <td className="p-3 text-center">{s.currentStatus.injury === 1 ? <span className="text-red-500 font-bold">Yes</span> : <span className="text-slate-300">-</span>}</td>
                      <td className="p-3">{getAlertBadge(s.currentStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderIndividual = () => {
    const studentLogs = logs.filter(l => l.studentId === selectedStudent).sort((a, b) => new Date(a.date) - new Date(b.date));
    const studentInfo = students.find(s => s.id === selectedStudent);
    
    const chartData = studentLogs.map((l, index) => ({
      date: l.date,
      displayDate: l.date.substring(5),
      mentalMax: Math.max(l.self, l.buddy, l.command),
      fatigue: l.fatigue,
      selfScore: l.self, buddyScore: l.buddy, cmdScore: l.command
    }));

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">วิเคราะห์แนวโน้มรายบุคคล (Trends)</h3>
          </div>
          <select 
            className="p-2 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold"
            value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}
          >
            {students.map(s => <option key={s.id} value={s.id}>{s.id} - {s.name}</option>)}
          </select>
        </div>

        {studentInfo && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 col-span-1">
              <h4 className="font-bold text-slate-800 mb-4 border-b pb-2">ข้อมูลพื้นฐาน</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex justify-between"><span className="text-slate-500">ชื่อ-สกุล:</span> <span className="font-medium">{studentInfo.name}</span></li>
                <li className="flex justify-between"><span className="text-slate-500">ห้องพัก:</span> <span className="font-medium">{studentInfo.room}</span></li>
                <li className="flex justify-between"><span className="text-slate-500">Baseline Vulnerability:</span> <span className={`font-bold ${studentInfo.baseline === 'High' ? 'text-red-500' : ''}`}>{studentInfo.baseline}</span></li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 col-span-1 xl:col-span-2">
              <h4 className="font-bold text-slate-800 mb-4">กราฟแนวโน้ม กาย vs ใจ</h4>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="displayDate" tick={{fontSize: 10}} stroke="#94a3b8" />
                    <YAxis yAxisId="left" domain={[0, 4]} ticks={[1,2,3,4]} label={{ value: 'Mental Score', angle: -90, position: 'insideLeft', style: {fontSize: 12, fill: '#64748b'} }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 10]} label={{ value: 'Fatigue (1-10)', angle: 90, position: 'insideRight', style: {fontSize: 12, fill: '#64748b'} }} />
                    <RechartsTooltip labelFormatter={(label) => `วันที่: ${label}`} />
                    <Legend verticalAlign="top" height={36}/>
                    <Line yAxisId="left" type="monotone" dataKey="mentalMax" name="Mental Status (Max)" stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    <Line yAxisId="right" type="monotone" dataKey="fatigue" name="Physical Fatigue" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    <Brush dataKey="displayDate" height={20} stroke="#cbd5e1" travellerWidth={10} /> 
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDataEntry = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
      
      {/* SECTION 1: Bulk Upload (Primary) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="border-b pb-4 mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-blue-800 flex items-center">
              <UploadCloud className="mr-2" /> นำเข้าข้อมูลแบบกลุ่ม (CSV Upload)
            </h3>
            <p className="text-sm text-slate-500 mt-1">วิธีหลัก (Primary): สำหรับข้อมูลที่ธุรการพิมพ์สรุปจากกระดาษลง Excel</p>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="p-6 border-2 border-dashed border-blue-200 bg-blue-50/50 rounded-xl text-center">
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 inline-flex items-center"
            >
              <UploadCloud className="mr-2" size={20} />
              เลือกไฟล์ .CSV เพื่ออัปโหลด
            </button>
            <p className="text-xs text-slate-500 mt-3">* รองรับไฟล์ .csv ที่มีหัวคอลัมน์ถูกต้องเท่านั้น ข้อมูลจะถูกดึงเข้ากราฟแบบ Real-time ทันที</p>
          </div>

          {uploadStatus && (
            <div className={`p-3 rounded-lg text-sm font-medium ${uploadStatus.includes('สำเร็จ') ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
              {uploadStatus}
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h4 className="font-bold text-slate-700 text-sm mb-2 flex items-center justify-between">
              รูปแบบโครงสร้างไฟล์ (Format)
              <button onClick={downloadTemplate} className="text-blue-600 hover:text-blue-800 text-xs flex items-center bg-blue-100 px-2 py-1 rounded">
                <Download size={12} className="mr-1"/> โหลด Template
              </button>
            </h4>
            <div className="overflow-x-auto">
              <code className="text-xs text-slate-600 whitespace-pre">
                studentId,date,self,buddy,command,fatigue,injury<br/>
                001,2026-06-12,1,1,1,2,0<br/>
                002,2026-06-12,3,2,2,8,0
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Single Entry (Secondary) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="border-b pb-4 mb-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center">
            <FileEdit className="mr-2" /> บันทึกข้อมูลรายบุคคล (Manual)
          </h3>
          <p className="text-sm text-slate-500 mt-1">วิธีสำรอง (Secondary): สำหรับอัปเดตเคสฉุกเฉิน / แก้ไขข้อมูลระหว่างวัน</p>
        </div>

        <form onSubmit={handleEntrySubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">เลือกนักเรียน (ID)</label>
              <select className="w-full p-2 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-slate-500 outline-none" value={entryForm.studentId} onChange={(e) => setEntryForm({...entryForm, studentId: e.target.value})} required>
                {students.map(s => <option key={s.id} value={s.id}>{s.id} - {s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">วันที่ประเมิน</label>
              <input type="date" className="w-full p-2 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-slate-500 outline-none" value={entryForm.date} onChange={(e) => setEntryForm({...entryForm, date: e.target.value})} required />
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <h4 className="font-bold text-slate-700 text-xs border-b pb-1 mb-2">การประเมิน 4 สี</h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Self</label>
                <select className="w-full p-1 border rounded text-sm" value={entryForm.self} onChange={(e) => setEntryForm({...entryForm, self: e.target.value})}>
                  <option value="1">1-เขียว</option><option value="2">2-เหลือง</option><option value="3">3-ส้ม</option><option value="4">4-แดง</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Buddy</label>
                <select className="w-full p-1 border rounded text-sm" value={entryForm.buddy} onChange={(e) => setEntryForm({...entryForm, buddy: e.target.value})}>
                  <option value="1">1-เขียว</option><option value="2">2-เหลือง</option><option value="3">3-ส้ม</option><option value="4">4-แดง</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Command</label>
                <select className="w-full p-1 border rounded text-sm" value={entryForm.command} onChange={(e) => setEntryForm({...entryForm, command: e.target.value})}>
                  <option value="1">1-เขียว</option><option value="2">2-เหลือง</option><option value="3">3-ส้ม</option><option value="4">4-แดง</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <h4 className="font-bold text-slate-700 text-xs border-b pb-1 mb-2">ข้อมูลทางกาย</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ระดับความล้า (1-10)</label>
                <input type="number" min="1" max="10" className="w-full p-1 border rounded text-sm" value={entryForm.fatigue} onChange={(e) => setEntryForm({...entryForm, fatigue: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">เจ็บป่วย/งดฝึก</label>
                <select className="w-full p-1 border rounded text-sm" value={entryForm.injury} onChange={(e) => setEntryForm({...entryForm, injury: e.target.value})}>
                  <option value="0">ปกติ</option><option value="1">เจ็บป่วย/งด</option>
                </select>
              </div>
            </div>
          </div>

          <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-4 rounded-lg transition duration-200">
            บันทึกเคสรายบุคคล
          </button>
        </form>
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
            <button onClick={() => setActiveTab('entry')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'entry' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'}`}>
              <UploadCloud size={20} /><span>ระบบนำเข้าข้อมูล (Data)</span>
            </button>
          </div>
        </nav>
      </div>

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {activeTab === 'overview' && 'ภาพรวมสุขภาพจิต นรม.'}
              {activeTab === 'heatmap' && 'สถานะสุขภาพจิตแยกตามห้องพัก'}
              {activeTab === 'individual' && 'การติดตามและวิเคราะห์แนวโน้มรายบุคคล'}
              {activeTab === 'entry' && 'ศูนย์กลางนำเข้าและจัดการข้อมูล (Data Center)'}
            </h2>
            <p className="text-slate-500 text-sm mt-1 flex items-center">
              <Clock size={14} className="mr-1" /> ข้อมูลประมวลผลแบบ Real-time ทันทีที่นำเข้า
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
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
}