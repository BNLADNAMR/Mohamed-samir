import React, { useMemo, useState } from 'react';
import {
  User,
  Calendar,
  FilePlus2,
  ShieldCheck,
  KeyRound,
  LogOut,
  Save,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import {
  AttendanceRecord,
  Employee,
  EmployeeSummary,
  MonthDay,
  SecurityPolicySettings,
  Team,
  UserProfile,
  WorkflowRequest,
} from '../types';
import {
  ALL_PERMISSIONS,
  resolveEffectivePermissions,
  ROLE_LABELS_AR,
} from '../utils/rbac';
import { MONTH_NAMES, getDayTemporalState } from '../utils/shiftCalculations';
import { REQUEST_STATUS_LABELS, REQUEST_TYPE_LABELS } from './RequestsPage';

interface ProfileAndRepPortalPageProps {
  mode: 'my_portal' | 'profile';
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  employees: Employee[];
  teams: Team[];
  attendanceRecords: Record<string, AttendanceRecord>;
  summaries: Record<string, EmployeeSummary>;
  requests: WorkflowRequest[];
  monthDaysList: MonthDay[];
  currentMonth: number;
  currentYear: number;
  today: Date;
  onChangeMonth: (year: number, month: number) => void;
  onNavigateToRequests: () => void;
  onUpdateDisplayName: (newName: string) => Promise<void>;
  onSendPasswordReset: (email: string) => Promise<string>;
  onLogout: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const ProfileAndRepPortalPage: React.FC<ProfileAndRepPortalPageProps> = ({
  mode,
  currentUser,
  securityPolicy,
  employees,
  teams,
  attendanceRecords,
  summaries,
  requests,
  monthDaysList,
  currentMonth,
  currentYear,
  today,
  onChangeMonth,
  onNavigateToRequests,
  onUpdateDisplayName,
  onSendPasswordReset,
  onLogout,
  onNotify,
}) => {
  const [displayName, setDisplayName] = useState(currentUser.name);
  const [isSavingName, setIsSavingName] = useState(false);

  const myEmployee = useMemo(
    () =>
      employees.find(
        (e) => e.id === currentUser.employeeId || e.userId === currentUser.uid
      ) || null,
    [employees, currentUser]
  );

  const myTeam = useMemo(
    () =>
      teams.find(
        (t) => t.teamId === (myEmployee?.teamId || currentUser.teamId)
      ) || null,
    [teams, myEmployee, currentUser]
  );

  const mySummary = myEmployee ? summaries[myEmployee.id] : null;

  const myRequests = useMemo(
    () =>
      requests
        .filter(
          (r) =>
            r.submittedBy === currentUser.uid ||
            (myEmployee && r.employeeId === myEmployee.id)
        )
        .slice(0, 8),
    [requests, currentUser, myEmployee]
  );

  const effectivePerms = useMemo(
    () => resolveEffectivePermissions(currentUser, securityPolicy),
    [currentUser, securityPolicy]
  );

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingName(true);
    try {
      await onUpdateDisplayName(displayName);
      onNotify('تم تحديث اسم العرض الشخصي بنجاح.');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر تحديث الاسم.',
        'error'
      );
    } finally {
      setIsSavingName(false);
    }
  };

  const handlePasswordReset = async () => {
    try {
      const msg = await onSendPasswordReset(currentUser.email);
      onNotify(msg, 'info');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر إرسال رابط إعادة التعيين.',
        'warning'
      );
    }
  };

  if (mode === 'profile') {
    return (
      <main className="flex-1 p-4 sm:p-6 max-w-4xl w-full mx-auto space-y-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-extrabold text-base">
                {currentUser.name.slice(0, 1)}
              </div>
              <div>
                <h1 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {currentUser.name}
                </h1>
                <p className="font-mono text-slate-500" dir="ltr">
                  {currentUser.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePasswordReset}
                className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-bold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <KeyRound className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                إعادة تعيين كلمة المرور
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                تسجيل الخروج
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveName} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold block mb-1">اسم العرض الشخصي</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  minLength={2}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="flex-1 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                />
                <button
                  type="submit"
                  disabled={isSavingName}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  حفظ
                </button>
              </div>
            </div>

            <div>
              <label className="font-bold block mb-1">الدور الوظيفي المعتمد (غير قابل للتعديل الذاتي)</label>
              <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200">
                {ROLE_LABELS_AR[currentUser.role]}
              </div>
            </div>

            <div>
              <label className="font-bold block mb-1">نطاق الفريق المخصص</label>
              <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                {myTeam ? `${myTeam.teamName} (${myTeam.teamId})` : currentUser.teamId || 'نطاق عام حسب الصلاحية'}
              </div>
            </div>

            <div>
              <label className="font-bold block mb-1">سجل المندوب المرتبط</label>
              <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                {myEmployee
                  ? `${myEmployee.fullName} — كود: ${myEmployee.employeeCode}`
                  : 'غير مرتبط بسجل مندوب ميداني'}
              </div>
            </div>
          </form>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <h2 className="font-extrabold text-sm flex items-center gap-1.5 text-slate-900 dark:text-white">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              الصلاحيات الفعلية النشطة على حسابك ({effectivePerms.size} صلاحية)
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {ALL_PERMISSIONS.filter((p) => effectivePerms.has(p.key)).map((perm) => (
                <span
                  key={perm.key}
                  className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium"
                >
                  {perm.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // وضع بوابة المندوب الشخصية (my_portal)
  return (
    <main className="flex-1 p-4 sm:p-6 max-w-[1500px] w-full mx-auto space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold mb-1">
            <User className="w-4 h-4" />
            بوابة المندوب الشخصية (معزولة البيانات)
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
            مرحباً، {myEmployee?.fullName || currentUser.name}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {myEmployee
              ? `الرقم الوظيفي: ${myEmployee.employeeCode} · الفريق: ${
                  myTeam?.teamName || myEmployee.teamId || 'غير محدد'
                } · الحالة: ${myEmployee.status === 'active' ? 'نشط' : 'موقوف'}`
              : 'حساب مندوب مسجل — يرجى مراجعة مدير النظام في حال عدم ربط الرقم الوظيفي بعد.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* تبديل الشهر */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                if (currentMonth === 1) onChangeMonth(currentYear - 1, 12);
                else onChangeMonth(currentYear, currentMonth - 1);
              }}
              className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-extrabold text-xs">
              {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </span>
            <button
              type="button"
              onClick={() => {
                if (currentMonth === 12) onChangeMonth(currentYear + 1, 1);
                else onChangeMonth(currentYear, currentMonth + 1);
              }}
              className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onNavigateToRequests}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <FilePlus2 className="w-4 h-4" />
            تقديم طلب إجازة أو تصحيح حضور
          </button>
        </div>
      </div>

      {!myEmployee ? (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl p-6 text-xs text-amber-900 dark:text-amber-200 font-medium">
          لم يتم ربط حسابك بسجل مندوب ميداني بعد. يرجى التواصل مع مدير النظام لربط حسابك بكود المندوب الخاص بك لعرض جدول شفتاتك وسجل حضورك الشخصي.
        </div>
      ) : (
        <>
          {/* مؤشرات الأداء الشخصية */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">أيام العمل الفعلية</span>
              <div className="text-2xl font-extrabold font-mono mt-1 text-emerald-700 dark:text-emerald-400">
                {mySummary?.workedDays ?? 0}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">إجمالي ساعات الشهر</span>
              <div className="text-2xl font-extrabold font-mono mt-1 text-indigo-700 dark:text-indigo-400">
                {mySummary?.totalHours ?? 0} س
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">أيام الشفت المختارة</span>
              <div className="text-2xl font-extrabold font-mono mt-1 text-sky-700 dark:text-sky-400">
                {mySummary?.selectedDays ?? 0}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">أيام الإجازات والراحة</span>
              <div className="text-2xl font-extrabold font-mono mt-1 text-slate-700 dark:text-slate-200">
                {(mySummary?.leaveDays ?? 0) + (mySummary?.dayOffDays ?? 0)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">أيام الغياب</span>
              <div className="text-2xl font-extrabold font-mono mt-1 text-rose-700 dark:text-rose-400">
                {mySummary?.absentDays ?? 0}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">نسبة الأداء الشهري</span>
              <div className="text-2xl font-extrabold font-mono mt-1 text-emerald-700 dark:text-emerald-400">
                {mySummary?.performanceRate !== null &&
                mySummary?.performanceRate !== undefined
                  ? `${mySummary.performanceRate}%`
                  : '—'}
              </div>
            </div>
          </div>

          {/* جدول شفتات وحضور المندوب الشخصي للقراءة فقط */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              جدول شفتاتك وسجل حضورك الشهري ({MONTH_NAMES[currentMonth - 1]} {currentYear})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 text-xs">
              {monthDaysList.map((d) => {
                const rec = attendanceRecords[`${myEmployee.id}_${d.dateStr}`];
                const { isFutureDay, isPastDay } = getDayTemporalState(
                  currentYear,
                  currentMonth,
                  d.dayNumber,
                  today
                );

                let statusLabel = 'لم يحدد';
                let badgeClass =
                  'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300';

                if (rec?.attendance === 'worked') {
                  statusLabel = `حاضر (${Number(((rec.totalWorkedMinutes || 0) / 60).toFixed(1))} س)`;
                  badgeClass =
                    'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200';
                } else if (rec?.attendance === 'leave') {
                  statusLabel = 'إجازة معتمدة';
                  badgeClass =
                    'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200';
                } else if (rec?.attendance === 'day_off') {
                  statusLabel = 'يوم راحة';
                  badgeClass =
                    'bg-stone-100 dark:bg-slate-800 border-stone-300 dark:border-slate-700 text-stone-800 dark:text-stone-200';
                } else if (
                  rec?.attendance === 'absent' ||
                  (isPastDay && rec?.shiftSelection === 'selected')
                ) {
                  statusLabel = 'غياب مسجل';
                  badgeClass =
                    'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200';
                } else if (rec?.shiftSelection === 'selected') {
                  statusLabel = isFutureDay ? 'شفت مجدول' : 'بانتظار الاعتماد';
                  badgeClass =
                    'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200';
                }

                return (
                  <div
                    key={d.dateStr}
                    className={`p-3 rounded-xl border ${badgeClass} flex flex-col justify-between gap-1.5`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-extrabold text-sm">
                        {d.dayNumber}
                      </span>
                      <span className="text-[10px] opacity-80">{d.dayName}</span>
                    </div>
                    <div className="font-bold text-[11px]">{statusLabel}</div>
                    {rec?.attendance === 'worked' && (
                      <div className="text-[10px] font-mono opacity-80">
                        {rec.startTime} - {rec.endTime}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* آخر طلبات المندوب */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                متابعة حالة طلباتك الأخيرة ({myRequests.length})
              </h2>
              <button
                type="button"
                onClick={onNavigateToRequests}
                className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
              >
                عرض كل الطلبات أو إرسال طلب جديد
              </button>
            </div>

            {myRequests.length === 0 ? (
              <p className="text-slate-500">لم تقم بإرسال أي طلبات إجازة أو تصحيح حضور حتى الآن.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {myRequests.map((r) => (
                  <div
                    key={r.requestId}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-bold">{REQUEST_TYPE_LABELS[r.requestType]}</span>{' '}
                      <span className="font-mono text-slate-500">({r.requestDate})</span>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                        {r.description}
                      </p>
                    </div>
                    <div className="text-left">
                      <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 font-bold">
                        {REQUEST_STATUS_LABELS[r.status]}
                      </span>
                      {r.reviewComment && (
                        <div className="text-[10px] text-slate-500 mt-1">
                          رد الإدارة: {r.reviewComment}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
};
