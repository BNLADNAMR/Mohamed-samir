import React, { useMemo, useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Edit3,
  KeyRound,
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  AccountStatus,
  Employee,
  PermissionKey,
  PreprovisionedInvitation,
  SecurityPolicySettings,
  Team,
  UserProfile,
  UserRole,
} from '../types';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  ROLE_LABELS_AR,
  ROLE_SHORT_LABELS_AR,
} from '../utils/rbac';
import {
  createPreprovisionedUser,
  recordAuditLog,
  updatePreprovisionedInvitationByAdmin,
  updateUserAccountByAdmin,
} from '../services/firestoreService';

interface UserManagementPageProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  users: UserProfile[];
  invitations: PreprovisionedInvitation[];
  employees: Employee[];
  teams: Team[];
  onSendPasswordReset: (email: string) => Promise<string>;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const UserManagementPage: React.FC<UserManagementPageProps> = ({
  currentUser,
  securityPolicy,
  users,
  invitations,
  employees,
  teams,
  onSendPasswordReset,
  onNotify,
}) => {
  const canCreate = hasPermission(currentUser, 'users.create', securityPolicy);
  const canEdit = hasPermission(currentUser, 'users.edit', securityPolicy);
  const canAssignRole = hasPermission(currentUser, 'users.assign_role', securityPolicy);
  const canDisable = hasPermission(currentUser, 'users.disable', securityPolicy);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<
    | { kind: 'user'; data: UserProfile }
    | { kind: 'invitation'; data: PreprovisionedInvitation }
    | null
  >(null);

  // نموذج إنشاء / تعديل
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('delivery_rep');
  const [formStatus, setFormStatus] = useState<AccountStatus>('active');
  const [formTeamId, setFormTeamId] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formExtraPerms, setFormExtraPerms] = useState<PermissionKey[]>([]);
  const [formRevokedPerms, setFormRevokedPerms] = useState<PermissionKey[]>([]);
  const [formReason, setFormReason] = useState('');
  const [superAdminConfirmPhrase, setSuperAdminConfirmPhrase] = useState('');
  const [sensitiveConfirmed, setSensitiveConfirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const activeSuperAdminCount = useMemo(
    () => users.filter((u) => u.role === 'super_admin' && u.status === 'active').length,
    [users]
  );

  // استبعاد الدعوات التي تم تفعيلها بالفعل في جدول المستخدمين النشطين لمنع الازدواج البصري
  const registeredEmailKeys = useMemo(
    () => new Set(users.map((u) => u.emailKey)),
    [users]
  );

  const pendingInvitations = useMemo(
    () => invitations.filter((inv) => !registeredEmailKeys.has(inv.emailKey)),
    [invitations, registeredEmailKeys]
  );

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (!q) return true;
      const linkedEmp = employees.find((e) => e.id === u.employeeId);
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (linkedEmp?.employeeCode || '').toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery, roleFilter, statusFilter, employees]);

  const openCreateModal = () => {
    setFormName('');
    setFormEmail('');
    setFormRole('delivery_rep');
    setFormStatus('active');
    setFormTeamId('');
    setFormEmployeeId('');
    setFormExtraPerms([]);
    setFormRevokedPerms([]);
    setFormReason('');
    setSuperAdminConfirmPhrase('');
    setSensitiveConfirmed(false);
    setIsCreateOpen(true);
  };

  const openEditModal = (
    target:
      | { kind: 'user'; data: UserProfile }
      | { kind: 'invitation'; data: PreprovisionedInvitation }
  ) => {
    setEditingTarget(target);
    setFormName(target.data.name);
    setFormEmail(target.data.email);
    setFormRole(target.data.role);
    setFormStatus(target.data.status);
    setFormTeamId(target.data.teamId || '');
    setFormEmployeeId(target.data.employeeId || '');
    setFormExtraPerms(target.data.extraPermissions || []);
    setFormRevokedPerms(target.data.revokedPermissions || []);
    setFormReason('');
    setSuperAdminConfirmPhrase('');
    setSensitiveConfirmed(false);
  };

  const toggleCustomPerm = (perm: PermissionKey) => {
    const baseHas = DEFAULT_ROLE_PERMISSIONS[formRole]?.includes(perm);
    if (baseHas) {
      setFormRevokedPerms((prev) =>
        prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
      );
    } else {
      setFormExtraPerms((prev) =>
        prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
      );
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;

    if (formRole === 'super_admin' && superAdminConfirmPhrase.trim() !== 'تأكيد مدير نظام') {
      onNotify(
        'لإنشاء مدير نظام جديد، يرجى كتابة عبارة "تأكيد مدير نظام" بدقة في حقل التأكيد الأمني.',
        'error'
      );
      return;
    }

    if (formRole === 'delivery_rep' && !formEmployeeId) {
      onNotify('يرجى ربط حساب المندوب بسجل المندوب المقابل في النظام.', 'warning');
      return;
    }

    if (formRole === 'supervisor' && !formTeamId) {
      onNotify('يرجى تحديد الفريق المخصص للمشرف.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      await createPreprovisionedUser({
        actor: currentUser,
        name: formName,
        email: formEmail,
        role: formRole,
        employeeId: formEmployeeId,
        teamId: formTeamId,
        extraPermissions: formExtraPerms,
        revokedPermissions: formRevokedPerms,
        status: formStatus,
      });
      setIsCreateOpen(false);
      onNotify(`تم اعتماد الحساب "${formEmail}" بنجاح في قائمة الدخول الآمن.`);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر إنشاء الحساب. تحقق من الصلاحيات.',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget || !canEdit) return;

    const isSelf =
      editingTarget.kind === 'user' && editingTarget.data.uid === currentUser.uid;

    if (isSelf && formRole !== editingTarget.data.role) {
      onNotify('لا يمكن لأي مستخدم تغيير دوره الوظيفي بنفسه.', 'error');
      return;
    }

    if (isSelf && formStatus !== 'active') {
      onNotify('لا يمكنك تعطيل حسابك الشخصي أثناء الجلسة الحالية.', 'error');
      return;
    }

    // حماية آخر مدير نظام نشط
    if (
      editingTarget.kind === 'user' &&
      editingTarget.data.role === 'super_admin' &&
      editingTarget.data.status === 'active' &&
      (formRole !== 'super_admin' || formStatus !== 'active') &&
      activeSuperAdminCount <= 1
    ) {
      onNotify('لا يمكن تعطيل أو خفض صلاحية آخر حساب Super Admin نشط في النظام.', 'error');
      return;
    }

    const isSensitiveChange =
      formRole !== editingTarget.data.role ||
      formStatus !== editingTarget.data.status ||
      formRole === 'super_admin';

    if (isSensitiveChange && !sensitiveConfirmed) {
      onNotify('يرجى تفعيل مربع التأكيد الإضافي لتنفيذ هذا الإجراء الأمني الحساس.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      if (editingTarget.kind === 'user') {
        await updateUserAccountByAdmin({
          actor: currentUser,
          targetUser: editingTarget.data,
          updates: {
            name: formName,
            role: canAssignRole ? formRole : editingTarget.data.role,
            status: canDisable ? formStatus : editingTarget.data.status,
            teamId: formTeamId,
            employeeId: formEmployeeId,
            extraPermissions: formExtraPerms,
            revokedPermissions: formRevokedPerms,
          },
          reason: formReason || 'تحديث بيانات الحساب والصلاحيات',
        });
      } else {
        await updatePreprovisionedInvitationByAdmin({
          actor: currentUser,
          invitation: editingTarget.data,
          updates: {
            name: formName,
            role: formRole,
            status: formStatus,
            teamId: formTeamId,
            employeeId: formEmployeeId,
            extraPermissions: formExtraPerms,
            revokedPermissions: formRevokedPerms,
          },
        });
      }
      setEditingTarget(null);
      onNotify('تم حفظ تعديلات الحساب وتوثيقها في سجل العمليات الأمنية.');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر حفظ التعديلات.',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordResetClick = async (targetEmail: string, targetUid: string) => {
    try {
      const msg = await onSendPasswordReset(targetEmail);
      await recordAuditLog({
        actor: currentUser,
        category: 'security',
        action: 'إرسال رابط إعادة تعيين كلمة مرور',
        targetType: 'user',
        targetId: targetUid,
        afterSummary: `البريد: ${targetEmail}`,
      });
      onNotify(msg, 'info');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر إرسال رابط إعادة التعيين.',
        'warning'
      );
    }
  };

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-[1900px] w-full mx-auto space-y-5">
      {/* رأس الصفحة */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold mb-1">
            <Shield className="w-4 h-4" />
            إدارة الهوية والوصول (RBAC)
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
            إدارة المستخدمين والأدوار والصلاحيات
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            التحكم الكامل في الحسابات المصرح لها بالدخول، ربط المندوبين دون ازدواج السجلات، وتحديد نطاق الفرق.
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            إنشاء حساب مستخدم معتمد
          </button>
        )}
      </div>

      {/* مؤشرات سريعة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">إجمالي الحسابات المسجلة</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-slate-900 dark:text-white">
            {users.length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">الحسابات النشطة</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-emerald-700 dark:text-emerald-400">
            {users.filter((u) => u.status === 'active').length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">حسابات معطلة</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-rose-700 dark:text-rose-400">
            {users.filter((u) => u.status === 'disabled').length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">دعوات معتمدة بانتظار أول دخول</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-amber-700 dark:text-amber-400">
            {pendingInvitations.length}
          </div>
        </div>
      </div>

      {/* شريط البحث والفلترة */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، البريد الإلكتروني، أو كود المندوب..."
            className="w-full border border-slate-300 dark:border-slate-700 rounded-lg pr-8 pl-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
          className="border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        >
          <option value="all">كل الأدوار الوظيفية</option>
          <option value="super_admin">مدير النظام</option>
          <option value="operations_manager">مدير التشغيل</option>
          <option value="supervisor">مشرف فريق</option>
          <option value="delivery_rep">مندوب توصيل</option>
          <option value="viewer">مراقب قراءة فقط</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | AccountStatus)}
          className="border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        >
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="disabled">معطل</option>
          <option value="pending">بانتظار التفعيل</option>
        </select>
      </div>

      {/* جدول المستخدمين المسجلين */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-right text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
              <th className="p-3">المستخدم</th>
              <th className="p-3">البريد الإلكتروني</th>
              <th className="p-3">الدور (Role)</th>
              <th className="p-3">الفريق</th>
              <th className="p-3">المندوب المرتبط</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">آخر تسجيل دخول</th>
              <th className="p-3 text-center">إجراءات الإدارة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredUsers.map((u) => {
              const team = teams.find((t) => t.teamId === u.teamId);
              const emp = employees.find((e) => e.id === u.employeeId);
              return (
                <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span>{u.name}</span>
                      {u.uid === currentUser.uid && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-bold">
                          أنت
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 font-mono text-slate-600 dark:text-slate-300" dir="ltr">
                    {u.email}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200">
                      {ROLE_SHORT_LABELS_AR[u.role]}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-300">
                    {team ? team.teamName : u.teamId || '—'}
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-300">
                    {emp ? `${emp.fullName} (${emp.employeeCode})` : '—'}
                  </td>
                  <td className="p-3">
                    {u.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        نشط
                      </span>
                    ) : u.status === 'disabled' ? (
                      <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-bold">
                        <XCircle className="w-3.5 h-3.5" />
                        معطل
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold">
                        <Clock className="w-3.5 h-3.5" />
                        معلق
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-slate-500 dark:text-slate-400">
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleString('ar-EG', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      {canEdit ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal({ kind: 'user', data: u })}
                            className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-bold flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            تعديل وصلاحيات
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePasswordResetClick(u.email, u.uid)}
                            className="p-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300"
                            title="إرسال رابط إعادة تعيين كلمة المرور"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-400">عرض فقط</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* قسم الدعوات المعتمدة مسبقاً التي لم تسجل دخولها الأول بعد */}
      {currentUser.role === 'super_admin' && pendingInvitations.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            حسابات معتمدة مسبقاً بانتظار أول تسجيل دخول ({pendingInvitations.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="p-2.5">الاسم</th>
                  <th className="p-2.5">البريد المعتمد</th>
                  <th className="p-2.5">الدور المخصص</th>
                  <th className="p-2.5">الفريق / المندوب</th>
                  <th className="p-2.5">حالة الدعوة</th>
                  <th className="p-2.5 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pendingInvitations.map((inv) => {
                  const emp = employees.find((e) => e.id === inv.employeeId);
                  const team = teams.find((t) => t.teamId === inv.teamId);
                  return (
                    <tr key={inv.emailKey}>
                      <td className="p-2.5 font-bold">{inv.name}</td>
                      <td className="p-2.5 font-mono" dir="ltr">
                        {inv.email}
                      </td>
                      <td className="p-2.5">{ROLE_SHORT_LABELS_AR[inv.role]}</td>
                      <td className="p-2.5">
                        {team?.teamName || inv.teamId || '—'}{' '}
                        {emp ? `· ${emp.fullName} (${emp.employeeCode})` : ''}
                      </td>
                      <td className="p-2.5 font-bold">
                        {inv.status === 'active'
                          ? 'جاهز للتفعيل عند الدخول'
                          : inv.status === 'disabled'
                          ? 'ملغاة / معطلة'
                          : 'معلقة'}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => openEditModal({ kind: 'invitation', data: inv })}
                          className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded-lg font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          تعديل الدعوة
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* نافذة إنشاء أو تعديل حساب مستخدم */}
      {(isCreateOpen || editingTarget) && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => {
            setIsCreateOpen(false);
            setEditingTarget(null);
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-base">
                  {isCreateOpen
                    ? 'إنشاء حساب مستخدم معتمد (Closed Onboarding)'
                    : `تعديل حساب وصلاحيات: ${editingTarget?.data.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingTarget(null);
                }}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={isCreateOpen ? handleCreateSubmit : handleEditSubmit}
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold block mb-1">الاسم الكامل *</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="مثال: خالد محمود"
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="font-bold block mb-1">البريد الإلكتروني المعتمد *</label>
                  <input
                    type="email"
                    required
                    disabled={!isCreateOpen}
                    dir="ltr"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="user@gmail.com"
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 font-mono text-left disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold block mb-1">نوع المستخدم (Role) *</label>
                  <select
                    value={formRole}
                    disabled={
                      editingTarget?.kind === 'user' &&
                      editingTarget.data.uid === currentUser.uid
                    }
                    onChange={(e) => {
                      setFormRole(e.target.value as UserRole);
                      setFormExtraPerms([]);
                      setFormRevokedPerms([]);
                    }}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 disabled:opacity-60"
                  >
                    {(Object.keys(ROLE_LABELS_AR) as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS_AR[r]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">حالة الحساب *</label>
                  <select
                    value={formStatus}
                    disabled={
                      editingTarget?.kind === 'user' &&
                      editingTarget.data.uid === currentUser.uid
                    }
                    onChange={(e) => setFormStatus(e.target.value as AccountStatus)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 disabled:opacity-60"
                  >
                    <option value="active">نشط (مسموح بالدخول)</option>
                    <option value="pending">بانتظار التفعيل</option>
                    <option value="disabled">معطل (محظور من الدخول فوراً)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold block mb-1">
                    نطاق الفريق (إلزامي للمشرف والمندوب)
                  </label>
                  <select
                    value={formTeamId}
                    onChange={(e) => setFormTeamId(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                  >
                    <option value="">— بدون فريق مخصص (نطاق عام) —</option>
                    {teams.map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.teamName} ({t.teamId})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">
                    ربط بسجل مندوب حالي (يحافظ على الكود و External ID دون تكرار)
                  </label>
                  <select
                    value={formEmployeeId}
                    onChange={(e) => {
                      const empId = e.target.value;
                      setFormEmployeeId(empId);
                      const found = employees.find((emp) => emp.id === empId);
                      if (found) {
                        if (!formName) setFormName(found.fullName);
                        if (found.teamId) setFormTeamId(found.teamId);
                      }
                    }}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                  >
                    <option value="">— غير مرتبط بسجل مندوب —</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} — {emp.employeeCode} (EXT: {emp.externalId || '—'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* إجراء خاص وآمن لإنشاء Super Admin جديد */}
              {isCreateOpen && formRole === 'super_admin' && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 space-y-2">
                  <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    إجراء أمني خاص: منح صلاحية مدير نظام كامل (Super Admin)
                  </div>
                  <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                    يمتلك مدير النظام صلاحية كاملة على جميع المستخدمين وإعدادات الأمان. للتأكيد اكتب عبارة{' '}
                    <strong>تأكيد مدير نظام</strong> في الحقل التالي:
                  </p>
                  <input
                    type="text"
                    required
                    value={superAdminConfirmPhrase}
                    onChange={(e) => setSuperAdminConfirmPhrase(e.target.value)}
                    placeholder="تأكيد مدير نظام"
                    className="w-full border border-amber-400 dark:border-amber-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 font-bold"
                  />
                </div>
              )}

              {/* تخصيص الصلاحيات التفصيلية لغير مدير النظام */}
              {formRole !== 'super_admin' && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    الصلاحيات التفصيلية للدور ({ROLE_SHORT_LABELS_AR[formRole]})
                  </div>
                  <p className="text-[11px] text-slate-500">
                    يمكنك تفعيل أو سحب صلاحيات محددة ضمن سقف الأمان المسموح لهذا الدور:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pt-1">
                    {ALL_PERMISSIONS.map((perm) => {
                      const baseIncluded =
                        DEFAULT_ROLE_PERMISSIONS[formRole]?.includes(perm.key) ?? false;
                      const isChecked = baseIncluded
                        ? !formRevokedPerms.includes(perm.key)
                        : formExtraPerms.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCustomPerm(perm.key)}
                            className="rounded border-slate-300"
                          />
                          <span className="text-[11px]">
                            {perm.label}{' '}
                            <span className="text-[10px] font-mono text-slate-400">
                              ({perm.key})
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isCreateOpen && (
                <div>
                  <label className="font-bold block mb-1">سبب التعديل (يوثق في Audit Log)</label>
                  <input
                    type="text"
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="مثال: ترقية إلى مشرف فريق شرق القاهرة"
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                  />
                </div>
              )}

              {!isCreateOpen &&
                editingTarget &&
                (formRole !== editingTarget.data.role ||
                  formStatus !== editingTarget.data.status ||
                  formRole === 'super_admin') && (
                  <label className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sensitiveConfirmed}
                      onChange={(e) => setSensitiveConfirmed(e.target.checked)}
                    />
                    <span>
                      أؤكد تنفيذ هذا التغيير الحساس على الدور أو حالة تفعيل الحساب وتوثيقه أمنياً.
                    </span>
                  </label>
                )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingTarget(null);
                  }}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  {isSaving ? 'جارٍ الحفظ...' : isCreateOpen ? 'اعتماد الحساب' : 'حفظ التغييرات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
