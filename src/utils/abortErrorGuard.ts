/**
 * فحص دقيق وآمن لتحديد ما إذا كان الخطأ ناتجاً فقط عن إلغاء طلب متصفح عابر
 * (مثل "The user aborted a request." أو AbortError أثناء تحديث الإطار أو تبديل الجلسة)
 * مع ضمان عدم إخفاء أي أخطاء صلاحيات Firestore أو أخطاء برمجية حقيقية.
 */
export function isBenignAbortError(error: unknown): boolean {
  if (!error) return false;

  const extractFields = (
    input: unknown
  ): { name: string; code: string | number; message: string } => {
    if (typeof input === 'string') {
      return { name: '', code: '', message: input };
    }
    if (typeof input === 'object' && input !== null) {
      const rec = input as {
        name?: unknown;
        code?: unknown;
        message?: unknown;
        error?: unknown;
      };
      const name = typeof rec.name === 'string' ? rec.name : '';
      const code =
        typeof rec.code === 'string' || typeof rec.code === 'number'
          ? rec.code
          : '';
      const message =
        typeof rec.message === 'string'
          ? rec.message
          : typeof rec.error === 'string'
          ? rec.error
          : '';
      return { name, code, message };
    }
    return { name: '', code: '', message: String(input) };
  };

  const { name, code, message } = extractFields(error);
  const lowerName = name.toLowerCase();
  const lowerCode = String(code).toLowerCase();
  const lowerMessage = message.toLowerCase();

  // عدم إخفاء أي أخطاء صلاحيات أو حصص أو اتصال بقاعدة البيانات نهائياً
  if (
    lowerCode.includes('permission-denied') ||
    lowerCode.includes('resource-exhausted') ||
    lowerCode.includes('unauthenticated') ||
    lowerCode.includes('unauthorized-domain') ||
    lowerMessage.includes('missing or insufficient permissions') ||
    lowerMessage.includes('permission-denied') ||
    lowerMessage.includes('quota exceeded') ||
    lowerMessage.includes('the client is offline')
  ) {
    return false;
  }

  // 1. معيار DOMException القياسي في المتصفح (AbortError / code 20)
  if (lowerName === 'aborterror' || code === 20) {
    return true;
  }

  // 2. رموز الإلغاء العابرة في Firebase Auth / Firestore عند إغلاق قناة الاستماع أو تكرار النافذة
  if (
    lowerCode === 'cancelled' ||
    lowerCode === 'firestore/cancelled' ||
    lowerCode === 'auth/cancelled-popup-request'
  ) {
    return true;
  }

  // 3. رسائل إلغاء طلبات الشبكة القياسية في متصفحات Chromium و WebKit و Gecko
  if (
    lowerMessage.includes('the user aborted a request') ||
    lowerMessage.includes('signal is aborted') ||
    lowerMessage.includes('the operation was aborted') ||
    lowerMessage.includes('this operation was aborted') ||
    lowerMessage.includes('aborted without reason') ||
    lowerMessage.includes('request aborted') ||
    lowerMessage.includes('fetch is aborted')
  ) {
    return true;
  }

  return false;
}

declare global {
  interface Window {
    __shiftTrackerAbortGuardInstalled?: boolean;
  }
}

/**
 * تثبيت حارس عام مبكر لمنع ظهور أخطاء الإلغاء العابرة (AbortError) كأخطاء غير معالجة
 * أثناء إعادة تحميل إطار المعاينة أو إغلاق قنوات البث اللحظي.
 */
export function installGlobalAbortErrorGuard(): void {
  if (typeof window === 'undefined' || window.__shiftTrackerAbortGuardInstalled) {
    return;
  }
  window.__shiftTrackerAbortGuardInstalled = true;

  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      if (isBenignAbortError(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true }
  );

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      if (isBenignAbortError(event.error ?? event.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true }
  );
}
