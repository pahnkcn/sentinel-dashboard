import { lazy, Suspense, useMemo, useState } from 'react';
import {
  Clock,
  HeartPulse,
  LayoutDashboard,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';

import { firebaseConfig } from './config/firebase.js';
import { useMonitoringData } from './data/useMonitoringData.js';
import { createMonitoringAnalytics } from './domain/monitoringAnalytics.js';
import { ScreenErrorBoundary } from './ui/ScreenErrorBoundary.jsx';
import { Skeleton } from './ui/Skeleton.jsx';

const loadOverviewScreen = () => import('./screens/OverviewScreen.jsx');
const loadRoomStatusScreen = () => import('./screens/RoomStatusScreen.jsx');
const loadIndividualScreen = () => import('./screens/IndividualScreen.jsx');

const WORKFLOWS = {
  overview: {
    title: 'Population Trends',
    label: 'ภาพรวม (Overview)',
    icon: LayoutDashboard,
    preload: loadOverviewScreen,
    Screen: lazy(() => loadOverviewScreen().then(module => ({ default: module.OverviewScreen }))),
  },
  heatmap: {
    title: 'Room Status',
    label: 'สถานะรายห้อง (Heatmap)',
    icon: Users,
    preload: loadRoomStatusScreen,
    Screen: lazy(() => loadRoomStatusScreen().then(module => ({ default: module.RoomStatusScreen }))),
  },
  individual: {
    title: 'Individual Tracking',
    label: 'ติดตามรายบุคคล (Trends)',
    icon: User,
    preload: loadIndividualScreen,
    Screen: lazy(() => loadIndividualScreen().then(module => ({ default: module.IndividualScreen }))),
  },
};
const SYNC_TIME_FORMATTER = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'short',
  timeStyle: 'medium',
});
const DATA_STATUS_LABELS = {
  idle: 'Starting',
  connecting: 'Connecting',
  ready: 'Verified',
  degraded: 'Incomplete',
  error: 'Failed',
};

function preloadWorkflow(event) {
  void WORKFLOWS[event.currentTarget.dataset.workflow]?.preload().catch(() => undefined);
}

function ScreenFallback() {
  return (
    <div role="status" className="space-y-6" aria-label="กำลังโหลดหน้าวิเคราะห์">
      <Skeleton className="h-24" />
      <Skeleton className="h-72" />
    </div>
  );
}

export default function Dashboard({ authorization }) {
  const [activeTab, setActiveTab] = useState('overview');
  const { user, role, signOut } = authorization;
  const {
    students,
    logs,
    assessments,
    loading,
    issueCount: invalidRecordCount,
    status: dataStatus,
    truncatedStreams,
    lastUpdatedAt,
  } = useMonitoringData();
  const analytics = useMemo(
    () => createMonitoringAnalytics({ students, logs, assessments }),
    [students, logs, assessments],
  );
  const lastSyncLabel = lastUpdatedAt
    ? SYNC_TIME_FORMATTER.format(new Date(lastUpdatedAt))
    : '-';
  const dataStatusLabel = DATA_STATUS_LABELS[dataStatus];
  const dataBlocked = dataStatus === 'degraded' || dataStatus === 'error';
  const activeWorkflow = WORKFLOWS[activeTab];
  const ActiveScreen = activeWorkflow.Screen;

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] font-sans text-slate-900 md:flex-row">
      <aside className="sticky top-0 z-20 flex w-full flex-col bg-[#0f172a] text-white shadow-2xl md:min-h-screen md:w-72">
        <div className="border-b border-white/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/30">
            <HeartPulse size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tighter">SENTINEL</h1>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 opacity-60">
            Mental Health Dashboard
          </p>
        </div>

        <nav aria-label="หน้าวิเคราะห์" className="mt-4 flex-1 space-y-2 p-4">
          {Object.entries(WORKFLOWS).map(([id, workflow]) => {
            const Icon = workflow.icon;

            return (
              <button
                key={id}
                type="button"
                data-workflow={id}
                aria-current={activeTab === id ? 'page' : undefined}
                onMouseEnter={preloadWorkflow}
                onFocus={preloadWorkflow}
                onClick={() => setActiveTab(id)}
                className={`flex w-full items-center space-x-4 rounded-2xl px-6 py-4 font-bold transition-all duration-300 ${activeTab === id ? 'translate-x-2 bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
              >
                <Icon size={20} />
                <span>{workflow.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/5 bg-slate-900/50 p-6">
          <p className={`truncate text-[10px] font-bold uppercase tracking-widest ${dataStatus === 'ready' ? 'text-emerald-400' : dataStatus === 'error' ? 'text-rose-400' : 'text-amber-400'}`}>
            Data · {dataStatusLabel}
          </p>
          <p className="mt-1 truncate text-[10px] text-slate-500">
            Last verified sync · {lastSyncLabel}
          </p>
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
      </aside>

      <div className="flex-1 overflow-y-auto bg-[#f8fafc] p-6 md:p-12">
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

        <header className="mb-12 flex items-end justify-between">
          <div>
            <h2 className="text-4xl font-black tracking-tight text-slate-900">
              {activeWorkflow.title}
            </h2>
            <p className="mt-3 flex items-center font-mono text-sm font-bold text-slate-400">
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
            <ScreenErrorBoundary key={activeTab}>
              <Suspense fallback={<ScreenFallback />}>
                <ActiveScreen analytics={analytics} loading={loading} />
              </Suspense>
            </ScreenErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
}
