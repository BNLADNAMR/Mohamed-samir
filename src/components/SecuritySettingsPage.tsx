import React, { useState } from 'react';
import {
  Shield,
  Save,
  Check,
  X,
  Lock,
  Globe,
  AlertTriangle,
  UserX,
} from 'lucide-react';
import {
  SecurityPolicySettings,
  UserProfile,
  UserRole,
} from '../types';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_SHORT_LABELS_AR,
} from '../utils/rbac';
import { saveSecurityPolicySettings } from '../services/firestoreService';

interface SecuritySettingsPageProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  users: UserProfile[];
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const SecuritySettingsPage: React.FC<SecuritySettingsPageProps> = ({
  currentUser,
  securityPolicy,
  users,
  onNotify,
}) => {
  const [allowSupLeaveRec, setAllowSupLeaveRec] = useState(
    securityPolicy.allowSupervisorLeaveRecommendation
  );
  const [allowViewerExport, setAllowViewerExport] = useState(
    securityPolicy.allowViewerExport
  );
  const [allowOpsIntegrationSync, setAllowOpsIntegrationSync] = useState(
    securityPolicy.allowOpsIntegrationSync
  );
  const [enforceAdminMfaNotice, setEnforceAdminMfaNotice] = useState(
    securityPolicy.enforceAdminMfaNotice
  );
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(
    securityPolicy.sessionTimeoutMinutes || 60
  );
  const [externalSyncEndpoint, setExternalSyncEndpoint] = useState(
    securityPolicy.externalSyncEndpoint || ''
  );
  const [isSaving, setIsSaving] = useState(false);

  const disabledUsers = users.filter((u) => u.status === 'disabled');
  const rolesOrder: UserRole[] = [
    'super_admin',
    'operations_manager',
    'supervisor',
    'delivery_rep',
    'viewer',
  ];

  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await saveSecurityPolicySettings({
        actor: currentUser,
        settings: {
          ...securityPolicy,
          allowSupervisorLeaveRecommendation: allowSupLeaveRec,
          allowViewerExport,
          allowOpsIntegrationSync,
          enforceAdminMfaNotice,
          sessionTimeoutMinutes,
          externalSyncEndpoint,
        },
      });
      onNotify('تم حفظ سياسات الأمان وإعدادات الربط بنجاح وتوثيقها في السجل الأمني.');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر حفظ إعدادات الأمان.',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-[1900px] w-full mx-auto space-y-5 text-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold mb-1">
            <Shield className="w-4 h-4" />
            مركز حوكمة الأمان والصلاحيات (Super Admin Only)
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
            إعدادات الأمان وسياسات النظام والربط الخارجي
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
            مراجعة مصفوفة الصلاحيات، التحكم في السياسات الديناميكية، مراقبة الحسابات المعطلة، وضبط نقطة المزامنة الآمنة.
          </p>
        </div>
      </div>

      {/* السياسات الأمنية وإعدادات الربط */}
      <form
        onSubmit={handleSavePolicies}
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            سياسات الصلاحيات والجلسات
          </h2>

          <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
            <input
              type="checkbox"
              checked={allowSupLeaveRec}
              onChange={(e) => setAllowSupLeaveRec(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-bold">تمكين المشرفين من إضافة توصية على طلبات الإجازات</div>
              <p className="text-slate-500 mt-0.5">
                يسمح للمشرف بمراجعة طلبات مندوبي فريقه وإضافة توصية قبل القرار النهائي لمدير التشغيل.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
            <input
              type="checkbox"
              checked={allowViewerExport}
              onChange={(e) => setAllowViewerExport(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-bold">السماح لدور المراقب (Viewer) بتصدير تقارير CSV</div>
              <p className="text-slate-500 mt-0.5">
                يظل حساب المراقب للقراءة فقط بالكامل دون أي صلاحية تعديل أو حذف.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
            <input
              type="checkbox"
              checked={allowOpsIntegrationSync}
              onChange={(e) => setAllowOpsIntegrationSync(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-bold">السماح لمدير التشغيل بتشغيل مزامنة الشفتات الخارجية</div>
              <p className="text-slate-500 mt-0.5">
                يتيح لمدير التشغيل استدعاء مزامنة البيانات مع بقاء إعدادات نقطة الربط مقصورة على مدير النظام.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
            <input
              type="checkbox"
              checked={enforceAdminMfaNotice}
              onChange={(e) => setEnforceAdminMfaNotice(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-bold">إظهار تذكير التحقق بخطوتين (2FA / MFA) للحسابات الإدارية</div>
              <p className="text-slate-500 mt-0.5">
                يعزز حماية حسابات مديري النظام ومديري التشغيل ضد اختراق الجلسات.
              </p>
            </div>
          </label>

          <div>
            <label className="font-bold block mb-1">
              مهلة إنهاء الجلسة التلقائي عند عدم النشاط (بالدقائق)
            </label>
            <input
              type="number"
              min={5}
              max={1440}
              value={sessionTimeoutMinutes}
              onChange={(e) => setSessionTimeoutMinutes(Number(e.target.value) || 60)}
              className="w-40 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 font-mono"
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              أمان الربط مع تطبيق / موقع الشركة الخارجي
            </h2>

            <div>
              <label className="font-bold block mb-1">
                رابط نقطة بيانات الشفتات الخارجية (HTTPS Endpoint — غير سري)
              </label>
              <input
                type="url"
                dir="ltr"
                value={externalSyncEndpoint}
                onChange={(e) => setExternalSyncEndpoint(e.target.value)}
                placeholder="https://api.company.com/v1/shifts"
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 font-mono text-left"
              />
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                ملاحظة أمنية: لا يتم تخزين أي مفاتيح API أو Tokens سرية في المتصفح أو Firestore. يتم حقن التوكن السري حصرياً في الخادم عبر المتغير البيئي{' '}
                <code className="font-mono">EXTERNAL_SHIFTS_API_TOKEN</code>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500 block">حالة آخر مزامنة</span>
                <strong className="text-slate-900 dark:text-white">
                  {securityPolicy.lastExternalSyncStatus || 'جاهز'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">وقت آخر مزامنة</span>
                <strong className="font-mono">
                  {securityPolicy.lastExternalSyncTime || '—'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">السجلات المستوردة</span>
                <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                  {securityPolicy.lastExternalSyncImported ?? 0}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">السجلات المرفوضة/الفاشلة</span>
                <strong className="font-mono text-rose-700 dark:text-rose-400">
                  {securityPolicy.lastExternalSyncFailed ?? 0}
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                إعدادات مستحسن مراجعتها في Firebase Console للإنتاج:
              </div>
              <ul className="list-disc pr-4 space-y-1 text-[11px] leading-relaxed">
                <li>إضافة نطاق GitHub Pages الخاص بك ضمن <strong>Authentication → Settings → Authorized domains</strong>.</li>
                <li>تفعيل مزود <strong>Email/Password</strong> إذا رغبت بدخول المندوبين بكلمة مرور بالإضافة إلى Google.</li>
                <li>تفعيل <strong>Multi-Factor Authentication (SMS / TOTP)</strong> لحسابات الإدارة العليا.</li>
              </ul>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'جارٍ حفظ السياسات...' : 'حفظ إعدادات الأمان والربط'}
            </button>
          </div>
        </div>
      </form>

      {/* مراجعة الحسابات المعطلة */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
          <UserX className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          مراجعة الحسابات المعطلة والموقوفة أمنياً ({disabledUsers.length})
        </h2>
        {disabledUsers.length === 0 ? (
          <p className="text-slate-500">لا توجد حسابات معطلة حالياً.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {disabledUsers.map((u) => (
              <div
                key={u.uid}
                className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200"
              >
                <span className="font-bold">{u.name}</span> —{' '}
                <span className="font-mono">{u.email}</span> (
                {ROLE_SHORT_LABELS_AR[u.role]})
              </div>
            ))}
          </div>
        )}
      </div>

      {/* مصفوفة الصلاحيات الكاملة (Role Permissions Matrix) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 overflow-x-auto">
        <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
          مصفوفة الصلاحيات القياسية للأدوار الخمسة (34 صلاحية دقيقة)
        </h2>
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-b border-slate-200 dark:border-slate-700">
              <th className="p-2.5">المجموعة</th>
              <th className="p-2.5">الصلاحية</th>
              <th className="p-2.5">المفتاح البرمجي</th>
              {rolesOrder.map((r) => (
                <th key={r} className="p-2.5 text-center">
                  {ROLE_SHORT_LABELS_AR[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {ALL_PERMISSIONS.map((perm) => (
              <tr key={perm.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="p-2 text-slate-500">{perm.group}</td>
                <td className="p-2 font-bold">{perm.label}</td>
                <td className="p-2 font-mono text-[11px] text-slate-500">{perm.key}</td>
                {rolesOrder.map((role) => {
                  const granted =
                    DEFAULT_ROLE_PERMISSIONS[role]?.includes(perm.key) ?? false;
                  return (
                    <td key={role} className="p-2 text-center">
                      {granted ? (
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 mx-auto" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
};
