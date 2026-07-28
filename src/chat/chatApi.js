import { getToken } from 'firebase/app-check';

import { appCheck, auth } from '../config/firebase.js';

const ERROR_MESSAGES = Object.freeze({
  'chat-not-configured': 'ยังไม่ได้ตั้งค่า OpenRouter API สำหรับระบบนี้',
  'chat-config-invalid': 'การตั้งค่า OpenRouter model ไม่ถูกต้อง',
  'unsupported-model': 'ไม่สามารถใช้โมเดลที่เลือกได้ กรุณาเลือกโมเดลอื่นแล้วลองใหม่',
  'chat-invalid-answer': 'โมเดลส่งคำตอบไม่สมบูรณ์ กรุณาลองถามอีกครั้ง',
  'chat-timeout': 'การวิเคราะห์ใช้เวลานานเกินไป กรุณาลองถามให้แคบลง',
  'chat-busy': 'ระบบวิเคราะห์กำลังมีผู้ใช้งานมาก กรุณารอสักครู่แล้วลองใหม่',
  'chat-credit-exhausted': 'เครดิตของบริการวิเคราะห์หมดแล้ว กรุณาเติมเครดิตก่อนใช้งานต่อ',
  'chat-unavailable': 'ไม่สามารถรับคำตอบจากระบบวิเคราะห์ได้ในขณะนี้',
  'rate-limited': 'ส่งคำถามถี่เกินไป กรุณารอสักครู่ก่อนถามอีกครั้ง',
  'provider-rate-limited': 'ส่งคำถามที่ต้องใช้โมเดลถี่เกินไป กรุณารอสักครู่ โดยคำถามที่ตอบจากข้อมูลในระบบยังใช้งานได้',
  'invalid-auth': 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  'missing-auth': 'ไม่พบเซสชันผู้ใช้ กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'บัญชีนี้ไม่มีสิทธิ์ใช้งานผู้ช่วยวิเคราะห์',
  'invalid-app-check': 'ไม่สามารถยืนยันแอปได้ กรุณารีเฟรชหน้าแล้วลองใหม่',
  'missing-app-check': 'ไม่สามารถยืนยันแอปได้ กรุณารีเฟรชหน้าแล้วลองใหม่',
  'privacy-sensitive-data': 'ระบบหยุดคำขอนี้เพราะพบข้อมูลระบุตัวตนที่ยังไม่ได้ปกปิด',
  'privacy-budget-exceeded': 'คำถามนี้ต้องใช้ข้อมูลมากกว่าเพดานความเป็นส่วนตัว กรุณาถามให้แคบลง',
  'privacy-dataset-mismatch': 'ข้อมูลมีเวอร์ชันใหม่ กรุณารอให้แดชบอร์ดซิงก์แล้วลองอีกครั้ง',
  'privacy-roster-unavailable': 'ยังไม่สามารถตรวจสอบการปกปิดข้อมูลได้ กรุณาลองใหม่',
});

function publicError(code) {
  const error = new Error(
    ERROR_MESSAGES[code] || 'เกิดข้อผิดพลาดในการวิเคราะห์ข้อมูล กรุณาลองใหม่',
  );
  error.code = code;
  return error;
}

export async function askSentinelAssistant({
  utterance,
  conversationState,
  analysisRequest,
  evidence,
  model,
  signal,
}) {
  const user = auth.currentUser;
  if (!user) throw publicError('missing-auth');

  const [idToken, appCheckResult] = await Promise.all([
    user.getIdToken(),
    appCheck ? getToken(appCheck, false) : Promise.resolve(null),
  ]);
  const headers = {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  };
  if (appCheckResult?.token) headers['X-Firebase-AppCheck'] = appCheckResult.token;

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, utterance, conversationState, analysisRequest, evidence }),
    signal,
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw publicError(body?.error?.code || 'chat-unavailable');
  }
  if (
    typeof body?.payload?.answer !== 'string'
    || !['high', 'medium', 'low'].includes(body?.payload?.confidence)
    || !['answered', 'partial', 'insufficient'].includes(body?.payload?.status)
    || !Array.isArray(body?.payload?.limitations)
  ) {
    throw publicError('chat-unavailable');
  }

  return body;
}
