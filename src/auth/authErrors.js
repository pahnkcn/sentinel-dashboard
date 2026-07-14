const AUTH_ERROR_CODE = /^auth\/[a-z0-9-]{1,80}$/;

export function getPublicAuthErrorCode(error) {
  return AUTH_ERROR_CODE.test(error?.code) ? error.code : 'auth/unknown';
}

export function getPublicAuthMessage(error) {
  if (getPublicAuthErrorCode(error) === 'auth/popup-closed-by-user') {
    return 'ยกเลิกการเข้าสู่ระบบแล้ว';
  }
  return 'ไม่สามารถตรวจสอบสิทธิ์ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ';
}
