import React, { useEffect, useRef } from 'react';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { AppRoutePage, UserProfile } from '../types';
import { ROLE_SHORT_LABELS_AR } from '../utils/rbac';
import { recordAuditLog } from '../services/firestoreService';

interface AccessDeniedViewProps {
  user: UserProfile;
  attemptedRoute: AppRoutePage;
  onReturnHome: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  user,
  attemptedRoute,
  onReturnHome,
}) => {
  const loggedRef = useRef<string>('');

  useEffect(() => {
    const key = `${user.uid}_${attemptedRoute}`;
    if (loggedRef.current === key) return;
    loggedRef.current = key;

    recordAuditLog({
      actor: user,
      category: 'security',
      action: 'محاولة وصول غير مصرح بها لصفحة محمية',
      targetType: 'route_guard',
      targetId: attemptedRoute,
      reason: `دور المستخدم (${user.role}) لا يملك صلاحية فتح مسار #${attemptedRoute}`,
      result: 'denied',
    });
  }, [user, attemptedRoute]);

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/80 rounded-2xl p-8 text-center shadow-sm space-y-4">
        <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
          غير مصرح لك بالوصول إلى هذه الصفحة (403)
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          حسابك الحالي يعمل بصلاحية{' '}
          <strong className="text-slate-900 dark:text-slate-200">
            {ROLE_SHORT_LABELS_AR[user.role]}
          </strong>
          ، ولا يمتلك الإذن الأمني اللازم لفتح القسم المطلوب (
          <span className="font-mono">{attemptedRoute}</span>). تم تسجيل هذه المحاولة في سجل المراجعة الأمني.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onReturnHome}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            العودة إلى صفحتك الرئيسية المصرح بها
          </button>
        </div>
      </div>
    </main>
  );
};
