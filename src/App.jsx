import { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Brush
} from 'recharts';
import { 
  LayoutDashboard, Users, User, Activity, Clock, HeartPulse, ShieldCheck, BookOpen, Calendar
} from 'lucide-react';
import { AccessGate } from './auth/AccessGate.jsx';
import { useAuthorization } from './auth/useAuthorization.js';
import { firebaseConfig } from './config/firebase.js';
import { useMonitoringData } from './data/useMonitoringData.js';
import { createMonitoringAnalytics } from './domain/monitoringAnalytics.js';

// ==========================================
// HELPERS & CONSTANTS
// ==========================================
const COLORS = { 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444' };

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
  const monitoringData = useMonitoringData();
  const {
    students,
    logs: rawLogs,
    assessments,
    loading,
    issueCount: invalidRecordCount,
    status: dataStatus,
    truncatedStreams,
    lastUpdatedAt,
  } = monitoringData;
  const loadingStudents = loading.students;
  const loadingLogs = loading.logs;
  const loadingAssessments = loading.assessments;

  const [genderFilter, setGenderFilter] = useState('all');

  const [selectedStudent, setSelectedStudent] = useState('');
  const [heatmapDate, setHeatmapDate] = useState(new Date().toISOString().split('T')[0]);
  const analytics = useMemo(() => createMonitoringAnalytics({
    students,
    logs: rawLogs,
    assessments,
  }), [students, rawLogs, assessments]);
  const studentOptions = useMemo(() => analytics.listStudents(), [analytics]);
  const activeStudentId = studentOptions.some(student => student.id === selectedStudent)
    ? selectedStudent
    : (studentOptions[0]?.id ?? '');
  const overview = useMemo(
    () => analytics.getOverview({ gender: genderFilter }),
    [analytics, genderFilter],
  );
  const roomStatus = useMemo(
    () => analytics.getRoomStatus({ date: heatmapDate }),
    [analytics, heatmapDate],
  );
  const individual = useMemo(
    () => analytics.getIndividual({ studentId: activeStudentId }),
    [analytics, activeStudentId],
  );
  const lastSyncLabel = lastUpdatedAt
    ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'medium' })
        .format(new Date(lastUpdatedAt))
    : '-';
  const dataStatusLabel = {
    idle: 'Starting',
    connecting: 'Connecting',
    ready: 'Current',
    degraded: 'Incomplete',
    error: 'Failed',
  }[dataStatus];
  const dataBlocked = dataStatus === 'degraded' || dataStatus === 'error';

  // ==========================================
  // RENDERS
  // ==========================================
  const renderOverview = () => {
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
                <p className="text-2xl font-black text-slate-800">{overview.totalStudents}</p>
              </div>
              <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                <p className="text-xs font-bold text-rose-500 mb-1">วิกฤต 3 ด้าน (แดงล้วน)</p>
                <p className="text-2xl font-black text-rose-700">{overview.alerts.red3}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                <p className="text-xs font-bold text-orange-600 mb-1">เฝ้าระวัง (Self แดง + 1)</p>
                <p className="text-2xl font-black text-orange-700">{overview.alerts.redSelfPlus}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                <p className="text-xs font-bold text-purple-600 mb-1">ติดตามโดยจิตเวช</p>
                <p className="text-2xl font-black text-purple-700">{overview.alerts.psychiatricCare}</p>
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
                <LineChart data={overview.populationTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis domain={[1, 4]} ticks={[1, 2, 3, 4]} />
                  <RechartsTooltip content={({ active, payload, label }) => active && payload ? (
                    <div className="bg-white p-3 border rounded-lg shadow-xl text-xs">
                      <p className="font-bold mb-2 border-b pb-1">{label} (N={overview.filteredStudentCount})</p>
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
                  <LineChart data={overview.dassTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
                  <LineChart data={overview.resilienceTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
    const { rooms } = roomStatus;

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
           <span><b className="text-amber-600">CF</b> = ค่าจากวันที่ก่อนหน้า</span>
        </div>

        {loadingStudents || loadingLogs || loadingAssessments ? (
          <div className="space-y-6">{[1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}</div>
        ) : rooms.length > 0 ? rooms.map(room => (
          <div key={room.name} className="mb-10">
            <h4 className="text-lg font-bold mb-4 text-blue-700 bg-blue-50/50 inline-block px-4 py-1 rounded-full border border-blue-100">ห้องพัก: {room.name}</h4>
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
                  {room.students.map(({ student: s, observation: stL, assessment: stA, physicalLabel }) => {
                    return (
                      <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                        <td className="p-4 font-medium text-slate-400">{s.id}</td>
                        <td className="p-4 font-bold text-slate-700">{s.name}</td>
                        <td className="p-4 text-center">
                          <div className="w-6 h-6 mx-auto rounded-md shadow-inner" style={{ backgroundColor: COLORS[stL?.self] || '#f1f5f9' }}></div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="w-6 h-6 mx-auto rounded-md shadow-inner" style={{ backgroundColor: COLORS[stL?.buddy] || '#f1f5f9' }}></div>
                          {stL?.isBuddyCF && <span className="mt-1 block text-[9px] font-bold text-amber-600">CF {stL.buddySourceDate}</span>}
                        </td>
                        <td className="p-4 text-center">
                          <div className="w-6 h-6 mx-auto rounded-md shadow-inner" style={{ backgroundColor: COLORS[stL?.command] || '#f1f5f9' }}></div>
                          {stL?.isCommandCF && <span className="mt-1 block text-[9px] font-bold text-amber-600">CF {stL.commandSourceDate}</span>}
                        </td>
                        <td className="p-4 text-center font-bold text-slate-600 border-l">
                          {stA?.cd_risc ?? '-'}
                          {stA && <span className="mt-1 block text-[9px] font-medium text-slate-400">Wk {stA.week}</span>}
                        </td>
                        <td className="p-4 text-center font-bold text-slate-600">{stA?.grit ?? '-'}</td>
                        <td className="p-4 text-center font-bold text-slate-600">{stA?.dass_d ?? '-'}</td>
                        <td className="p-4 text-center font-bold text-slate-600">{stA?.dass_a ?? '-'}</td>
                        <td className="p-4 text-center font-bold text-slate-600">{stA?.dass_s ?? '-'}</td>
                        <td className="p-4 text-center font-bold text-slate-600 border-l">{physicalLabel}</td>
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
    if (loadingStudents) return <div className="space-y-6"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
    if (!individual) return <div className="p-12 text-center text-slate-400 font-bold bg-white rounded-2xl border border-dashed border-slate-300">กรุณาเลือกนักเรียนจากเมนู</div>;

    const { student: s, latestAssessment: latestAssess } = individual;

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold">ผลวิเคราะห์: <span className="text-blue-600">{s.name}</span></h3>
          <select className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={activeStudentId} onChange={(e) => setSelectedStudent(e.target.value)}>
            {studentOptions.map(sx => <option key={sx.id} value={sx.id}>{sx.id} - {sx.name}</option>)}
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
              <div className="flex justify-between items-center"><span className="text-slate-500">ความรุนแรงจิตเวช:</span><b className={s.demographics?.mentalSeverity === 3 ? 'text-rose-500' : 'text-slate-800'}>{s.mentalSeverityLabel}</b></div>
            </div>
            <div className="pt-4 border-t mt-4">
              <h4 className="font-bold text-purple-600 mb-3 flex items-center">ผลประเมินล่าสุด (Latest)</h4>
              <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 text-sm space-y-2">
                <div className="flex justify-between"><span>CD-RISC:</span><b className="text-purple-700">{latestAssess?.cd_risc ?? '-'} ({latestAssess?.cdRiscInterpretation ?? '-'})</b></div>
                <div className="flex justify-between"><span>GRIT:</span><b className="text-emerald-600">{latestAssess?.grit ?? '-'} ({latestAssess?.gritInterpretation ?? '-'})</b></div>
              </div>
            </div>
            <div className="pt-4 border-t mt-4">
              <h4 className="font-bold text-slate-800 mb-2 flex items-center"><ShieldCheck size={18} className="mr-2 text-purple-500"/> Note (Drawing Test)</h4>
              <p className="text-sm text-slate-600 italic bg-slate-50 p-4 rounded-xl border border-slate-100">"{individual.drawingNote}"</p>
            </div>
          </div>
          <div className="col-span-1 xl:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="font-bold mb-6 text-slate-800 flex items-center"><Activity size={18} className="mr-2 text-blue-500"/> 4 Colors Trend (รายวัน)</h4>
              {loadingLogs ? <Skeleton className="h-56" /> : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={individual.fourColorTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="show" tick={{ fontSize: 10 }} />
                      <YAxis domain={[1, 4]} ticks={[1, 2, 3, 4]} />
                      <RechartsTooltip />
                      <Line type="stepAfter" dataKey="self" stroke="#3b82f6" strokeWidth={3} dot={false} />
                      <Line type="stepAfter" dataKey="buddy" stroke="#10b981" strokeWidth={3} dot={false} />
                      <Line type="stepAfter" dataKey="command" name="Command" stroke="#f59e0b" strokeWidth={3} dot={false} />
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
                      <LineChart data={individual.assessments}>
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
                      <LineChart data={individual.resilienceTrend}>
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
          <p className={`truncate text-[10px] font-bold uppercase tracking-widest ${dataStatus === 'ready' ? 'text-emerald-400' : dataStatus === 'error' ? 'text-rose-400' : 'text-amber-400'}`}>
            Data · {dataStatusLabel}
          </p>
          <p className="mt-1 truncate text-[10px] text-slate-500">Last verified sync · {lastSyncLabel}</p>
          <p className="mt-3 truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {role} · {user.email}
          </p>
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
        {dataStatus === 'error' && (
          <div role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <p className="font-bold">การเชื่อมต่อข้อมูลล้มเหลว</p>
            <p className="mt-1 text-sm">
              ระบบหยุดแสดงผลวิเคราะห์เพื่อป้องกันการใช้ข้อมูลเก่าหรือข้อมูลไม่ครบ
            </p>
          </div>
        )}
        {dataStatus === 'degraded' && (
          <div role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="font-bold">ข้อมูลไม่ครบถ้วน — หยุดแสดงผลวิเคราะห์</p>
            <p className="mt-1 text-sm">
              {invalidRecordCount > 0 && `พบข้อมูลไม่ผ่านการตรวจสอบ ${invalidRecordCount} รายการ`}
              {invalidRecordCount > 0 && truncatedStreams.length > 0 && ' และ'}
              {truncatedStreams.length > 0 && `พบข้อมูลเกินขีดจำกัดใน ${truncatedStreams.join(', ')}`}
            </p>
          </div>
        )}
        <header className="mb-12 flex justify-between items-end">
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">
              {activeTab === 'overview' && 'Population Trends'}
              {activeTab === 'heatmap' && 'Room Status'}
              {activeTab === 'individual' && 'Individual Tracking'}
            </h2>
            <p className="text-slate-400 text-sm mt-3 flex items-center font-bold font-mono">
              <Clock size={16} className="mr-2" />
              {dataStatus === 'ready'
                ? `verified sync from ${firebaseConfig.projectId} · ${lastSyncLabel}`
                : `sync status: ${dataStatusLabel}`}
            </p>
          </div>
        </header>
        <main className="max-w-7xl">
          {dataBlocked ? (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <ShieldCheck className="mx-auto text-slate-400" size={36} />
              <h3 className="mt-4 text-lg font-black text-slate-800">Analytics paused</h3>
              <p className="mt-2 text-sm text-slate-500">
                แก้ไขการเชื่อมต่อหรือข้อมูลต้นทางให้ครบถ้วนก่อนใช้ผลติดตาม
              </p>
            </section>
          ) : (
            <>
              {activeTab === 'overview' && renderOverview()}
              {activeTab === 'heatmap' && renderHeatmap()}
              {activeTab === 'individual' && renderIndividual()}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
