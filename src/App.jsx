import { useState, useMemo } from 'react';
import { 
  LayoutDashboard, Users, User, Clock, HeartPulse, ShieldCheck
} from 'lucide-react';
import { AccessGate } from './auth/AccessGate.jsx';
import { useAuthorization } from './auth/useAuthorization.js';
import { firebaseConfig } from './config/firebase.js';
import { useMonitoringData } from './data/useMonitoringData.js';
import { createMonitoringAnalytics } from './domain/monitoringAnalytics.js';
import { IndividualScreen } from './screens/IndividualScreen.jsx';
import { OverviewScreen } from './screens/OverviewScreen.jsx';
import { RoomStatusScreen } from './screens/RoomStatusScreen.jsx';

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
  const analytics = useMemo(() => createMonitoringAnalytics({
    students,
    logs: rawLogs,
    assessments,
  }), [students, rawLogs, assessments]);
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
              {activeTab === 'individual' && <IndividualScreen analytics={analytics} loading={loading} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
