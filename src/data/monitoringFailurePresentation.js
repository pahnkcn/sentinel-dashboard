const FAILURE_GROUPS = Object.freeze([
  {
    codes: new Set(['permission-denied', 'unauthenticated']),
    title: 'ไม่มีสิทธิ์อ่านข้อมูลติดตาม',
    detail: 'เซิร์ฟเวอร์ปฏิเสธคำขอ โปรดตรวจสอบบัญชี บทบาท และ Firestore Rules',
    recovery: 'ออกจากระบบแล้วเข้าสู่ระบบใหม่หลังจากแก้ไขสิทธิ์',
  },
  {
    codes: new Set(['dataset-manifest-missing']),
    title: 'ยังไม่มีชุดข้อมูลที่เผยแพร่',
    detail: 'ไม่พบ manifest ที่ระบุชุดข้อมูลปัจจุบัน จึงยังยืนยันข้อมูลทั้งสามส่วนไม่ได้',
    recovery: 'เผยแพร่ monitoringManifests/current หลังจากเตรียมชุดข้อมูลครบถ้วน',
    emulatorRecovery: 'รัน npm run emulators:seed แล้วกดลองเชื่อมต่ออีกครั้ง',
  },
  {
    codes: new Set([
      'dataset-manifest-invalid',
      'dataset-version-invalid',
      'atomic-dataset-invalid',
      'invalid-dataset-payload',
      'published-dataset-mutated',
    ]),
    title: 'ชุดข้อมูลไม่ผ่านการตรวจสอบความครบถ้วน',
    detail: 'manifest หรือข้อมูลที่เผยแพร่ไม่ตรงตามรูปแบบที่ระบบกำหนด',
    recovery: 'ตรวจสอบเวอร์ชันและเผยแพร่ students, logs และ assessments ใหม่ให้ครบ',
  },
  {
    codes: new Set([
      'server-verification-timeout',
      'snapshot-from-cache',
      'snapshot-has-pending-writes',
    ]),
    title: 'ยังยืนยันข้อมูลล่าสุดจากเซิร์ฟเวอร์ไม่ได้',
    detail: 'ระบบได้รับข้อมูลจาก cache หรือรอการยืนยันจากเซิร์ฟเวอร์นานเกินกำหนด',
    recovery: 'ตรวจสอบเครือข่ายและบริการ Firestore แล้วกดลองเชื่อมต่ออีกครั้ง',
  },
  {
    codes: new Set([
      'aborted',
      'cancelled',
      'deadline-exceeded',
      'internal',
      'resource-exhausted',
      'unavailable',
    ]),
    title: 'บริการข้อมูลไม่พร้อมใช้งานชั่วคราว',
    detail: 'การเชื่อมต่อกับ Firestore ถูกขัดจังหวะหรือบริการตอบกลับไม่สำเร็จ',
    recovery: 'ตรวจสอบเครือข่ายและสถานะ Firestore แล้วกดลองเชื่อมต่ออีกครั้ง',
  },
]);

const FALLBACK_PRESENTATION = Object.freeze({
  title: 'การเชื่อมต่อข้อมูลล้มเหลว',
  detail: 'ระบบหยุดแสดงผลวิเคราะห์เพื่อป้องกันการใช้ข้อมูลเก่าหรือข้อมูลไม่ครบ',
  recovery: 'ตรวจสอบแหล่งข้อมูลและกดลองเชื่อมต่ออีกครั้ง',
});

function failureEntries(errors) {
  if (errors === null || typeof errors !== 'object') return [];

  return Object.entries(errors)
    .filter(([, error]) => error !== null && typeof error === 'object')
    .map(([stream, error]) => ({
      stream,
      code: typeof error.code === 'string' ? error.code : 'unknown',
    }));
}

export function getMonitoringFailurePresentation(errors, { useEmulators = false } = {}) {
  const entries = failureEntries(errors);
  const codes = [...new Set(entries.map(entry => entry.code))];
  const group = FAILURE_GROUPS.find(candidate => (
    codes.some(code => candidate.codes.has(code))
  ));
  const selected = group ?? FALLBACK_PRESENTATION;

  return {
    title: selected.title,
    detail: selected.detail,
    recovery: useEmulators && selected.emulatorRecovery
      ? selected.emulatorRecovery
      : selected.recovery,
    codes: codes.length > 0 ? codes : ['unknown'],
    affectedStreams: [...new Set(entries.map(entry => entry.stream))],
  };
}
