import { memo, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BookOpen, ShieldCheck } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton.jsx';
import {
  formatStandardDeviation,
  hasStatisticValue,
} from '../ui/statisticsPresentation.js';

const GENDER_FILTERS = ['all', 'ชาย', 'หญิง'];

function PopulationTooltip({ active, payload, label }) {
  if (!active || !payload) return null;

  return (
    <div className="max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-3 text-xs shadow-xl">
      <p className="mb-2 border-b pb-1 font-bold">{label}</p>
      {payload.map(entry => hasStatisticValue(entry.value) ? (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value} (N={entry.payload[`${entry.dataKey}_n`]}, SD:{' '}
          {formatStandardDeviation(entry.payload[`${entry.dataKey}_sd`])})
        </p>
      ) : null)}
    </div>
  );
}

function AssessmentTooltip({ active, payload, label }) {
  if (!active || !payload) return null;

  return (
    <div className="max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-3 text-xs shadow-xl">
      <p className="mb-2 border-b pb-1 font-bold">{label}</p>
      {payload.map(entry => hasStatisticValue(entry.value) ? (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value} (N={entry.payload[`${entry.dataKey}_n`]}, SD:{' '}
          {formatStandardDeviation(entry.payload[`${entry.dataKey}_sd`])})
        </p>
      ) : null)}
    </div>
  );
}

export const OverviewScreen = memo(function OverviewScreen({ analytics, loading }) {
  const [genderFilter, setGenderFilter] = useState('all');
  const overview = useMemo(
    () => analytics.getOverview({ gender: genderFilter }),
    [analytics, genderFilter],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="mb-4 flex items-center text-base font-bold text-slate-800 sm:text-lg">
          <BookOpen className="mr-2 text-blue-500" size={20} /> Demographic & Alert Status
        </h3>
        {loading.students ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 sm:p-4">
              <p className="mb-1 text-xs font-bold text-slate-500">นรม. ในระบบ</p>
              <p className="text-2xl font-black text-slate-800">{overview.totalStudents}</p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 sm:p-4">
              <p className="mb-1 text-xs font-bold text-rose-500">วิกฤต 3 ด้าน (แดงล้วน)</p>
              <p className="text-2xl font-black text-rose-700">{overview.alerts.red3}</p>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50 p-3 sm:p-4">
              <p className="mb-1 text-xs font-bold text-orange-600">เฝ้าระวัง (Self แดง + 1)</p>
              <p className="text-2xl font-black text-orange-700">{overview.alerts.redSelfPlus}</p>
            </div>
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-3 sm:p-4">
              <p className="mb-1 text-xs font-bold text-purple-600">ติดตามโดยจิตเวช</p>
              <p className="text-2xl font-black text-purple-700">{overview.alerts.psychiatricCare}</p>
            </div>
          </div>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="flex items-center text-base font-bold text-slate-800 sm:text-lg">
            <Activity className="mr-2 text-blue-500" size={20} /> Population Trend: 4 Colors
          </h3>
          <div className="grid w-full grid-cols-3 rounded-lg bg-slate-100 p-1 sm:flex sm:w-auto">
            {GENDER_FILTERS.map(gender => (
              <button
                key={gender}
                type="button"
                aria-pressed={genderFilter === gender}
                onClick={() => setGenderFilter(gender)}
                className={`min-h-9 rounded-md px-2 py-1.5 text-xs font-bold transition-all sm:px-4 ${genderFilter === gender ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                {gender === 'all' ? 'ทั้งหมด' : gender}
              </button>
            ))}
          </div>
        </div>
        {loading.logs ? <Skeleton className="h-72" /> : (
          <div className="h-64 w-full min-w-0 sm:h-72">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={overview.populationTrend} margin={{ top: 5, right: 8, left: -16, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
                <YAxis width={32} domain={[1, 4]} ticks={[1, 2, 3, 4]} />
                <RechartsTooltip content={<PopulationTooltip />} />
                <Legend iconType="circle" />
                <Line type="monotone" dataKey="self" name="Self" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="buddy" name="Buddy" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="command" name="Command" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          <h3 className="mb-6 flex items-center text-base font-bold text-slate-800 sm:text-lg">
            <ShieldCheck className="mr-2 text-rose-500" size={20} /> DASS-21 (คะแนนดิบเฉลี่ย 0–21)
          </h3>
          {loading.assessments ? <Skeleton className="h-72" /> : (
            <div className="h-64 w-full min-w-0 sm:h-72">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={overview.dassTrend} margin={{ top: 5, right: 8, left: -16, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis width={32} domain={[0, 21]} ticks={[0, 7, 14, 21]} />
                  <RechartsTooltip content={<AssessmentTooltip />} />
                  <Legend iconType="circle" />
                  <Line type="monotone" dataKey="dass_d" name="Depression" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5 }} connectNulls />
                  <Line type="monotone" dataKey="dass_a" name="Anxiety" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5 }} connectNulls />
                  <Line type="monotone" dataKey="dass_s" name="Stress" stroke="#ef4444" strokeWidth={3} dot={{ r: 5 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          <h3 className="mb-6 flex items-center text-base font-bold text-slate-800 sm:text-lg">
            <ShieldCheck className="mr-2 text-purple-500" size={20} /> CD-RISC & GRIT
          </h3>
          {loading.assessments ? <Skeleton className="h-72" /> : (
            <div className="h-64 w-full min-w-0 sm:h-72">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={overview.resilienceTrend} margin={{ top: 5, right: -8, left: -16, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis width={36} yAxisId="left" domain={[0, 40]} />
                  <YAxis width={36} yAxisId="right" orientation="right" domain={[0, 32]} />
                  <RechartsTooltip content={<AssessmentTooltip />} />
                  <Legend iconType="circle" />
                  <Line yAxisId="left" type="monotone" dataKey="cd_risc" name="CD-RISC" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 5 }} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="grit" name="GRIT" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} connectNulls strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
    </div>
  );
});
