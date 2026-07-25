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
  LockKeyhole,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import { askSentinelAssistant } from './chatApi.js';
import { getChatConnectionPresentation } from './chatStatus.js';

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

          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 text-[10px] text-slate-400">
            <span className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-600">
              {CONFIDENCE_LABELS[payload.confidence]}
            </span>
            <span className="min-w-0 break-all">{message.model}</span>
            {message.totalTokens && <span className="break-words">· {message.totalTokens.toLocaleString('th-TH')} tokens</span>}
            <span
              className={`rounded-full px-2 py-1 font-bold ${
                message.externalRequestAttempted
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              AI model: {message.externalRequestAttempted ? 'ใช้' : 'ไม่ใช้'}
            </span>
            {message.externalRequestAttempted && (
              <span className="break-words">
                · {message.route === 'server-minimized' ? 'ส่ง' : 'พยายามส่ง'} trend ลดทอน {message.disclosureBytes.toLocaleString('th-TH')} ไบต์
              </span>
            )}
            {!message.externalRequestAttempted && (
              <span className="break-words">
                · ประมวลผลแบบ deterministic
              </span>
            )}
          </div>
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
  dataStatus,
  datasetVersion,
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [apiState, setApiState] = useState('unverified');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const available = dataStatus === 'ready';
  const connection = getChatConnectionPresentation({
    dataReady: available,
    pending,
    apiState,
  });

  useEffect(() => () => abortRef.current?.abort(), []);

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
    setMessages(current => [...current, userMessage]);
    setInput('');
    setError(null);
    setPending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await askSentinelAssistant({
        question,
        expectedDatasetVersion: datasetVersion,
        signal: controller.signal,
      });
      setMessages(current => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          payload: response.payload,
          model: response.model,
          route: typeof response.route === 'string' ? response.route : '',
          totalTokens: response.usage?.totalTokens ?? null,
          disclosureBytes: Number.isSafeInteger(response.privacy?.disclosureBytes)
            && response.privacy.disclosureBytes >= 0
            ? response.privacy.disclosureBytes
            : 0,
          externalRequestAttempted:
            response.privacy?.externalRequestAttempted === true,
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
      if (abortRef.current === controller) abortRef.current = null;
      setPending(false);
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
    setMessages([]);
    setError(null);
    setInput('');
    inputRef.current?.focus();
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
                <p
                  className="mt-0.5 truncate text-[10px] text-slate-300"
                  title="คำนวณในระบบเป็นหลัก เฉพาะแนวโน้มภาพรวมที่ลดทอนแล้วอาจส่งภายนอกแบบ ZDR"
                >
                  คำนวณในระบบเป็นหลัก · แนวโน้มภาพรวมที่ลดทอนแล้วอาจส่งภายนอกแบบ ZDR
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
                onClick={() => setOpen(false)}
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

          <footer className="min-w-0 overflow-hidden border-t border-slate-200 bg-white p-3">
            {!available && (
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                <ShieldCheck size={15} />
                แชตจะเปิดใช้งานเมื่อข้อมูลทั้ง 3 stream ผ่านการยืนยันครบถ้วน
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex min-w-0 items-end gap-2">
              <label htmlFor="sentinel-chat-input" className="sr-only">พิมพ์คำถามเกี่ยวกับข้อมูล</label>
              <textarea
                ref={inputRef}
                id="sentinel-chat-input"
                rows={1}
                maxLength={1_200}
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
                ไม่จัดเก็บประวัติแบบถาวร · ไม่ควรวางรายละเอียดส่วนบุคคลเพิ่ม
              </span>
              <span>Enter ส่ง · Shift+Enter ขึ้นบรรทัด</span>
            </div>
          </footer>
        </aside>
      )}
    </>
  );
}
