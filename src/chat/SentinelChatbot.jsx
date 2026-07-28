import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Bot,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  Cpu,
  LockKeyhole,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import { askSentinelAssistant } from './chatApi.js';
import { createAnalysisRequest, createEvidenceEnvelope } from './chatContext.js';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from './chatModels.js';
import { createConversationPrivacy, createDisclosureReceipt } from './chatPrivacy.js';
import { getChatConnectionPresentation } from './chatStatus.js';
import { MODEL_LOGOS } from './modelLogos.js';

const QUICK_QUESTIONS = [
  'สรุปภาพรวมและจุดที่ควรติดตามวันนี้',
  'ห้องใดมีสัญญาณน่ากังวลมากที่สุด แสดงเป็นกราฟ',
  'คาดการณ์แนวโน้ม Self ใน 4 สัปดาห์ข้างหน้า',
  'จัดอันดับรายชื่อที่ควรทบทวนข้อมูลเพิ่มเติม',
];
const CHART_COLORS = Object.freeze({
  blue: '#2563eb',
  emerald: '#059669',
  amber: '#d97706',
  rose: '#e11d48',
  violet: '#7c3aed',
  slate: '#475569',
});
const CONFIDENCE_LABELS = Object.freeze({
  high: 'ข้อมูลรองรับสูง',
  medium: 'ข้อมูลรองรับปานกลาง',
  low: 'ข้อมูลรองรับจำกัด',
});
const RESPONSE_STATUS = Object.freeze({
  answered: { label: 'ตอบได้ครบ', className: 'bg-emerald-100 text-emerald-700' },
  partial: { label: 'ตอบได้บางส่วน', className: 'bg-amber-100 text-amber-700' },
  insufficient: { label: 'หลักฐานไม่พอ', className: 'bg-rose-100 text-rose-700' },
});
const LIMITATION_LABELS = Object.freeze({
  'insufficient-evidence': 'หลักฐานไม่เพียงพอ',
  'forecast-unavailable': 'ไม่มีหลักฐานคาดการณ์',
  'small-group-suppressed': 'ปกปิดกลุ่มขนาดเล็ก',
  'metric-omitted-by-privacy-budget': 'ตัดบางตัวชี้วัดตามเพดานความเป็นส่วนตัว',
  'time-window-unavailable': 'ช่วงเวลาที่ขอไม่มีในหลักฐาน',
  'aggregate-only': 'มีเฉพาะข้อมูลรวม',
  'no-causal-evidence': 'ไม่มีหลักฐานเชิงสาเหตุ',
  'carried-forward-present': 'มีค่าที่นำมาจากครั้งก่อน',
  'requested-output-unavailable': 'ไม่สามารถสร้างรูปแบบผลลัพธ์ที่ขอได้ครบ',
  'provider-fallback': 'ใช้คำตอบสำรองจากหลักฐานในระบบ เพราะโมเดลภายนอกไม่พร้อมตอบ',
});
const METRIC_LABELS = Object.freeze({
  self: 'Self',
  buddy: 'Buddy',
  command: 'Command',
  depression: 'Depression',
  anxiety: 'Anxiety',
  stress: 'Stress',
  cd_risc: 'CD-RISC',
  grit: 'Grit',
  mental_severity: 'ระดับสุขภาพจิต',
  physical_injury: 'การบาดเจ็บทางกาย',
  total_students: 'จำนวนนักเรียนทั้งหมด',
  observed_students: 'จำนวนนักเรียนที่มีข้อมูล',
  concern_count: 'จำนวนที่ควรติดตาม',
  physical_concern_count: 'จำนวนสัญญาณทางกาย',
  alert_red3: 'สัญญาณ Red 3',
  alert_red_self_plus: 'สัญญาณ Red Self+',
  psychiatric_care: 'จำนวนที่อยู่ในการดูแลจิตเวช',
});
const OPERATION_LABELS = Object.freeze({
  summarize: 'สรุปข้อมูล',
  lookup: 'ค้นหาค่า',
  trend: 'วิเคราะห์แนวโน้ม',
  compare: 'เปรียบเทียบ',
  rank: 'จัดอันดับ',
  count: 'นับจำนวน',
  forecast: 'คาดการณ์',
});
const SCOPE_LABELS = Object.freeze({
  overview: 'ภาพรวม',
  subject: 'รายบุคคลแบบนามแฝง',
  room: 'รายห้องแบบนามแฝง',
});
const TIME_MODE_LABELS = Object.freeze({
  latest: 'ข้อมูลล่าสุด',
  available_range: 'ทุกช่วงที่มีข้อมูล',
  week_windows: 'ช่วงสัปดาห์ที่ระบุ',
  recent_vs_previous: 'ช่วงล่าสุดเทียบช่วงก่อนหน้า',
  forecast_horizon: 'ช่วงคาดการณ์',
});
const OMITTED_FIELD_LABELS = Object.freeze({
  names: 'ชื่อจริง',
  'student-ids': 'รหัสประจำตัว',
  'room-names': 'ชื่อห้องจริง',
  demographics: 'ข้อมูลประชากร',
  'free-text-notes': 'บันทึกข้อความอิสระ',
  'raw-records': 'ระเบียนดิบ',
  'full-transcript': 'ประวัติสนทนาทั้งหมด',
  'unrequested-metrics': 'ตัวชี้วัดที่ไม่ได้ถาม',
  'small-groups': 'ข้อมูลกลุ่มขนาดเล็ก',
});
const CONSTRAINT_LABELS = Object.freeze({
  'verified-data-only': 'ใช้เฉพาะข้อมูลที่ผ่านการตรวจสอบ',
  'carried-forward-is-not-new': 'ไม่นับ carried-forward เป็นการสังเกตใหม่',
  'decision-support-only': 'ใช้เพื่อสนับสนุนการตัดสินใจเท่านั้น',
  'prediction-is-exploratory': 'การคาดการณ์เป็นเชิงสำรวจ',
  'prediction-ordinary-least-squares': 'คาดการณ์ด้วยแนวโน้มเชิงเส้น OLS',
  'insufficient-small-group': 'ปกปิดกลุ่มที่มีขนาดต่ำกว่าเกณฑ์',
});
const DERIVED_FIELD_LABELS = Object.freeze({
  first: 'ค่าแรก',
  last: 'ค่าล่าสุด',
  min: 'ต่ำสุด',
  max: 'สูงสุด',
  mean: 'เฉลี่ย',
  change: 'ผลต่าง',
  slopePerWeek: 'ความชัน/สัปดาห์',
  observedPoints: 'จุดสังเกตจริง',
});

function formatReferenceNumber(value) {
  if (value === null) return 'ไม่มีค่า';
  if (!Number.isFinite(value)) return String(value ?? '—');
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 }).format(value);
}

function referenceMetricLabel(metric) {
  const forecast = metric.endsWith('_forecast');
  const base = forecast ? metric.slice(0, -'_forecast'.length) : metric;
  const label = METRIC_LABELS[base] ?? base;
  return forecast ? `${label} (คาดการณ์)` : label;
}

function referencePosition(value) {
  const labels = [];
  if (Number.isInteger(value.week)) labels.push(`สัปดาห์ ${value.week}`);
  if (value.date) labels.push(value.date);
  return labels.join(' · ') || 'ค่าล่าสุด';
}

function ReferenceSummary({ summary, title }) {
  const values = Object.entries(DERIVED_FIELD_LABELS)
    .filter(([key]) => summary?.[key] !== undefined && summary[key] !== null);
  const period = Number.isInteger(summary?.fromWeek) && Number.isInteger(summary?.toWeek)
    ? `สัปดาห์ ${summary.fromWeek}–${summary.toWeek}`
    : null;
  if (values.length === 0 && !period) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="font-bold text-slate-600">{title}{period ? ` · ${period}` : ''}</p>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
        {values.map(([key, label]) => (
          <div key={key} className="min-w-0">
            <dt className="text-[9px] text-slate-400">{label}</dt>
            <dd className="break-all font-semibold text-slate-700">
              {formatReferenceNumber(summary[key])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReferenceMetric({ metric }) {
  const representationLabel = {
    scalar: 'ค่ารายการเดียว',
    points: 'จุดข้อมูลที่ส่ง',
    derived: 'ค่าสรุปที่คำนวณแล้ว · ไม่ส่งจุดข้อมูลดิบ',
    'points-and-derived': 'จุดข้อมูลและค่าสรุปที่คำนวณแล้ว',
  }[metric.representation] ?? metric.representation;
  return (
    <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-2.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
        <h6 className="break-words font-bold text-slate-700">
          {referenceMetricLabel(metric.metric)}
        </h6>
        <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
          {representationLabel}
        </span>
      </div>

      {Object.hasOwn(metric, 'value') && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <p className="font-bold text-slate-700">
            {referencePosition(metric)} = {formatReferenceNumber(metric.value)}
          </p>
          <p className="mt-0.5 text-[9px] text-slate-400">
            {metric.rank ? `อันดับ ${metric.rank} · ` : ''}
            {metric.sampleSize ? `กลุ่มตัวอย่าง ${metric.sampleSize} คน · ` : ''}
            {metric.carriedForward ? 'นำค่าจากครั้งก่อนมาใช้' : 'ค่าที่สังเกตจริง'}
          </p>
        </div>
      )}

      {metric.points?.length > 0 && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-[10px]">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2.5 py-1.5 font-bold">ช่วงข้อมูล</th>
                <th className="px-2.5 py-1.5 text-right font-bold">ค่า</th>
                <th className="px-2.5 py-1.5 text-right font-bold">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {metric.points.map((point, index) => (
                <tr key={`${point.week ?? point.date ?? index}-${index}`} className="border-t border-slate-100">
                  <td className="px-2.5 py-1.5 text-slate-600">{referencePosition(point)}</td>
                  <td className="px-2.5 py-1.5 text-right font-semibold text-slate-700">
                    {formatReferenceNumber(point.value)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[9px] text-slate-400">
                    {point.carriedForward ? 'จากครั้งก่อน' : point.sampleSize ? `${point.sampleSize} คน` : 'สังเกตจริง'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {metric.derived?.trend && (
        <div className="mt-2">
          <ReferenceSummary summary={metric.derived.trend} title="ค่าสรุปตลอดช่วง" />
        </div>
      )}
      {metric.derived?.windowSummaries?.length > 0 && (
        <div className="mt-2 space-y-2">
          {metric.derived.windowSummaries.map((summary, index) => (
            <ReferenceSummary key={index} summary={summary} title={`ค่าสรุปช่วงที่ ${index + 1}`} />
          ))}
        </div>
      )}
    </section>
  );
}

function DisclosureDetails({ disclosure, redactionCount }) {
  const details = disclosure.referenceDetails;
  const sourceLabel = details?.source === 'model-provider'
    ? 'รายการด้านล่างคือข้อมูลที่ส่งให้ผู้ให้บริการโมเดลจริง'
    : details?.source === 'server-local'
      ? 'รายการด้านล่างใช้คำนวณภายในเซิร์ฟเวอร์เท่านั้น'
      : 'รายการด้านล่างคือหลักฐานแบบนามแฝงที่ส่งถึง privacy gateway';
  const timeLabel = details?.time
    ? TIME_MODE_LABELS[details.time.mode] ?? details.time.mode
    : null;
  const windows = details?.time?.windows?.map(window => (
    `สัปดาห์ ${window.fromWeek}–${window.toWeek}`
  )).join(', ');
  const entityLabel = entity => {
    if (entity.scope === 'overview') return 'ข้อมูลภาพรวม';
    const alias = String(entity.alias ?? '').replaceAll('[[', '').replaceAll(']]', '');
    return `${entity.scope === 'room' ? 'ห้อง' : 'บุคคล'}นามแฝง ${alias || 'ไม่ระบุ'}`;
  };

  return (
    <details className="group mt-2 rounded-xl border border-emerald-100 bg-emerald-50/70 text-[10px] text-emerald-900">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block break-words">
            {disclosure.providerEgress === false
              ? 'อ้างอิงหลักฐานในเซิร์ฟเวอร์ · ไม่ส่งให้โมเดลภายนอก'
              : `ส่งหลักฐานแบบนามแฝง ${disclosure.providerAttemptCount ?? 1} ครั้ง · ${(disclosure.byteCount / 1024).toFixed(1)} KB`}
          </span>
          <span className="mt-0.5 block font-medium text-emerald-700">กดดูรายละเอียดข้อมูลที่อ้างอิง</span>
        </span>
        <ChevronDown size={16} className="flex-shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-emerald-100 px-3 py-3">
        <p className="leading-4 text-emerald-800">{sourceLabel}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-white/80 p-2.5 text-slate-600 sm:grid-cols-3">
          <div><span className="block text-[9px] text-slate-400">การวิเคราะห์</span><b>{OPERATION_LABELS[details?.operation] ?? details?.operation ?? 'ไม่ระบุ'}</b></div>
          <div><span className="block text-[9px] text-slate-400">ขอบเขต</span><b>{SCOPE_LABELS[details?.scope] ?? details?.scope ?? 'ไม่ระบุ'}</b></div>
          <div><span className="block text-[9px] text-slate-400">ช่วงเวลา</span><b>{timeLabel ?? 'ไม่ระบุ'}{windows ? ` · ${windows}` : ''}</b></div>
        </div>

        <p className="mt-2 leading-4 text-emerald-700">
          บุคคลแบบนามแฝง {disclosure.subjectCount} ราย · ห้องแบบนามแฝง {disclosure.roomCount} ห้อง · {disclosure.metricCount ?? 0} ชุดข้อมูล ({disclosure.uniqueMetricCount ?? disclosure.metricCount ?? 0} ตัวชี้วัดไม่ซ้ำ) · {disclosure.evidencePointCount ?? disclosure.observedPointCount ?? 0} จุดหลักฐาน
          {(disclosure.carriedForwardPointCount ?? 0) > 0 ? ` · carried-forward ${disclosure.carriedForwardPointCount} จุด` : ''}
          {(disclosure.forecastPointCount ?? 0) > 0 ? ` · forecast ${disclosure.forecastPointCount} จุด` : ''}
          {' · ไม่ส่งประวัติข้อความ'}
          {redactionCount > 0 ? ` · ปกปิดข้อมูลเพิ่ม ${redactionCount} รายการ` : ''}
        </p>
        {disclosure.coverage?.from && disclosure.coverage?.to && (
          <p className="mt-1 leading-4 text-emerald-700">
            ช่วงหลักฐาน {disclosure.coverage.from} ถึง {disclosure.coverage.to}
          </p>
        )}

        {details?.entities?.length > 0 && (
          <div className="mt-3 space-y-3">
            {details.entities.map((entity, entityIndex) => (
              <section key={`${entity.scope}-${entity.alias ?? entityIndex}`}>
                <h5 className="mb-1.5 flex flex-wrap items-center gap-1.5 font-bold text-slate-700">
                  {entityLabel(entity)}
                  {entity.sampleSize && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-medium text-slate-500 ring-1 ring-slate-200">
                      กลุ่มตัวอย่าง {entity.sampleSize} คน
                    </span>
                  )}
                </h5>
                <div className="space-y-2">
                  {entity.metrics.map((metric, metricIndex) => (
                    <ReferenceMetric key={`${metric.metric}-${metricIndex}`} metric={metric} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {details?.omittedFields?.length > 0 && (
          <div className="mt-3 rounded-lg border border-emerald-100 bg-white/80 p-2.5">
            <p className="font-bold text-slate-600">ข้อมูลที่ไม่ถูกส่ง</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {details.omittedFields.map(field => (
                <span key={field} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] text-slate-600">
                  {OMITTED_FIELD_LABELS[field] ?? field}
                </span>
              ))}
            </div>
          </div>
        )}

        {details?.constraints?.length > 0 && (
          <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/70 p-2.5">
            <p className="font-bold text-slate-600">เงื่อนไขกำกับการใช้ข้อมูล</p>
            <ul className="mt-1.5 space-y-1 text-[9px] leading-4 text-slate-600">
              {details.constraints.map(constraint => (
                <li key={constraint}>• {CONSTRAINT_LABELS[constraint] ?? constraint}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Sentinel Analyst กำลังวิเคราะห์"
      className="chat-message-enter flex min-w-0 max-w-full items-center gap-3 self-start rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
        <Bot size={17} />
      </span>
      <span className="flex gap-1">
        <span className="chat-typing-dot" />
        <span className="chat-typing-dot [animation-delay:160ms]" />
        <span className="chat-typing-dot [animation-delay:320ms]" />
      </span>
      <span className="text-xs font-medium text-slate-500">กำลังอ่านข้อมูลและวิเคราะห์…</span>
    </div>
  );
}

function AssistantChart({ chart }) {
  const data = useMemo(() => chart.points.map(point => ({
    label: point.label,
    ...Object.fromEntries(
      chart.series.map((series, index) => [series.id, point.values[index]]),
    ),
  })), [chart]);
  const common = (
    <>
      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 10, fill: '#64748b' }}
        interval="preserveStartEnd"
        minTickGap={16}
      />
      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={32} />
      <Tooltip
        contentStyle={{
          borderRadius: 12,
          borderColor: '#e2e8f0',
          fontSize: 12,
          boxShadow: '0 12px 30px rgba(15,23,42,.12)',
        }}
      />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </>
  );
  const margin = { top: 8, right: 8, left: -12, bottom: 0 };

  return (
    <figure className="mt-3 min-w-0 max-w-full overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/80 to-white p-3">
      <figcaption className="mb-1 flex min-w-0 items-center gap-2 break-words text-sm font-bold text-slate-800">
        <ChartNoAxesCombined size={16} className="text-blue-600" />
        {chart.title}
      </figcaption>
      {(chart.xLabel || chart.yLabel) && (
        <p className="mb-3 text-[10px] text-slate-500">
          {chart.xLabel || 'แกน X'} · {chart.yLabel || 'แกน Y'}
        </p>
      )}
      <div className="h-56 w-full min-w-0" aria-label={chart.title}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {chart.type === 'bar' ? (
            <BarChart data={data} margin={margin}>
              {common}
              {chart.series.map(series => (
                <Bar
                  key={series.id}
                  dataKey={series.id}
                  name={series.label}
                  fill={CHART_COLORS[series.color]}
                  radius={[5, 5, 0, 0]}
                />
              ))}
            </BarChart>
          ) : chart.type === 'area' ? (
            <AreaChart data={data} margin={margin}>
              {common}
              {chart.series.map(series => (
                <Area
                  key={series.id}
                  type="monotone"
                  dataKey={series.id}
                  name={series.label}
                  stroke={CHART_COLORS[series.color]}
                  fill={CHART_COLORS[series.color]}
                  fillOpacity={0.12}
                  strokeWidth={2.5}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={data} margin={margin}>
              {common}
              {chart.series.map(series => (
                <Line
                  key={series.id}
                  type="monotone"
                  dataKey={series.id}
                  name={series.label}
                  stroke={CHART_COLORS[series.color]}
                  strokeWidth={2.5}
                  dot={{ r: 2.5 }}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function AssistantTable({ table }) {
  return (
    <section className="mt-3 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <h5 className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
        {table.title}
      </h5>
      <div className="max-h-64 overflow-x-hidden overflow-y-auto">
        <table className="w-full table-fixed text-left text-[11px]">
          <thead className="sticky top-0 bg-slate-100 text-slate-600">
            <tr>
              {table.columns.map((column, index) => (
                <th key={`${column}-${index}`} className="break-words px-2 py-2 font-bold [overflow-wrap:anywhere]">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-slate-100">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="break-words px-2 py-2 align-top text-slate-700 [overflow-wrap:anywhere]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AssistantMessage({ message, disabled, onFollowUp }) {
  const { payload } = message;
  const disclosure = message.disclosureReceipt;
  const redactionCount = Math.max(
    disclosure?.redactionCount ?? 0,
    disclosure?.redactions?.length ?? 0,
  );

  return (
    <article className="chat-message-enter w-full min-w-0 self-start">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200">
          <Bot size={17} />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden break-words rounded-2xl rounded-bl-md border border-slate-200 bg-white p-3.5 text-sm text-slate-700 shadow-sm [overflow-wrap:anywhere]">
          <p className="whitespace-pre-wrap break-words leading-6 [overflow-wrap:anywhere]">{payload.answer}</p>

          {payload.highlights.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-l-2 border-blue-200 pl-3 text-xs leading-5">
              {payload.highlights.map((highlight, index) => (
                <li key={index}>{highlight}</li>
              ))}
            </ul>
          )}

          {payload.chart && <AssistantChart chart={payload.chart} />}
          {payload.table && <AssistantTable table={payload.table} />}

          {(payload.methodNote || payload.dataCoverage) && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
              {payload.dataCoverage && <p><b>ขอบเขตข้อมูล:</b> {payload.dataCoverage}</p>}
              {payload.methodNote && <p className="mt-1"><b>วิธีวิเคราะห์:</b> {payload.methodNote}</p>}
            </div>
          )}

          {payload.limitations?.length > 0 && (
            <p className="mt-2 text-[10px] leading-4 text-amber-700">
              ข้อจำกัด: {payload.limitations.map(item => LIMITATION_LABELS[item] ?? item).join(' · ')}
            </p>
          )}

          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 text-[10px] text-slate-400">
            {RESPONSE_STATUS[payload.status] && (
              <span className={`rounded-full px-2 py-1 font-bold ${RESPONSE_STATUS[payload.status].className}`}>
                {RESPONSE_STATUS[payload.status].label}
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-600">
              {CONFIDENCE_LABELS[payload.confidence]}
            </span>
            <span className="min-w-0 break-all">{message.model}</span>
            {message.totalTokens && <span className="break-words">· {message.totalTokens.toLocaleString('th-TH')} tokens</span>}
          </div>
          {disclosure && (
            <DisclosureDetails disclosure={disclosure} redactionCount={redactionCount} />
          )}
        </div>
      </div>

      {payload.followUps.length > 0 && (
        <div className="ml-10 mt-2 flex min-w-0 flex-wrap gap-1.5">
          {payload.followUps.map(followUp => (
            <button
              key={followUp}
              type="button"
              disabled={disabled}
              onClick={() => onFollowUp(followUp)}
              className="max-w-full break-words rounded-full border border-blue-200 bg-white px-3 py-1.5 text-left text-[11px] font-semibold text-blue-700 transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {followUp}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export default function SentinelChatbot({
  analytics,
  students,
  logs,
  dataStatus,
  datasetVersion,
  lastUpdatedAt,
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [apiState, setApiState] = useState('unverified');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_CHAT_MODEL);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const datasetVersionRef = useRef(datasetVersion);
  const availabilityRef = useRef(dataStatus === 'ready');
  const modelMenuRef = useRef(null);
  const modelButtonRef = useRef(null);
  const [privacy] = useState(() => createConversationPrivacy());
  const available = dataStatus === 'ready';
  const activeModel = CHAT_MODELS.find(model => model.id === selectedModel)
    ?? CHAT_MODELS[0];
  const connection = getChatConnectionPresentation({
    dataReady: available,
    pending,
    apiState,
  });

  useEffect(() => () => {
    abortRef.current?.abort();
    privacy.clear();
  }, [privacy]);

  useEffect(() => {
    const datasetChanged = datasetVersionRef.current !== datasetVersion;
    const lostReadiness = availabilityRef.current && !available;
    datasetVersionRef.current = datasetVersion;
    availabilityRef.current = available;
    if (!datasetChanged && !lostReadiness) return;

    abortRef.current?.abort();
    abortRef.current = null;
    privacy.clear();
    setMessages([]);
    setInput('');
    setError(null);
    setPending(false);
    setApiState('unverified');
  }, [available, datasetVersion, privacy]);

  useEffect(() => {
    if (!modelMenuOpen) return undefined;

    function closeOnOutsidePointer(event) {
      if (!modelMenuRef.current?.contains(event.target)) {
        setModelMenuOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setModelMenuOpen(false);
        modelButtonRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [modelMenuOpen]);

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, pending, error]);

  async function sendMessage(candidate) {
    const question = String(candidate ?? input).trim();
    if (!question || pending || !available) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
    };
    const prepared = privacy.prepareUtterance(question, students);
    if (prepared.ambiguousNames.length > 0) {
      setError(`พบชื่อซ้ำใน roster (${prepared.ambiguousNames.join(', ')}) กรุณาระบุรหัสประจำตัวเพื่อเลือกบุคคลให้ชัดเจน`);
      return;
    }
    const previousState = privacy.snapshot();
    const evidenceId = privacy.nextEvidenceId();
    const evidence = createEvidenceEnvelope({
      evidenceId,
      analytics,
      students,
      logs,
      datasetVersion,
      lastUpdatedAt,
      question,
      prepared,
      aliases: privacy.aliases,
      previousState,
    });
    const analysisRequest = createAnalysisRequest({
      question,
      evidence,
      prepared,
      previousState,
    });
    if (analysisRequest.referent.status === 'ambiguous') {
      setError('คำถามนี้อ้างถึงหลายคนหรือหลายห้อง กรุณาระบุชื่อ รหัส หรือนามแฝงที่ต้องการให้ชัดเจน');
      return;
    }
    const requestBody = {
      model: selectedModel,
      utterance: prepared.utterance,
      conversationState: {
        ...previousState,
        // Free-form history stays in this browser. Only enumerated semantic state crosses the boundary.
        recentTurns: [],
      },
      analysisRequest,
      evidence,
    };
    try {
      privacy.assertOutboundSafe(requestBody);
    } catch {
      setError('ระบบหยุดการส่งคำถามนี้ เพราะตรวจพบข้อมูลระบุตัวตนที่ยังไม่ได้ปกปิด');
      return;
    }
    const disclosureReceipt = createDisclosureReceipt({
      body: requestBody,
      evidence,
      redactions: prepared.redactions,
    });

    setMessages(current => [...current, userMessage]);
    setInput('');
    setError(null);
    setModelMenuOpen(false);
    setPending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await askSentinelAssistant({
        ...requestBody,
        signal: controller.signal,
      });
      privacy.rememberEvidence(evidence);
      privacy.commitTurn({
        utterance: prepared.utterance,
        answer: response.payload.answer,
        evidenceId,
        intent: evidence.intent,
        subjectAliases: evidence.subjects.map(subject => subject.alias),
        roomAliases: evidence.rooms.map(room => room.alias),
        metrics: [...new Set([
          ...evidence.metrics.map(metric => metric.metric),
          ...evidence.subjects.flatMap(subject => subject.metrics.map(metric => metric.metric)),
          ...evidence.rooms.flatMap(room => room.metrics.map(metric => metric.metric)),
        ])],
        dateRange: evidence.coverage.from && evidence.coverage.to
          ? { from: evidence.coverage.from, to: evidence.coverage.to }
          : null,
      });
      setMessages(current => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          payload: privacy.restoreAssistantPayload(response.payload),
          model: response.model,
          totalTokens: response.usage?.totalTokens ?? null,
          disclosureReceipt: {
            ...disclosureReceipt,
            ...response.disclosureReceipt,
          },
        },
      ]);
      setApiState('online');
    } catch (requestError) {
      if (requestError?.name !== 'AbortError') {
        setApiState(
          requestError?.code === 'chat-not-configured' ? 'not-configured' : 'error',
        );
        setError(requestError?.message || 'ไม่สามารถวิเคราะห์ข้อมูลได้ กรุณาลองใหม่');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setPending(false);
      }
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event) {
    if (
      event.key === 'Enter'
      && !event.shiftKey
      && !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function clearConversation() {
    if (pending) return;
    privacy.clear();
    setMessages([]);
    setError(null);
    setInput('');
    inputRef.current?.focus();
  }

  function selectModel(event) {
    setSelectedModel(event.target.value);
    setModelMenuOpen(false);
    requestAnimationFrame(() => modelButtonRef.current?.focus());
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="เปิด Sentinel Analyst"
          className="chat-launcher fixed bottom-5 right-4 z-50 flex items-center gap-3 rounded-2xl bg-slate-950 p-2.5 pr-4 text-white shadow-2xl shadow-slate-900/30 transition hover:-translate-y-1 hover:bg-blue-950 focus:outline-none focus:ring-4 focus:ring-blue-300 sm:bottom-6 sm:right-6"
        >
          <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
            <Sparkles size={21} />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
          </span>
          <span className="text-left">
            <span className="block text-xs font-black">Sentinel Analyst</span>
            <span className="block text-[10px] text-slate-300">{connection.launcher}</span>
          </span>
        </button>
      )}

      {open && (
        <aside
          aria-label="Sentinel Analyst"
          className="chat-panel fixed inset-2 z-50 flex min-w-0 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-50 shadow-[0_28px_90px_rgba(15,23,42,.28)] sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(780px,calc(100dvh-2.5rem))] sm:w-[min(600px,calc(100vw-2.5rem))]"
        >
          <header className="relative overflow-hidden bg-slate-950 px-4 pb-4 pt-4 text-white">
            <div className="chat-header-glow absolute -right-16 -top-20 h-48 w-48 rounded-full bg-blue-500/30 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-900/40">
                <Bot size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-black">
                  Sentinel Analyst
                  <span
                    aria-live="polite"
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide ${connection.badgeClass}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${connection.dotClass}`} />
                    {connection.label}
                  </span>
                </h3>
                <p className="mt-0.5 truncate text-[10px] text-slate-300">
                  วิเคราะห์จากข้อมูลที่ยืนยันแล้ว · OpenRouter ZDR
                </p>
              </div>
              <button
                type="button"
                onClick={clearConversation}
                disabled={pending || messages.length === 0}
                aria-label="ล้างบทสนทนา"
                title="ล้างบทสนทนา"
                className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <Trash2 size={17} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setModelMenuOpen(false);
                  setOpen(false);
                }}
                aria-label="ปิด Sentinel Analyst"
                className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X size={19} />
              </button>
            </div>
          </header>

          <div
            ref={scrollRef}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain p-4 [scrollbar-color:#cbd5e1_transparent]"
          >
            <section className="chat-message-enter w-full min-w-0 rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Sparkles size={17} />
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-black text-slate-800">พร้อมช่วยอ่านข้อมูลให้ละเอียดขึ้น</h4>
                  <p className="mt-1 break-words text-xs leading-5 text-slate-600">
                    ถามภาพรวม รายห้อง รายบุคคล เปรียบเทียบช่วงเวลา ขอรายชื่อ
                    หรือให้แสดงคำตอบเป็นกราฟและตารางได้
                  </p>
                </div>
              </div>
              {messages.length === 0 && (
                <div className="mt-3 grid gap-2">
                  {QUICK_QUESTIONS.map(question => (
                    <button
                      key={question}
                      type="button"
                      disabled={!available || pending}
                      onClick={() => void sendMessage(question)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[11px] font-semibold leading-4 text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {messages.map(message => message.role === 'user' ? (
              <div
                key={message.id}
                className="chat-message-enter min-w-0 max-w-[84%] self-end break-words rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-sm leading-6 text-white shadow-md shadow-blue-200 [overflow-wrap:anywhere]"
              >
                {message.content}
              </div>
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                disabled={pending}
                onFollowUp={sendMessage}
              />
            ))}

            {pending && <TypingIndicator />}

            {error && (
              <div role="alert" className="chat-message-enter rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
                <b>ยังตอบคำถามนี้ไม่ได้</b>
                <p className="mt-1">{error}</p>
              </div>
            )}
          </div>

          <footer className="min-w-0 overflow-visible border-t border-slate-200 bg-white p-3">
            {!available && (
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                <ShieldCheck size={15} />
                แชตจะเปิดใช้งานเมื่อข้อมูลทั้ง 3 stream ผ่านการยืนยันครบถ้วน
              </div>
            )}
            <div ref={modelMenuRef} className="relative mb-2">
              <button
                ref={modelButtonRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={modelMenuOpen}
                aria-controls="sentinel-model-menu"
                disabled={pending}
                onClick={() => setModelMenuOpen(current => !current)}
                className="group flex w-full min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-2.5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md hover:shadow-blue-100/70 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <img
                  src={MODEL_LOGOS[activeModel.logo]}
                  alt=""
                  className="h-10 w-10 flex-shrink-0 rounded-xl object-cover shadow-md ring-1 ring-slate-900/5"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">
                    <Cpu size={11} className="text-blue-500" />
                    โมเดลที่ใช้ตอบ
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate text-xs font-black text-slate-800">
                      {activeModel.label}
                    </span>
                    <span className="truncate text-[10px] font-medium text-slate-400">
                      โดย {activeModel.provider}
                    </span>
                  </span>
                </span>
                <span className="flex flex-shrink-0 items-center gap-2">
                  <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-emerald-700 min-[390px]:inline-flex">
                    OpenRouter
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 transition group-hover:text-blue-600">
                    <ChevronDown
                      size={15}
                      className={`transition-transform duration-200 ${modelMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </span>
                </span>
              </button>

              {modelMenuOpen && (
                <div
                  id="sentinel-model-menu"
                  role="dialog"
                  aria-label="เลือกโมเดล AI"
                  className="chat-model-menu absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,.24)]"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-950 to-blue-950 px-3.5 py-3 text-white">
                    <div>
                      <p className="text-xs font-black">เลือกโมเดล AI</p>
                      <p className="mt-0.5 text-[9px] text-slate-300">
                        ใช้กับข้อความถัดไปผ่าน OpenRouter ZDR
                      </p>
                    </div>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold text-blue-100 ring-1 ring-white/15">
                      6 โมเดล
                    </span>
                  </div>
                  <fieldset className="grid max-h-[46dvh] grid-cols-1 gap-2 overflow-y-auto p-2 [scrollbar-color:#cbd5e1_transparent] sm:max-h-80 sm:grid-cols-2">
                    <legend className="sr-only">เลือกโมเดลสำหรับการสนทนา</legend>
                    {CHAT_MODELS.map(model => {
                      const selected = model.id === selectedModel;
                      return (
                        <label
                          key={model.id}
                          className={`group/model relative flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-md focus-within:ring-2 focus-within:ring-blue-400 ${
                            selected
                              ? model.selectedTone
                              : 'border-slate-200 bg-white shadow-slate-100'
                          }`}
                        >
                          <input
                            type="radio"
                            name="sentinel-chat-model"
                            value={model.id}
                            checked={selected}
                            onChange={selectModel}
                            className="sr-only"
                          />
                          <img
                            src={MODEL_LOGOS[model.logo]}
                            alt=""
                            loading="lazy"
                            className="h-9 w-9 flex-shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-slate-900/5"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-black text-slate-800">
                              {model.label}
                            </span>
                            <span className="block truncate text-[9px] font-medium text-slate-500">
                              {model.provider}
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-[8px] text-slate-400">
                              {model.id}
                            </span>
                          </span>
                          <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition ${
                            selected
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'border border-slate-200 bg-white text-transparent group-hover/model:text-slate-300'
                          }`}>
                            <Check size={12} strokeWidth={3} />
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="flex min-w-0 items-end gap-2">
              <label htmlFor="sentinel-chat-input" className="sr-only">พิมพ์คำถามเกี่ยวกับข้อมูล</label>
              <textarea
                ref={inputRef}
                id="sentinel-chat-input"
                rows={1}
                maxLength={3_000}
                value={input}
                disabled={pending || !available}
                onChange={event => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={pending ? 'รอคำตอบก่อนส่งข้อความถัดไป…' : 'ถามเกี่ยวกับข้อมูลในแดชบอร์ด…'}
                className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={pending || !available || !input.trim()}
                aria-label="ส่งข้อความ"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-slate-300 disabled:shadow-none"
              >
                <Send size={18} />
              </button>
            </form>
            <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2 px-1 text-[9px] text-slate-400">
              <span className="flex items-center gap-1">
                <LockKeyhole size={10} />
                เก็บบทสนทนาเฉพาะในหน่วยความจำ · ใช้นามแฝง · อย่าวางบันทึกสุขภาพ
              </span>
              <span>Enter ส่ง · Shift+Enter ขึ้นบรรทัด</span>
            </div>
          </footer>
        </aside>
      )}
    </>
  );
}
