import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { isBenignAbortError } from '../firebase';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class FirestoreErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    if (isBenignAbortError(error)) {
      return { hasError: false, errorMessage: '' };
    }
    let readable = 'حدث خطأ غير متوقع أثناء معالجة البيانات أو التحقق من الصلاحيات.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.operationType) {
        readable = `تم رفض العملية (${parsed.operationType}) على المسار (${parsed.path || 'غير محدد'}) بموجب قواعد أمان قاعدة البيانات.`;
      }
    } catch {
      if (error.message) {
        readable = error.message;
      }
    }
    return { hasError: true, errorMessage: readable };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl p-6 shadow-lg space-y-4 text-right">
            <div className="flex items-center gap-2.5 text-rose-700 dark:text-rose-400 font-extrabold text-base">
              <AlertOctagon className="w-5 h-5 shrink-0" />
              تنبيه حماية النظام
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              العودة للمتابعة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
