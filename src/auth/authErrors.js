const AUTH_ERROR_CODE = /^auth\/[a-z0-9_-]{1,80}$/;

export function getPublicAuthErrorCode(error) {
  return AUTH_ERROR_CODE.test(error?.code) ? error.code : 'auth/unknown';
}

export function getPublicAuthMessage(error) {
  if (getPublicAuthErrorCode(error) === 'auth/popup-closed-by-user') {
    return 'ยกเลิกการเข้าสู่ระบบแล้ว';
  }
  if (getPublicAuthErrorCode(error) === 'auth/forbidden') {
    return 'บัญชีนี้ยังไม่ได้รับสิทธิ์ clinician หรือ admin';
  }
  if (getPublicAuthErrorCode(error) === 'auth/gis-unavailable') {
    return 'ไม่สามารถโหลด Google Sign-In ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่';
  }
  return 'ไม่สามารถตรวจสอบสิทธิ์ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ';
}
