import { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Brush
} from 'recharts';
import { 
  LayoutDashboard, Users, User, Activity, Clock, HeartPulse, ShieldCheck
} from 'lucide-react';
import { AccessGate } from './auth/AccessGate.jsx';
import { useAuthorization } from './auth/useAuthorization.js';
import { firebaseConfig } from './config/firebase.js';
import { useMonitoringData } from './data/useMonitoringData.js';
import { createMonitoringAnalytics } from './domain/monitoringAnalytics.js';
import { OverviewScreen } from './screens/OverviewScreen.jsx';
import { RoomStatusScreen } from './screens/RoomStatusScreen.jsx';
import { Skeleton } from './ui/Skeleton.jsx';

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

  const [selectedStudent, setSelectedStudent] = useState('');
  const analytics = useMemo(() => createMonitoringAnalytics({
    students,
    logs: rawLogs,
    assessments,
  }), [students, rawLogs, assessments]);
  const studentOptions = useMemo(() => analytics.listStudents(), [analytics]);
  const activeStudentId = studentOptions.some(student => student.id === selectedStudent)
    ? selectedStudent
    : (studentOptions[0]?.id ?? '');
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
              {activeTab === 'overview' && <OverviewScreen analytics={analytics} loading={loading} />}
              {activeTab === 'heatmap' && <RoomStatusScreen analytics={analytics} loading={loading} />}
              {activeTab === 'individual' && renderIndividual()}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
