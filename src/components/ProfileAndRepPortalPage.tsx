import React, { useEffect, useMemo, useState } from 'react';
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
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  MailCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  SlidersHorizontal,
  Activity,
  RotateCcw,
  Fingerprint,
  Layers,
} from 'lucide-react';
import {
  AccountSecurityUpdateInput,
  AttendanceRecord,
  AuditLogItem,
  Employee,
  EmployeeSummary,
  MonthDay,
  PersonalInfoUpdateInput,
  ProfileSectionId,
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
import {
  evaluatePasswordStrength,
  PROFILE_SECTIONS_ORDERED,
  resolveEffectiveSessionTimeoutMinutes,
} from '../utils/profileSecurity';
import { MONTH_NAMES, getDayTemporalState } from '../utils/shiftCalculations';
import { REQUEST_STATUS_LABELS, REQUEST_TYPE_LABELS } from './RequestsPage';

interface ProfileAndRepPortalPageProps {
  mode: 'my_portal' | 'profile';
  activeProfileSection?: ProfileSectionId;
  onSelectProfileSection?: (section: ProfileSectionId) => void;
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  linkedProviderIds: string[];
  isEmailVerified: boolean;
  lastIdentityVerifiedAt: number | null;
  accountAuditLogs: AuditLogItem[];
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
  onNavigateToProfile?: (section?: ProfileSectionId) => void;
  onNavigateToMyPortal?: () => void;
  onOpenSectionsDrawer?: () => void;
  onUpdatePersonalInfo: (input: PersonalInfoUpdateInput) => Promise<void>;
  onChangeOrSetPassword: (params: {
    currentPassword?: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<{ mode: 'updated' | 'linked'; message: string }>;
  onUpdateSecuritySettings: (
    settings: AccountSecurityUpdateInput,
    currentPasswordForReauth?: string
  ) => Promise<void>;
  onReauthenticateManually: (currentPassword?: string) => Promise<string>;
  onRefreshSessionToken: () => Promise<string>;
  onSendVerificationEmail: () => Promise<string>;
  onSendPasswordReset: (email: string) => Promise<string>;
  onLogout: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

function formatReadableDateTimeAr(isoStr?: string): string {
  if (!isoStr) return '—';
  const parsed = new Date(isoStr);
  if (Number.isNaN(parsed.getTime())) return isoStr;
  return parsed.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ProfileAndRepPortalPage: React.FC<ProfileAndRepPortalPageProps> = ({
  mode,
  activeProfileSection = 'all',
  onSelectProfileSection,
  currentUser,
  securityPolicy,
  linkedProviderIds,
  isEmailVerified,
  lastIdentityVerifiedAt,
  accountAuditLogs,
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
  onNavigateToProfile,
  onNavigateToMyPortal,
  onOpenSectionsDrawer,
  onUpdatePersonalInfo,
  onChangeOrSetPassword,
  onUpdateSecuritySettings,
  onReauthenticateManually,
  onRefreshSessionToken,
  onSendVerificationEmail,
  onSendPasswordReset,
  onLogout,
  onNotify,
}) => {
  // ---------------------------------------------------------------------------
  // القسم 1: حالة النموذج اليدوي للمعلومات الشخصية
  // ---------------------------------------------------------------------------
  const [personalForm, setPersonalForm] = useState<PersonalInfoUpdateInput>({
    name: currentUser.name || '',
    phone: currentUser.phone || '',
    jobTitle: currentUser.jobTitle || '',
    department: currentUser.department || '',
    bio: currentUser.bio || '',
  });
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [personalFeedback, setPersonalFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    setPersonalForm({
      name: currentUser.name || '',
      phone: currentUser.phone || '',
      jobTitle: currentUser.jobTitle || '',
      department: currentUser.department || '',
      bio: currentUser.bio || '',
    });
  }, [
    currentUser.name,
    currentUser.phone,
    currentUser.jobTitle,
    currentUser.department,
    currentUser.bio,
  ]);

  const isPersonalDirty =
    personalForm.name.trim() !== (currentUser.name || '').trim() ||
    personalForm.phone.trim() !== (currentUser.phone || '').trim() ||
    personalForm.jobTitle.trim() !== (currentUser.jobTitle || '').trim() ||
    personalForm.department.trim() !== (currentUser.department || '').trim() ||
    personalForm.bio.trim() !== (currentUser.bio || '').trim();

  // ---------------------------------------------------------------------------
  // القسم 2: حالة النموذج اليدوي لكلمة المرور وبيانات الدخول
  // ---------------------------------------------------------------------------
  const hasPasswordProvider = linkedProviderIds.includes('password');
  const hasGoogleProvider = linkedProviderIds.includes('google.com');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const passwordStrength = useMemo(
    () => evaluatePasswordStrength(newPassword),
    [newPassword]
  );

  // ---------------------------------------------------------------------------
  // القسم 3: حالة النموذج اليدوي لإجراءات أمان الحساب وحماية الجلسة
  // ---------------------------------------------------------------------------
  const savedTimeoutPref =
    currentUser.personalSessionTimeoutMinutes ??
    securityPolicy.sessionTimeoutMinutes;
  const savedRequireReauth =
    currentUser.requireReauthForSensitiveActions !== false;
  const savedSecurityAlerts = currentUser.securityAlertsEnabled !== false;

  const [securityForm, setSecurityForm] = useState<AccountSecurityUpdateInput>({
    personalSessionTimeoutMinutes: savedTimeoutPref,
    requireReauthForSensitiveActions: savedRequireReauth,
    securityAlertsEnabled: savedSecurityAlerts,
  });
  const [securityReauthPassword, setSecurityReauthPassword] = useState('');
  const [manualVerifyPassword, setManualVerifyPassword] = useState('');
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  const [isRunningSessionAction, setIsRunningSessionAction] = useState(false);
  const [securityFeedback, setSecurityFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    setSecurityForm({
      personalSessionTimeoutMinutes:
        currentUser.personalSessionTimeoutMinutes ??
        securityPolicy.sessionTimeoutMinutes,
      requireReauthForSensitiveActions:
        currentUser.requireReauthForSensitiveActions !== false,
      securityAlertsEnabled: currentUser.securityAlertsEnabled !== false,
    });
  }, [
    currentUser.personalSessionTimeoutMinutes,
    currentUser.requireReauthForSensitiveActions,
    currentUser.securityAlertsEnabled,
    securityPolicy.sessionTimeoutMinutes,
  ]);

  const isSecurityDirty =
    Number(securityForm.personalSessionTimeoutMinutes) !== Number(savedTimeoutPref) ||
    securityForm.requireReauthForSensitiveActions !== savedRequireReauth ||
    securityForm.securityAlertsEnabled !== savedSecurityAlerts;

  const isRecentlyVerified =
    lastIdentityVerifiedAt !== null &&
    Date.now() - lastIdentityVerifiedAt < 10 * 60 * 1000;

  const needsPasswordForSecurityLowering =
    hasPasswordProvider &&
    savedRequireReauth &&
    !isRecentlyVerified &&
    (!securityForm.requireReauthForSensitiveActions ||
      (savedSecurityAlerts && !securityForm.securityAlertsEnabled));

  const effectiveSessionTimeout = useMemo(
    () =>
      resolveEffectiveSessionTimeoutMinutes(
        {
          role: currentUser.role,
          personalSessionTimeoutMinutes:
            securityForm.personalSessionTimeoutMinutes,
        },
        securityPolicy
      ),
    [
      currentUser.role,
      securityForm.personalSessionTimeoutMinutes,
      securityPolicy,
    ]
  );

  // ---------------------------------------------------------------------------
  // البيانات المرتبطة والصلاحيات الفعلية (القسم 4 + بوابة المندوب)
  // ---------------------------------------------------------------------------
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

  const groupedGrantedPermissions = useMemo(() => {
    const groupsMap = new Map<string, { key: string; label: string }[]>();
    ALL_PERMISSIONS.forEach((perm) => {
      if (!effectivePerms.has(perm.key)) return;
      const list = groupsMap.get(perm.group) || [];
      list.push({ key: perm.key, label: perm.label });
      groupsMap.set(perm.group, list);
    });
    return Array.from(groupsMap.entries()).map(([group, items]) => ({
      group,
      items,
    }));
  }, [effectivePerms]);

  const sortedMySecurityLogs = useMemo(() => {
    return [...accountAuditLogs]
      .filter((item) => item.actorUserId === currentUser.uid)
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .slice(0, 10);
  }, [accountAuditLogs, currentUser.uid]);

  // ---------------------------------------------------------------------------
  // معالجات الحفظ اليدوي لكل قسم مستقل
  // ---------------------------------------------------------------------------
  const handleSavePersonalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPersonalFeedback(null);
    setIsSavingPersonal(true);
    try {
      await onUpdatePersonalInfo(personalForm);
      setPersonalFeedback({
        type: 'success',
        message: 'تم حفظ المعلومات الشخصية يدوياً وتوثيق التعديل بنجاح.',
      });
      if (currentUser.securityAlertsEnabled !== false) {
        onNotify('تم حفظ المعلومات الشخصية في ملفك الشخصي بنجاح.');
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'تعذر حفظ المعلومات الشخصية.';
      setPersonalFeedback({ type: 'error', message: msg });
      onNotify(msg, 'error');
    } finally {
      setIsSavingPersonal(false);
    }
  };

  const handleResetPersonalForm = () => {
    setPersonalFeedback(null);
    setPersonalForm({
      name: currentUser.name || '',
      phone: currentUser.phone || '',
      jobTitle: currentUser.jobTitle || '',
      department: currentUser.department || '',
      bio: currentUser.bio || '',
    });
  };

  const handleSavePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);
    setIsSavingPassword(true);
    try {
      const res = await onChangeOrSetPassword({
        currentPassword: hasPasswordProvider ? currentPassword : undefined,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordFeedback({ type: 'success', message: res.message });
      onNotify(res.message, 'success');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'تعذر تحديث كلمة المرور.';
      setPasswordFeedback({ type: 'error', message: msg });
      onNotify(msg, 'error');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handlePasswordResetEmail = async () => {
    setPasswordFeedback(null);
    setIsSendingReset(true);
    try {
      const msg = await onSendPasswordReset(currentUser.email);
      setPasswordFeedback({ type: 'info', message: msg });
      onNotify(msg, 'info');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'تعذر إرسال رابط استعادة كلمة المرور.';
      setPasswordFeedback({ type: 'error', message: msg });
      onNotify(msg, 'warning');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleSaveSecuritySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityFeedback(null);
    setIsSavingSecurity(true);
    try {
      await onUpdateSecuritySettings(
        securityForm,
        securityReauthPassword || undefined
      );
      setSecurityReauthPassword('');
      setSecurityFeedback({
        type: 'success',
        message: 'تم حفظ إجراءات أمان الحساب وتطبيقها على جلستك الحالية بنجاح.',
      });
      if (securityForm.securityAlertsEnabled) {
        onNotify('تم حفظ إجراءات أمان الحساب يدوياً.');
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'تعذر حفظ إجراءات أمان الحساب.';
      setSecurityFeedback({ type: 'error', message: msg });
      onNotify(msg, 'error');
    } finally {
      setIsSavingSecurity(false);
    }
  };

  const handleManualReauthAction = async () => {
    setSecurityFeedback(null);
    setIsRunningSessionAction(true);
    try {
      const msg = await onReauthenticateManually(
        manualVerifyPassword || undefined
      );
      setManualVerifyPassword('');
      setSecurityFeedback({ type: 'success', message: msg });
      onNotify(msg, 'success');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'تعذر إعادة التحقق من الهوية.';
      setSecurityFeedback({ type: 'error', message: msg });
      onNotify(msg, 'error');
    } finally {
      setIsRunningSessionAction(false);
    }
  };

  const handleRefreshTokenAction = async () => {
    setSecurityFeedback(null);
    setIsRunningSessionAction(true);
    try {
      const msg = await onRefreshSessionToken();
      setSecurityFeedback({ type: 'info', message: msg });
      onNotify(msg, 'info');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'تعذر تحديث رمز الجلسة.';
      setSecurityFeedback({ type: 'error', message: msg });
    } finally {
      setIsRunningSessionAction(false);
    }
  };

  const handleSendVerifyEmailAction = async () => {
    setSecurityFeedback(null);
    setIsRunningSessionAction(true);
    try {
      const msg = await onSendVerificationEmail();
      setSecurityFeedback({ type: 'info', message: msg });
      onNotify(msg, 'info');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'تعذر إرسال رابط التأكيد.';
      setSecurityFeedback({ type: 'error', message: msg });
    } finally {
      setIsRunningSessionAction(false);
    }
  };

  const changeSection = (nextSection: ProfileSectionId) => {
    if (onSelectProfileSection) {
      onSelectProfileSection(nextSection);
    }
  };

  const isSectionVisible = (sectionId: Exclude<ProfileSectionId, 'all'>) =>
    activeProfileSection === 'all' || activeProfileSection === sectionId;

  // ===========================================================================
  // العرض الأول: الملف الشخصي وإجراءات أمان الحساب المرتبة حسب كل إعداد
  // ===========================================================================
  if (mode === 'profile') {
    const sectionIcons: Record<Exclude<ProfileSectionId, 'all'>, React.ReactNode> = {
      personal_info: <User className="w-4 h-4 shrink-0" />,
      password_credentials: <KeyRound className="w-4 h-4 shrink-0" />,
      security_procedures: <SlidersHorizontal className="w-4 h-4 shrink-0" />,
      role_and_activity: <ShieldCheck className="w-4 h-4 shrink-0" />,
    };

    return (
      <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-5 text-xs">
        {/* رأس الملف الشخصي الموحد */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-slate-900 dark:bg-indigo-600 text-white flex items-center justify-center font-extrabold text-lg shrink-0">
                {(currentUser.name || 'م').trim().slice(0, 1)}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    {currentUser.name}
                  </h1>
                  <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-400">
                    {ROLE_LABELS_AR[currentUser.role]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-slate-500 dark:text-slate-400">
                  <span className="font-mono text-slate-700 dark:text-slate-300" dir="ltr">
                    {currentUser.email}
                  </span>
                  {currentUser.jobTitle && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{currentUser.jobTitle}</span>
                    </>
                  )}
                  {currentUser.phone && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums" dir="ltr">
                        {currentUser.phone}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>
                    آخر دخول:{' '}
                    <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatReadableDateTimeAr(currentUser.lastLoginAt)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {currentUser.role === 'delivery_rep' && onNavigateToMyPortal && (
                <button
                  type="button"
                  onClick={onNavigateToMyPortal}
                  className="px-3.5 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  بوابتي الشخصية للشفتات
                </button>
              )}
              <button
                type="button"
                onClick={() => changeSection('password_credentials')}
                className="px-3.5 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                تغيير كلمة المرور يدوياً
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </section>

        {/* شريط ملخص الحالة الأمنية الفورية + الانتقال السريع المبسط للأقسام الأربعة */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => changeSection('all')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  activeProfileSection === 'all'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>عرض الكل (1–4)</span>
              </button>

              {PROFILE_SECTIONS_ORDERED.map((sec) => {
                const isActive = activeProfileSection === sec.id;
                const hasUnsaved =
                  (sec.id === 'personal_info' && isPersonalDirty) ||
                  (sec.id === 'security_procedures' && isSecurityDirty) ||
                  (sec.id === 'password_credentials' && Boolean(newPassword));
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => changeSection(sec.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-indigo-600 text-white font-extrabold'
                        : 'bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold'
                    }`}
                  >
                    <span className="font-mono tabular-nums text-[11px]">
                      {sec.orderNumber}.
                    </span>
                    {sectionIcons[sec.id]}
                    <span>{sec.shortTitleAr}</span>
                    {hasUnsaved && (
                      <span
                        className={`text-[10px] font-bold ${
                          isActive
                            ? 'text-amber-200'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        · غير محفوظ
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {onOpenSectionsDrawer && (
              <button
                type="button"
                onClick={onOpenSectionsDrawer}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>قائمة جميع أقسام النظام</span>
              </button>
            )}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-[11px]">
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">تأكيد البريد</dt>
              <dd
                className={`font-bold mt-0.5 ${
                  isEmailVerified
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {isEmailVerified ? 'موثق ومؤكد' : 'بانتظار التأكيد'}
              </dd>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">كلمة المرور اليدوية</dt>
              <dd className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {hasPasswordProvider ? 'مفعلة ومربوطة' : 'غير معينة (Google)'}
              </dd>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">حماية العمليات الحساسة</dt>
              <dd
                className={`font-bold mt-0.5 ${
                  savedRequireReauth
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {savedRequireReauth ? 'مفعلة' : 'مخففة'}
              </dd>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">مهلة قفل الخمول</dt>
              <dd className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {resolveEffectiveSessionTimeoutMinutes(currentUser, securityPolicy)} دقيقة
              </dd>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">آخر تغيير لكلمة المرور</dt>
              <dd className="font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-0.5 truncate">
                {currentUser.lastPasswordChangedAt
                  ? formatReadableDateTimeAr(currentUser.lastPasswordChangedAt)
                  : '—'}
              </dd>
            </div>
          </dl>
        </section>

        {/* المساحة الرئيسية للأقسام الأربعة المرتبة */}
        <div className="space-y-5 min-w-0">
            {/* ==============================================================
                القسم الأول (1): المعلومات الشخصية والبيانات الأساسية
               ============================================================== */}
            {isSectionVisible('personal_info') && (
              <section
                id="section-personal-info"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-0.5">
                      الإعداد 1 من 4 · تعديل يدوي مباشر
                    </div>
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      القسم الأول: المعلومات الشخصية والبيانات الأساسية
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                      عدّل بياناتك الشخصية ومعلومات التواصل يدوياً ثم اضغط على زر الحفظ لتحديث ملفك الشخصي وتوثيقه.
                    </p>
                  </div>
                  {isPersonalDirty && (
                    <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      توجد تعديلات يدوية غير محفوظة
                    </span>
                  )}
                </div>

                {personalFeedback && (
                  <div
                    className={`p-3.5 rounded-lg border flex items-start gap-2.5 font-medium leading-relaxed ${
                      personalFeedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200'
                    }`}
                  >
                    {personalFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{personalFeedback.message}</span>
                  </div>
                )}

                <form onSubmit={handleSavePersonalSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                        الاسم الكامل في النظام <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={120}
                        value={personalForm.name}
                        onChange={(e) => {
                          setPersonalForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }));
                          if (personalFeedback) setPersonalFeedback(null);
                        }}
                        placeholder="أدخل الاسم الكامل..."
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                        رقم الهاتف الشخصي للتواصل
                      </label>
                      <input
                        type="tel"
                        dir="ltr"
                        maxLength={32}
                        value={personalForm.phone}
                        onChange={(e) => {
                          setPersonalForm((prev) => ({
                            ...prev,
                            phone: e.target.value,
                          }));
                          if (personalFeedback) setPersonalFeedback(null);
                        }}
                        placeholder="+20 100 000 0000"
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                        المسمى الوظيفي / الصفة
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={personalForm.jobTitle}
                        onChange={(e) => {
                          setPersonalForm((prev) => ({
                            ...prev,
                            jobTitle: e.target.value,
                          }));
                          if (personalFeedback) setPersonalFeedback(null);
                        }}
                        placeholder="مثال: مشرف عمليات التوصيل / مسؤول شفت..."
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                        القسم / الإدارة أو المنطقة
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={personalForm.department}
                        onChange={(e) => {
                          setPersonalForm((prev) => ({
                            ...prev,
                            department: e.target.value,
                          }));
                          if (personalFeedback) setPersonalFeedback(null);
                        }}
                        placeholder="مثال: قطاع التشغيل الميداني - القاهرة..."
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-bold text-slate-800 dark:text-slate-200">
                        نبذة تعريفية وملاحظات التواصل الشخصية
                      </label>
                      <span className="font-mono tabular-nums text-[11px] text-slate-400">
                        {personalForm.bio.length} / 500
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={personalForm.bio}
                      onChange={(e) => {
                        setPersonalForm((prev) => ({
                          ...prev,
                          bio: e.target.value,
                        }));
                        if (personalFeedback) setPersonalFeedback(null);
                      }}
                      placeholder="أضف أوقات التواصل المفضلة أو أي بيانات تعريفية اختيارية تخص حسابك..."
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-y"
                    />
                  </div>

                  {/* معرفات الهوية الثابتة غير القابلة للتزوير */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                        البريد الإلكتروني المعتمد للمصادقة (ثابت أمنياً)
                      </span>
                      <div
                        dir="ltr"
                        className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 font-mono text-left text-slate-600 dark:text-slate-300"
                      >
                        {currentUser.email}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                        المعرف الأمني للحساب (UID)
                      </span>
                      <div
                        dir="ltr"
                        className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 font-mono text-left text-slate-600 dark:text-slate-300 truncate"
                      >
                        {currentUser.uid}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      disabled={!isPersonalDirty || isSavingPersonal}
                      onClick={handleResetPersonalForm}
                      className="px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 rounded-lg font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      إلغاء واستعادة المحفوظ
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingPersonal || !isPersonalDirty}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSavingPersonal
                        ? 'جارٍ الحفظ اليدوي...'
                        : 'حفظ المعلومات الشخصية يدوياً'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* ==============================================================
                القسم الثاني (2): تغيير كلمة المرور وبيانات الدخول يدوياً
               ============================================================== */}
            {isSectionVisible('password_credentials') && (
              <section
                id="section-password-credentials"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-0.5">
                      الإعداد 2 من 4 · إدارة بيانات الدخول اليدوية
                    </div>
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      القسم الثاني: تغيير كلمة المرور وبيانات الدخول
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                      {hasPasswordProvider
                        ? 'أدخل كلمة المرور الحالية ثم عيّن كلمة المرور الجديدة يدوياً لتحديث بيانات دخولك فوراً.'
                        : 'حسابك مرتبط حالياً بمصادقة Google. يمكنك تعيين كلمة مرور يدوية إضافية للدخول بالبريد وكلمة المرور أيضاً.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isSendingReset}
                    onClick={handlePasswordResetEmail}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <MailCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    {isSendingReset
                      ? 'جارٍ الإرسال...'
                      : 'إرسال رابط استعادة عبر البريد'}
                  </button>
                </div>

                {/* شريط مزودي المصادقة المرتبطين فعلياً */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      مصادقة Google المؤسسية
                    </span>
                    <strong
                      className={`font-bold mt-0.5 block ${
                        hasGoogleProvider
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {hasGoogleProvider ? 'مرتبطة ونشطة' : 'غير مرتبطة'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      الدخول اليدوي بكلمة مرور
                    </span>
                    <strong
                      className={`font-bold mt-0.5 block ${
                        hasPasswordProvider
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {hasPasswordProvider
                        ? 'مفعّل على الحساب'
                        : 'لم يتم تعيين كلمة مرور بعد'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      آخر تحديث يدوي لكلمة المرور
                    </span>
                    <strong className="font-mono tabular-nums font-bold mt-0.5 block text-slate-800 dark:text-slate-200">
                      {currentUser.lastPasswordChangedAt
                        ? formatReadableDateTimeAr(currentUser.lastPasswordChangedAt)
                        : '—'}
                    </strong>
                  </div>
                </div>

                {passwordFeedback && (
                  <div
                    className={`p-3.5 rounded-lg border flex items-start gap-2.5 font-medium leading-relaxed ${
                      passwordFeedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                        : passwordFeedback.type === 'info'
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900 text-indigo-900 dark:text-indigo-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200'
                    }`}
                  >
                    {passwordFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{passwordFeedback.message}</span>
                  </div>
                )}

                <form onSubmit={handleSavePasswordSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {hasPasswordProvider && (
                      <div>
                        <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                          كلمة المرور الحالية <span className="text-rose-600">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showCurrentPw ? 'text' : 'password'}
                            required
                            dir="ltr"
                            autoComplete="current-password"
                            value={currentPassword}
                            onChange={(e) => {
                              setCurrentPassword(e.target.value);
                              if (passwordFeedback) setPasswordFeedback(null);
                            }}
                            placeholder="••••••••"
                            className="w-full border border-slate-300 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPw((v) => !v)}
                            className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            aria-label="إظهار أو إخفاء كلمة المرور الحالية"
                          >
                            {showCurrentPw ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className={hasPasswordProvider ? '' : 'sm:col-span-1'}>
                      <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                        {hasPasswordProvider
                          ? 'كلمة المرور الجديدة'
                          : 'تعيين كلمة مرور يدوية جديدة'}{' '}
                        <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPw ? 'text' : 'password'}
                          required
                          minLength={8}
                          maxLength={128}
                          dir="ltr"
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            if (passwordFeedback) setPasswordFeedback(null);
                          }}
                          placeholder="8 أحرف أو أكثر..."
                          className="w-full border border-slate-300 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPw((v) => !v)}
                          className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          aria-label="إظهار أو إخفاء كلمة المرور الجديدة"
                        >
                          {showNewPw ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className={hasPasswordProvider ? '' : 'sm:col-span-2'}>
                      <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                        تأكيد كلمة المرور الجديدة <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPw ? 'text' : 'password'}
                          required
                          minLength={8}
                          maxLength={128}
                          dir="ltr"
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            if (passwordFeedback) setPasswordFeedback(null);
                          }}
                          placeholder="أعد كتابة كلمة المرور الجديدة..."
                          className="w-full border border-slate-300 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPw((v) => !v)}
                          className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          aria-label="إظهار أو إخفاء تأكيد كلمة المرور"
                        >
                          {showConfirmPw ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* مؤشر قوة كلمة المرور ومتطلبات الأمان */}
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        مستوى قوة كلمة المرور المدخلة:
                      </span>
                      <span
                        className={`font-extrabold ${
                          passwordStrength.score >= 3
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : passwordStrength.score === 2
                            ? 'text-amber-700 dark:text-amber-400'
                            : passwordStrength.score === 1
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {passwordStrength.labelAr}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 h-1.5">
                      {[1, 2, 3, 4].map((step) => {
                        const active = passwordStrength.score >= step;
                        const barColor =
                          passwordStrength.score >= 3
                            ? 'bg-emerald-600'
                            : passwordStrength.score === 2
                            ? 'bg-amber-500'
                            : 'bg-rose-500';
                        return (
                          <div
                            key={step}
                            className={`rounded-full transition-colors ${
                              active ? barColor : 'bg-slate-200 dark:bg-slate-700'
                            }`}
                          />
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                      <span
                        className={
                          passwordStrength.hasMinLength
                            ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                            : ''
                        }
                      >
                        {passwordStrength.hasMinLength ? '✓' : '○'} 8 أحرف على الأقل
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          passwordStrength.hasMixedCaseOrLetters
                            ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                            : ''
                        }
                      >
                        {passwordStrength.hasMixedCaseOrLetters ? '✓' : '○'} تنوع الأحرف
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          passwordStrength.hasNumber
                            ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                            : ''
                        }
                      >
                        {passwordStrength.hasNumber ? '✓' : '○'} أرقام (0-9)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          passwordStrength.hasSymbol
                            ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                            : ''
                        }
                      >
                        {passwordStrength.hasSymbol ? '✓' : '○'} رمز خاص (!@#$)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          newPassword.length > 0 && newPassword === confirmPassword
                            ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                            : ''
                        }
                      >
                        {newPassword.length > 0 && newPassword === confirmPassword
                          ? '✓'
                          : '○'}{' '}
                        تطابق التأكيد
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                    {(currentPassword || newPassword || confirmPassword) && (
                      <button
                        type="button"
                        disabled={isSavingPassword}
                        onClick={() => {
                          setCurrentPassword('');
                          setNewPassword('');
                          setConfirmPassword('');
                          setPasswordFeedback(null);
                        }}
                        className="px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        تفريغ الحقول
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSavingPassword || !newPassword || !confirmPassword}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {isSavingPassword
                        ? 'جارٍ تحديث بيانات الدخول...'
                        : hasPasswordProvider
                        ? 'تحديث كلمة المرور يدوياً'
                        : 'تعيين وربط كلمة المرور يدوياً'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* ==============================================================
                القسم الثالث (3): إجراءات أمان الحساب وحماية الجلسة يدوياً
               ============================================================== */}
            {isSectionVisible('security_procedures') && (
              <section
                id="section-security-procedures"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-0.5">
                      الإعداد 3 من 4 · ضبط الحماية الشخصية وإدارة الجلسة
                    </div>
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      القسم الثالث: إجراءات أمان الحساب وحماية الجلسة
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                      تحكم يدوياً في مهلة قفل جلستك عند الخمول، اشتراط إعادة التحقق للعمليات الحساسة، وأدوات فحص وتحديث الجلسة النشطة.
                    </p>
                  </div>
                  {isSecurityDirty && (
                    <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      تعديلات أمان غير محفوظة
                    </span>
                  )}
                </div>

                {securityFeedback && (
                  <div
                    className={`p-3.5 rounded-lg border flex items-start gap-2.5 font-medium leading-relaxed ${
                      securityFeedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                        : securityFeedback.type === 'info'
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900 text-indigo-900 dark:text-indigo-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200'
                    }`}
                  >
                    {securityFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{securityFeedback.message}</span>
                  </div>
                )}

                <form onSubmit={handleSaveSecuritySubmit} className="space-y-4">
                  {/* 3.1 مهلة قفل الجلسة عند الخمول */}
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          مهلة القفل التلقائي للجلسة عند الخمول (بالدقائق)
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          ينهي النظام جلستك تلقائياً إذا توقف النشاط لهذه المدة لحماية حسابك على الأجهزة المشتركة.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={5}
                          max={1440}
                          required
                          value={securityForm.personalSessionTimeoutMinutes}
                          onChange={(e) => {
                            setSecurityForm((prev) => ({
                              ...prev,
                              personalSessionTimeoutMinutes:
                                Number(e.target.value) || 5,
                            }));
                            if (securityFeedback) setSecurityFeedback(null);
                          }}
                          className="w-24 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 font-mono tabular-nums font-bold text-center"
                        />
                        <span className="text-slate-500 font-bold">دقيقة</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[5, 15, 30, 45, 60, 120].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setSecurityForm((prev) => ({
                                ...prev,
                                personalSessionTimeoutMinutes: preset,
                              }))
                            }
                            className={`px-2.5 py-1 rounded border font-mono tabular-nums text-[11px] font-bold transition-colors cursor-pointer ${
                              Number(securityForm.personalSessionTimeoutMinutes) ===
                              preset
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {preset} د
                          </button>
                        ))}
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        الحد العام للنظام:{' '}
                        <strong className="font-mono tabular-nums">
                          {securityPolicy.sessionTimeoutMinutes}
                        </strong>{' '}
                        د · المطبق فعلياً:{' '}
                        <strong className="font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
                          {effectiveSessionTimeout}
                        </strong>{' '}
                        د
                      </span>
                    </div>
                  </div>

                  {/* 3.2 اشتراط إعادة التحقق الأمني للعمليات الحساسة */}
                  <label className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 dark:text-white">
                        اشتراط إعادة التحقق من الهوية قبل تخفيف إعدادات الأمان
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        عند تفعيل هذا الإجراء، لا يُسمح بإيقاف التنبيهات الأمنية أو تعديل إعدادات الحماية الحساسة إلا بعد تأكيد كلمة المرور أو مصادقة Google الحديثة.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={securityForm.requireReauthForSensitiveActions}
                      onChange={(e) => {
                        setSecurityForm((prev) => ({
                          ...prev,
                          requireReauthForSensitiveActions: e.target.checked,
                        }));
                        if (securityFeedback) setSecurityFeedback(null);
                      }}
                      className="mt-1 w-4 h-4 accent-indigo-600 shrink-0"
                    />
                  </label>

                  {/* 3.3 التنبيهات الأمنية وسجل أحداث الحساب */}
                  <label className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 dark:text-white">
                        التنبيهات الأمنية الفورية عند تعديل الحساب أو تسجيل الدخول
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        إظهار تأكيدات وتنبيهات أمنية واضحة عند تحديث البيانات الشخصية أو تغيير كلمة المرور أو تعديل مهلة الجلسة.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={securityForm.securityAlertsEnabled}
                      onChange={(e) => {
                        setSecurityForm((prev) => ({
                          ...prev,
                          securityAlertsEnabled: e.target.checked,
                        }));
                        if (securityFeedback) setSecurityFeedback(null);
                      }}
                      className="mt-1 w-4 h-4 accent-indigo-600 shrink-0"
                    />
                  </label>

                  {/* طلب كلمة المرور الحالية عند تخفيف الحماية */}
                  {needsPasswordForSecurityLowering && (
                    <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 space-y-2">
                      <label className="font-bold text-amber-950 dark:text-amber-200 block">
                        تأكيد كلمة المرور الحالية لإتمام تخفيف إعدادات الحماية:
                      </label>
                      <input
                        type="password"
                        required
                        dir="ltr"
                        value={securityReauthPassword}
                        onChange={(e) => setSecurityReauthPassword(e.target.value)}
                        placeholder="أدخل كلمة المرور الحالية للتأكيد..."
                        className="w-full sm:w-80 border border-amber-300 dark:border-amber-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 font-mono text-left"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={!isSecurityDirty || isSavingSecurity}
                      onClick={() => {
                        setSecurityFeedback(null);
                        setSecurityReauthPassword('');
                        setSecurityForm({
                          personalSessionTimeoutMinutes: savedTimeoutPref,
                          requireReauthForSensitiveActions: savedRequireReauth,
                          securityAlertsEnabled: savedSecurityAlerts,
                        });
                      }}
                      className="px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 rounded-lg font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      إلغاء التغييرات
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingSecurity || !isSecurityDirty}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSavingSecurity
                        ? 'جارٍ حفظ إجراءات الأمان...'
                        : 'حفظ إجراءات أمان الحساب يدوياً'}
                    </button>
                  </div>
                </form>

                {/* أدوات إجرائية فورية للتحقق من الجلسة وتحديث الرمز */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <h3 className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    إجراءات التحقق الفوري وإدارة الجلسة النشطة
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* إعادة التحقق الأمني الفوري */}
                    <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2.5">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          تأكيد الهوية للعمليات الحساسة
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          الحالة:{' '}
                          <strong
                            className={
                              isRecentlyVerified
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }
                          >
                            {isRecentlyVerified
                              ? 'موثق حديثاً (نشط لمدة 10 دقائق)'
                              : 'يتطلب تأكيد الهوية عند الحاجة'}
                          </strong>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {hasPasswordProvider && (
                          <input
                            type="password"
                            dir="ltr"
                            value={manualVerifyPassword}
                            onChange={(e) =>
                              setManualVerifyPassword(e.target.value)
                            }
                            placeholder="كلمة المرور الحالية..."
                            className="flex-1 min-w-[140px] border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 font-mono text-left"
                          />
                        )}
                        <button
                          type="button"
                          disabled={isRunningSessionAction}
                          onClick={handleManualReauthAction}
                          className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          إعادة التحقق الآن
                        </button>
                      </div>
                    </div>

                    {/* تحديث رمز الجلسة وتأكيد البريد */}
                    <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2.5">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          مزامنة رمز المصادقة وحالة البريد الإلكتروني
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          تحديث رمز الأمان المشفر (JWT Token) أو إرسال رابط تأكيد البريد الإلكتروني يدوياً.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isRunningSessionAction}
                          onClick={handleRefreshTokenAction}
                          className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          تحديث رمز الجلسة
                        </button>
                        {!isEmailVerified && (
                          <button
                            type="button"
                            disabled={isRunningSessionAction}
                            onClick={handleSendVerifyEmailAction}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <MailCheck className="w-3.5 h-3.5" />
                            تأكيد البريد يدوياً
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onLogout}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          إنهاء الجلسة
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ==============================================================
                القسم الرابع (4): الهوية الوظيفية والصلاحيات وسجل أمان الحساب
               ============================================================== */}
            {isSectionVisible('role_and_activity') && (
              <section
                id="section-role-and-activity"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-0.5">
                      الإعداد 4 من 4 · نطاق الصلاحيات وسجل النشاط الأمني
                    </div>
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      القسم الرابع: الهوية الوظيفية والصلاحيات وسجل الأمان
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                      تُدار الأدوار ونطاق الفرق مركزياً وفق نظام RBAC لمنع تصعيد الصلاحيات الذاتي، مع توثيق كامل لنشاط حسابك.
                    </p>
                  </div>

                  {(currentUser.role === 'delivery_rep' ||
                    currentUser.role === 'supervisor') && (
                    <button
                      type="button"
                      onClick={onNavigateToRequests}
                      className="px-3.5 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FilePlus2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      طلب تصحيح بيانات تشغيلية
                    </button>
                  )}
                </div>

                {/* بطاقة البيانات الوظيفية المحمية */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      الدور الوظيفي المعتمد
                    </span>
                    <strong className="font-extrabold text-slate-900 dark:text-white mt-1 block">
                      {ROLE_LABELS_AR[currentUser.role]}
                    </strong>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      نطاق الفريق المخصص
                    </span>
                    <strong className="font-bold text-slate-900 dark:text-white mt-1 block">
                      {myTeam
                        ? `${myTeam.teamName} (${myTeam.teamId})`
                        : currentUser.teamId || 'نطاق عام حسب الصلاحية'}
                    </strong>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      سجل المندوب المرتبط
                    </span>
                    <strong className="font-bold text-slate-900 dark:text-white mt-1 block">
                      {myEmployee
                        ? `${myEmployee.fullName} (${myEmployee.employeeCode})`
                        : 'غير مرتبط بسجل مندوب ميداني'}
                    </strong>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      تاريخ تفعيل الحساب
                    </span>
                    <strong className="font-mono tabular-nums font-bold text-slate-900 dark:text-white mt-1 block">
                      {formatReadableDateTimeAr(currentUser.createdAt)}
                    </strong>
                  </div>
                </div>

                {/* الصلاحيات الفعلية مقسمة بانتظام حسب الفئة */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-900 dark:text-white">
                      الصلاحيات الفعلية الممنوحة لحسابك
                    </h3>
                    <span className="font-mono tabular-nums text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      {effectivePerms.size} صلاحية نشطة
                    </span>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
                    {groupedGrantedPermissions.length === 0 ? (
                      <div className="p-4 text-slate-500">
                        لا توجد صلاحيات نشطة حالياً (قد يكون وضع تجميد الطوارئ مفعلاً).
                      </div>
                    ) : (
                      groupedGrantedPermissions.map((grp) => (
                        <div
                          key={grp.group}
                          className="p-3 sm:px-4 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 items-baseline"
                        >
                          <div className="font-extrabold text-slate-800 dark:text-slate-200">
                            {grp.group}
                          </div>
                          <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            {grp.items.map((it, idx) => (
                              <React.Fragment key={it.key}>
                                {idx > 0 && (
                                  <span
                                    aria-hidden="true"
                                    className="mx-2 text-slate-300 dark:text-slate-700"
                                  >
                                    ·
                                  </span>
                                )}
                                <span>{it.label}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* سجل العمليات الأمنية الأخيرة الخاصة بحساب المستخدم */}
                <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      آخر إجراءات الأمان والنشاط المسجلة لحسابك
                    </h3>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500">
                      آخر {sortedMySecurityLogs.length} عمليات
                    </span>
                  </div>

                  {sortedMySecurityLogs.length === 0 ? (
                    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500">
                      سيظهر هنا سجل عملياتك الأمنية وتعديلات ملفك الشخصي فور تنفيذها.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                      <table className="w-full text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                            <th className="py-2.5 px-3 font-extrabold">الإجراء المسجل</th>
                            <th className="py-2.5 px-3 font-extrabold">التصنيف</th>
                            <th className="py-2.5 px-3 font-extrabold">التفاصيل</th>
                            <th className="py-2.5 px-3 font-extrabold text-left">الوقت</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {sortedMySecurityLogs.map((log) => (
                            <tr
                              key={log.logId}
                              className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                            >
                              <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                                {log.action}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                {log.category === 'security' ? 'أمني' : 'تشغيلي'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-md truncate">
                                {log.afterSummary && log.afterSummary !== '—'
                                  ? log.afterSummary
                                  : log.reason}
                              </td>
                              <td
                                dir="ltr"
                                className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-500 text-left whitespace-nowrap"
                              >
                                {formatReadableDateTimeAr(log.timestamp)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            )}
        </div>
      </main>
    );
  }

  // ===========================================================================
  // العرض الثاني: بوابة المندوب الشخصية (my_portal) مع ربط مباشر بالملف الشخصي وأمان الحساب
  // ===========================================================================
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

        <div className="flex flex-wrap items-center gap-2.5">
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
            <span className="px-3 py-1 font-extrabold text-xs font-mono tabular-nums">
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

          {onNavigateToProfile && (
            <button
              type="button"
              onClick={() => onNavigateToProfile('all')}
              className="px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              الملف الشخصي وإجراءات الأمان
            </button>
          )}

          <button
            type="button"
            onClick={onNavigateToRequests}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              <div className="text-2xl font-extrabold font-mono tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
                {mySummary?.workedDays ?? 0}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">إجمالي ساعات الشهر</span>
              <div className="text-2xl font-extrabold font-mono tabular-nums mt-1 text-indigo-700 dark:text-indigo-400">
                {mySummary?.totalHours ?? 0} س
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">أيام الشفت المختارة</span>
              <div className="text-2xl font-extrabold font-mono tabular-nums mt-1 text-sky-700 dark:text-sky-400">
                {mySummary?.selectedDays ?? 0}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">أيام الإجازات والراحة</span>
              <div className="text-2xl font-extrabold font-mono tabular-nums mt-1 text-slate-700 dark:text-slate-200">
                {(mySummary?.leaveDays ?? 0) + (mySummary?.dayOffDays ?? 0)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">أيام الغياب</span>
              <div className="text-2xl font-extrabold font-mono tabular-nums mt-1 text-rose-700 dark:text-rose-400">
                {mySummary?.absentDays ?? 0}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500">نسبة الأداء الشهري</span>
              <div className="text-2xl font-extrabold font-mono tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
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
              جدول شفتاتك وسجل حضورك الشهري ({MONTH_NAMES[currentMonth - 1]}{' '}
              <span className="font-mono tabular-nums">{currentYear}</span>)
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
                  statusLabel = `حاضر (${Number(
                    ((rec.totalWorkedMinutes || 0) / 60).toFixed(1)
                  )} س)`;
                  badgeClass =
                    'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200';
                } else if (rec?.attendance === 'leave') {
                  statusLabel = 'إجازة معتمدة';
                  badgeClass =
                    'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200';
                } else if (rec?.attendance === 'day_off') {
                  statusLabel = 'يوم راحة';
                  badgeClass =
                    'bg-stone-100 dark:bg-slate-800 border-stone-300 dark:border-slate-700 text-stone-800 dark:text-slate-200';
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
                      <span className="font-mono tabular-nums font-extrabold text-sm">
                        {d.dayNumber}
                      </span>
                      <span className="text-[10px] opacity-80">{d.dayName}</span>
                    </div>
                    <div className="font-bold text-[11px]">{statusLabel}</div>
                    {rec?.attendance === 'worked' && (
                      <div className="text-[10px] font-mono tabular-nums opacity-80">
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
              <p className="text-slate-500">
                لم تقم بإرسال أي طلبات إجازة أو تصحيح حضور حتى الآن.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {myRequests.map((r) => (
                  <div
                    key={r.requestId}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-bold">
                        {REQUEST_TYPE_LABELS[r.requestType]}
                      </span>{' '}
                      <span className="font-mono tabular-nums text-slate-500">
                        ({r.requestDate})
                      </span>
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
