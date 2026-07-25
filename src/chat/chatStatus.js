const PRESENTATIONS = Object.freeze({
  waiting: Object.freeze({
    label: 'รอข้อมูลที่ยืนยันแล้ว',
    launcher: 'กำลังรอข้อมูลที่ยืนยันแล้ว',
    badgeClass: 'bg-amber-400/15 text-amber-300',
    dotClass: 'bg-amber-300',
  }),
  connecting: Object.freeze({
    label: 'กำลังเชื่อมต่อ Fusion',
    launcher: 'กำลังเชื่อมต่อและวิเคราะห์ข้อมูล',
    badgeClass: 'bg-blue-400/15 text-blue-300',
    dotClass: 'bg-blue-300 animate-pulse',
  }),
  online: Object.freeze({
    label: 'Fusion พร้อมใช้งาน',
    launcher: 'ถามข้อมูล · สร้างกราฟ · คาดการณ์',
    badgeClass: 'bg-emerald-400/15 text-emerald-300',
    dotClass: 'bg-emerald-300',
  }),
  unverified: Object.freeze({
    label: 'ยังไม่ยืนยัน API',
    launcher: 'ยังไม่ยืนยัน API · ส่งคำถามเพื่อทดสอบ',
    badgeClass: 'bg-slate-400/15 text-slate-300',
    dotClass: 'bg-slate-300',
  }),
  notConfigured: Object.freeze({
    label: 'ยังไม่ได้ตั้งค่า API',
    launcher: 'ยังไม่ได้ตั้งค่า OpenRouter API',
    badgeClass: 'bg-rose-400/15 text-rose-300',
    dotClass: 'bg-rose-300',
  }),
  unavailable: Object.freeze({
    label: 'เชื่อมต่อ Fusion ไม่ได้',
    launcher: 'เชื่อมต่อ Fusion ไม่ได้ · แตะเพื่อลองอีกครั้ง',
    badgeClass: 'bg-rose-400/15 text-rose-300',
    dotClass: 'bg-rose-300',
  }),
});

export function getChatConnectionPresentation({
  dataReady,
  pending,
  apiState,
}) {
  if (!dataReady) return PRESENTATIONS.waiting;
  if (pending) return PRESENTATIONS.connecting;
  if (apiState === 'online') return PRESENTATIONS.online;
  if (apiState === 'not-configured') return PRESENTATIONS.notConfigured;
  if (apiState === 'error') return PRESENTATIONS.unavailable;
  return PRESENTATIONS.unverified;
}
