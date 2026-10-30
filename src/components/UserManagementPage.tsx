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
  Trash2,
  Power,
  X,
  Sliders,
  Zap,
  RotateCcw,
  ChevronDown,
  ChevronUp,
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
  isPermissionCustomizableForRole,
  resolveEffectivePermissions,
  ROLE_LABELS_AR,
  ROLE_SHORT_LABELS_AR,
} from '../utils/rbac';
import {
  createPreprovisionedUser,
  deletePreprovisionedInvitationByAdmin,
  deleteUserAccountByAdmin,
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
  embedded?: boolean;
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
  embedded = false,
}) => {
  const isSuperAdmin = currentUser.role === 'super_admin';
  const canCreate = hasPermission(currentUser, 'users.create', securityPolicy);
  const canEdit = hasPermission(currentUser, 'users.edit', securityPolicy);
  const canAssignRole = hasPermission(currentUser, 'users.assign_role', securityPolicy);
  const canDisable = hasPermission(currentUser, 'users.disable', securityPolicy);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');

  // حالة التعديل التلقائي المباشر في الجدول بدون دعوة أو نوافذ معقدة
  const [expandedPermsUid, setExpandedPermsUid] = useState<string | null>(null);
  const [autoSavingTargetId, setAutoSavingTargetId] = useState<string | null>(null);
  const [pendingSuperAdminPromoUid, setPendingSuperAdminPromoUid] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<
    | { kind: 'user'; data: UserProfile }
    | { kind: 'invitation'; data: PreprovisionedInvitation }
    | null
  >(null);

  // نموذج التخصيص المسبق بالبريد أو التعديل المتقدم
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
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [confirmDeleteInvKey, setConfirmDeleteInvKey] = useState<string | null>(null);

  const activeSuperAdminCount = useMemo(
    () => users.filter((u) => u.role === 'super_admin' && u.status === 'active').length,
    [users]
  );

  const permissionGroups = useMemo(
    () => Array.from(new Set(ALL_PERMISSIONS.map((p) => p.group))),
    []
  );

  // استبعاد الحسابات التي سجلت دخولها بالفعل من قائمة التخصيص المسبق لمنع الازدواج البصري
  const registeredEmailKeys = useMemo(
    () => new Set(users.map((u) => u.emailKey)),
    [users]
  );

  const pendingPreassigned = useMemo(
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

  // ============================================================================
  // دوال التعديل التلقائي الفوري (Auto-Save) لمدير النظام بدون دعوة أو حفظ يدوي
  // ============================================================================

  const handleAutoChangeRole = async (target: UserProfile, nextRole: UserRole) => {
    if (!canAssignRole || !canEdit) return;
    if (target.uid === currentUser.uid) {
      onNotify('لا يمكن تغيير دور حسابك الشخصي الحالي.', 'warning');
      return;
    }
    if (nextRole === target.role) return;

    if (
      target.role === 'super_admin' &&
      target.status === 'active' &&
      activeSuperAdminCount <= 1
    ) {
      onNotify('لا يمكن خفض صلاحية آخر حساب Super Admin نشط في النظام.', 'error');
      return;
    }

    // الترقية إلى Super Admin تتطلب نقرة تأكيد صريحة بجانب الصف
    if (nextRole === 'super_admin' && pendingSuperAdminPromoUid !== target.uid) {
      setPendingSuperAdminPromoUid(target.uid);
      return;
    }

    setPendingSuperAdminPromoUid(null);
    setAutoSavingTargetId(target.uid);
    try {
      await updateUserAccountByAdmin({
        actor: currentUser,
        targetUser: target,
        updates: {
          name: target.name,
          role: nextRole,
          status: target.status,
          teamId: target.teamId,
          employeeId: target.employeeId,
          // تصفية الصلاحيات الفردية لتتوافق تلقائياً مع سقف الدور الجديد
          extraPermissions: (target.extraPermissions || []).filter((p) =>
            isPermissionCustomizableForRole(nextRole, p)
          ),
          revokedPermissions: [],
        },
        reason: `تغيير تلقائي فوري للدور إلى ${ROLE_SHORT_LABELS_AR[nextRole]} بدون دعوة`,
      });
      onNotify(
        `تم تحديث دور "${target.name}" تلقائياً إلى "${ROLE_SHORT_LABELS_AR[nextRole]}" وتطبيقه فوراً على جلسته.`
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر التحديث التلقائي للدور.',
        'error'
      );
    } finally {
      setAutoSavingTargetId(null);
    }
  };

  const handleAutoChangeTeam = async (target: UserProfile, nextTeamId: string) => {
    if (!canEdit) return;
    if (nextTeamId === (target.teamId || '')) return;

    setAutoSavingTargetId(target.uid);
    try {
      await updateUserAccountByAdmin({
        actor: currentUser,
        targetUser: target,
        updates: {
          name: target.name,
          role: target.role,
          status: target.status,
          teamId: nextTeamId,
          employeeId: target.employeeId,
          extraPermissions: target.extraPermissions || [],
          revokedPermissions: target.revokedPermissions || [],
        },
        reason: 'تغيير تلقائي فوري لنطاق الفريق',
      });
      const teamName = teams.find((t) => t.teamId === nextTeamId)?.teamName || 'بدون فريق';
      onNotify(`تم تحديث نطاق فريق "${target.name}" تلقائياً إلى (${teamName}).`);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر تحديث الفريق تلقائياً.',
        'error'
      );
    } finally {
      setAutoSavingTargetId(null);
    }
  };

  const handleAutoChangeEmployeeLink = async (
    target: UserProfile,
    nextEmployeeId: string
  ) => {
    if (!canEdit) return;
    if (nextEmployeeId === (target.employeeId || '')) return;

    const matchedEmp = employees.find((e) => e.id === nextEmployeeId);
    const syncedTeamId = matchedEmp?.teamId || target.teamId || '';

    setAutoSavingTargetId(target.uid);
    try {
      await updateUserAccountByAdmin({
        actor: currentUser,
        targetUser: target,
        updates: {
          name: target.name,
          role: target.role,
          status: target.status,
          teamId: syncedTeamId,
          employeeId: nextEmployeeId,
          extraPermissions: target.extraPermissions || [],
          revokedPermissions: target.revokedPermissions || [],
        },
        reason: 'ربط / تعديل تلقائي لسجل المندوب المرتبط بالحساب',
      });
      onNotify(
        matchedEmp
          ? `تم ربط حساب "${target.name}" تلقائياً بالمندوب ${matchedEmp.fullName} (${matchedEmp.employeeCode}).`
          : `تم إلغاء ربط المندوب عن حساب "${target.name}" تلقائياً.`
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر تحديث ربط المندوب تلقائياً.',
        'error'
      );
    } finally {
      setAutoSavingTargetId(null);
    }
  };

  // تبديل صلاحية فردية لمستخدم مع حفظ وتطبيق تلقائي فوري (Instant Auto-Save)
  const handleAutoToggleUserPermission = async (
    target: UserProfile,
    perm: PermissionKey
  ) => {
    if (!canEdit || target.role === 'super_admin') return;
    if (!isPermissionCustomizableForRole(target.role, perm)) return;

    const currentEffective = resolveEffectivePermissions(target, securityPolicy);
    const isCurrentlyEnabled = currentEffective.has(perm);
    const baseRoleHas = DEFAULT_ROLE_PERMISSIONS[target.role]?.includes(perm) ?? false;

    const nextExtra = new Set<PermissionKey>(target.extraPermissions || []);
    const nextRevoked = new Set<PermissionKey>(target.revokedPermissions || []);

    if (isCurrentlyEnabled) {
      // يراد سحب هذه الصلاحية فوراً
      nextExtra.delete(perm);
      nextRevoked.add(perm);
    } else {
      // يراد منح هذه الصلاحية فوراً
      nextRevoked.delete(perm);
      if (!baseRoleHas) {
        nextExtra.add(perm);
      }
    }

    setAutoSavingTargetId(target.uid);
    try {
      await updateUserAccountByAdmin({
        actor: currentUser,
        targetUser: target,
        updates: {
          name: target.name,
          role: target.role,
          status: target.status,
          teamId: target.teamId,
          employeeId: target.employeeId,
          extraPermissions: Array.from(nextExtra),
          revokedPermissions: Array.from(nextRevoked),
        },
        reason: `${isCurrentlyEnabled ? 'سحب' : 'منح'} تلقائي فوري لصلاحية (${perm})`,
      });
      const permLabel = ALL_PERMISSIONS.find((p) => p.key === perm)?.label || perm;
      onNotify(
        `${isCurrentlyEnabled ? 'تم سحب' : 'تم منح'} صلاحية "${permLabel}" للمستخدم "${target.name}" تلقائياً.`
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر التحديث التلقائي للصلاحية.',
        'error'
      );
    } finally {
      setAutoSavingTargetId(null);
    }
  };

  const handleAutoResetUserPermissions = async (target: UserProfile) => {
    if (!canEdit || target.role === 'super_admin') return;
    setAutoSavingTargetId(target.uid);
    try {
      await updateUserAccountByAdmin({
        actor: currentUser,
        targetUser: target,
        updates: {
          name: target.name,
          role: target.role,
          status: target.status,
          teamId: target.teamId,
          employeeId: target.employeeId,
          extraPermissions: [],
          revokedPermissions: [],
        },
        reason: 'إعادة ضبط تلقائية للصلاحيات القياسية للدور',
      });
      onNotify(`تمت إعادة صلاحيات "${target.name}" للضبط القياسي لدور ${ROLE_SHORT_LABELS_AR[target.role]}.`);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر إعادة ضبط الصلاحيات.',
        'error'
      );
    } finally {
      setAutoSavingTargetId(null);
    }
  };

  // تحديث تلقائي لحساب مخصص مسبقاً بالبريد قبل دخوله الأول
  const handleAutoChangePreassignedRole = async (
    inv: PreprovisionedInvitation,
    nextRole: Exclude<UserRole, 'super_admin'>
  ) => {
    if (!isSuperAdmin) return;
    setAutoSavingTargetId(inv.emailKey);
    try {
      await updatePreprovisionedInvitationByAdmin({
        actor: currentUser,
        invitation: inv,
        updates: {
          name: inv.name,
          role: nextRole,
          status: inv.status,
          teamId: inv.teamId,
          employeeId: inv.employeeId,
          extraPermissions: (inv.extraPermissions || []).filter((p) =>
            isPermissionCustomizableForRole(nextRole, p)
          ),
          revokedPermissions: [],
        },
      });
      onNotify(`تم تحديث الدور المخصص للبريد "${inv.email}" تلقائياً.`);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر التحديث التلقائي.',
        'error'
      );
    } finally {
      setAutoSavingTargetId(null);
    }
  };

  // ============================================================================
  // النوافذ الاختيارية (تخصيص بريد مسبق أو تحرير متقدم)
  // ============================================================================

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
      onNotify(
        `تم حفظ صلاحيات البريد "${formEmail}" لتُطبق تلقائياً فور تسجيل دخوله دون الحاجة لأي دعوة.`
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر حفظ التخصيص المسبق. تحقق من الصلاحيات.',
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

    if (formRole === 'super_admin' && editingTarget.data.role !== 'super_admin' && !sensitiveConfirmed) {
      onNotify('يرجى تفعيل مربع التأكيد الإضافي لمنح صلاحية Super Admin.', 'warning');
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
      onNotify('تم حفظ تعديلات الحساب وتطبيقها تلقائياً.');
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

  const handleQuickToggleStatus = async (target: UserProfile) => {
    if (!canDisable || target.uid === currentUser.uid) return;
    if (
      target.role === 'super_admin' &&
      target.status === 'active' &&
      activeSuperAdminCount <= 1
    ) {
      onNotify('لا يمكن تعطيل آخر حساب Super Admin نشط في النظام.', 'error');
      return;
    }

    const nextStatus: AccountStatus =
      target.status === 'active' ? 'disabled' : 'active';
    setAutoSavingTargetId(target.uid);
    try {
      await updateUserAccountByAdmin({
        actor: currentUser,
        targetUser: target,
        updates: {
          name: target.name,
          role: target.role,
          status: nextStatus,
          teamId: target.teamId,
          employeeId: target.employeeId,
          extraPermissions: target.extraPermissions || [],
          revokedPermissions: target.revokedPermissions || [],
        },
        reason:
          nextStatus === 'disabled'
            ? 'إيقاف فوري للحساب من مركز التحكم الأمني'
            : 'تفعيل فوري للحساب من مركز التحكم الأمني',
      });
      onNotify(
        nextStatus === 'disabled'
          ? `تم تعطيل حساب "${target.name}" فوراً وقطع صلاحية جلسته.`
          : `تم تفعيل حساب "${target.name}" تلقائياً وبأثر فوري.`
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر تغيير حالة الحساب.',
        'error'
      );
    } finally {
      setAutoSavingTargetId(null);
    }
  };

  const handleDeleteUserAccount = async (target: UserProfile) => {
    if (!isSuperAdmin || target.uid === currentUser.uid) return;
    if (target.role === 'super_admin') {
      onNotify('حسابات Super Admin محمية من الحذف المباشر.', 'error');
      return;
    }
    try {
      await deleteUserAccountByAdmin({
        actor: currentUser,
        targetUser: target,
      });
      setConfirmDeleteUid(null);
      onNotify(`تم حذف حساب "${target.name}" نهائياً وتوثيق العملية أمنياً.`, 'info');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر حذف الحساب.',
        'error'
      );
    }
  };

  const handleDeleteInvitation = async (inv: PreprovisionedInvitation) => {
    if (!isSuperAdmin) return;
    try {
      await deletePreprovisionedInvitationByAdmin({
        actor: currentUser,
        invitation: inv,
      });
      setConfirmDeleteInvKey(null);
      onNotify(`تم حذف التخصيص المسبق للبريد "${inv.email}".`, 'info');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر الحذف.',
        'error'
      );
    }
  };

  const WrapperTag = embedded ? 'div' : 'main';

  return (
    <WrapperTag
      className={
        embedded
          ? 'space-y-5'
          : 'flex-1 p-4 sm:p-6 max-w-[1900px] w-full mx-auto space-y-5'
      }
    >
      {/* رأس الصفحة + شارة التحديث التلقائي الفوري بدون دعوة */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
            <Shield className="w-4 h-4" />
            <span>إدارة الهوية والصلاحيات التلقائية الفورية (Instant RBAC)</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[11px] font-extrabold">
              <Zap className="w-3 h-3" />
              تعديل تلقائي مباشر بدون دعوة
            </span>
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
            التحكم المباشر والتلقائي في أدوار وصلاحيات المستخدمين
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            أي مستخدم يسجل دخوله يظهر هنا تلقائياً دون الحاجة لدعوة، وأي تغيير تجريه على الدور أو الفريق أو الصلاحيات يُحفظ ويُطبق فوراً على جلسته في الوقت الفعلي.
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            تخصيص صلاحيات لبريد قبل دخوله (اختياري)
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
          <span className="text-xs text-slate-500 dark:text-slate-400">الحسابات النشطة حالياً</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-emerald-700 dark:text-emerald-400">
            {users.filter((u) => u.status === 'active').length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">حسابات معطلة / موقوفة</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-rose-700 dark:text-rose-400">
            {users.filter((u) => u.status === 'disabled').length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">وضع التسجيل بدون دعوة</span>
          <div className="text-sm font-extrabold mt-2 text-indigo-700 dark:text-indigo-400">
            {securityPolicy.autoProvisionWithoutInvite
              ? `مفعل تلقائياً (${ROLE_SHORT_LABELS_AR[securityPolicy.autoProvisionDefaultRole]})`
              : 'مغلق (التخصيص المسبق فقط)'}
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

      {/* جدول المستخدمين المسجلين مع أدوات التعديل التلقائي المباشر (Inline Auto-Save) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-right text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
              <th className="p-3">المستخدم</th>
              <th className="p-3">البريد الإلكتروني</th>
              <th className="p-3">الدور الوظيفي (تغيير تلقائي)</th>
              <th className="p-3">نطاق الفريق (تغيير تلقائي)</th>
              <th className="p-3">المندوب المرتبط (ربط تلقائي)</th>
              <th className="p-3">الحالة</th>
              <th className="p-3 text-center">الصلاحيات والإجراءات الفورية</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredUsers.map((u) => {
              const isSelf = u.uid === currentUser.uid;
              const isRowSaving = autoSavingTargetId === u.uid;
              const isPermsExpanded = expandedPermsUid === u.uid;
              const effectivePerms = resolveEffectivePermissions(u, securityPolicy);
              const customOverridesCount =
                (u.extraPermissions?.length || 0) + (u.revokedPermissions?.length || 0);
              const team = teams.find((t) => t.teamId === u.teamId);
              const emp = employees.find((e) => e.id === u.employeeId);

              return (
                <React.Fragment key={u.uid}>
                  <tr
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                      isPermsExpanded ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                    }`}
                  >
                    <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{u.name}</span>
                        {isSelf && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-bold">
                            أنت
                          </span>
                        )}
                        {isRowSaving && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold animate-pulse">
                            يحفظ تلقائياً...
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        آخر ظهور:{' '}
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString('ar-EG', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </div>
                    </td>

                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300" dir="ltr">
                      {u.email}
                    </td>

                    {/* تغيير الدور تلقائياً وفورياً بدون نافذة أو دعوة */}
                    <td className="p-3 min-w-[180px]">
                      {canAssignRole && canEdit && !isSelf ? (
                        <div className="space-y-1">
                          <select
                            disabled={isRowSaving}
                            value={
                              pendingSuperAdminPromoUid === u.uid ? 'super_admin' : u.role
                            }
                            onChange={(e) => {
                              const selected = e.target.value as UserRole;
                              if (selected !== 'super_admin') {
                                setPendingSuperAdminPromoUid(null);
                              }
                              handleAutoChangeRole(u, selected);
                            }}
                            className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                          >
                            {(Object.keys(ROLE_SHORT_LABELS_AR) as UserRole[]).map((r) => (
                              <option key={r} value={r}>
                                {ROLE_SHORT_LABELS_AR[r]}
                              </option>
                            ))}
                          </select>

                          {pendingSuperAdminPromoUid === u.uid && (
                            <div className="flex items-center gap-1 p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800">
                              <span className="text-[10px] font-bold text-amber-900 dark:text-amber-200">
                                ترقية لمدير نظام كامل؟
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAutoChangeRole(u, 'super_admin')}
                                className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-[10px]"
                              >
                                تأكيد
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingSuperAdminPromoUid(null)}
                                className="px-1.5 py-0.5 text-slate-600 dark:text-slate-300 text-[10px]"
                              >
                                إلغاء
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 inline-block">
                          {ROLE_SHORT_LABELS_AR[u.role]}
                        </span>
                      )}
                    </td>

                    {/* تغيير نطاق الفريق تلقائياً وفورياً */}
                    <td className="p-3 min-w-[165px]">
                      {canEdit && u.role !== 'super_admin' ? (
                        <select
                          disabled={isRowSaving}
                          value={u.teamId || ''}
                          onChange={(e) => handleAutoChangeTeam(u, e.target.value)}
                          className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                        >
                          <option value="">— بدون فريق —</option>
                          {teams.map((t) => (
                            <option key={t.teamId} value={t.teamId}>
                              {t.teamName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-300">
                          {team ? team.teamName : u.teamId || 'نطاق عام'}
                        </span>
                      )}
                    </td>

                    {/* ربط المندوب تلقائياً وفورياً */}
                    <td className="p-3 min-w-[185px]">
                      {canEdit && u.role !== 'super_admin' ? (
                        <select
                          disabled={isRowSaving}
                          value={u.employeeId || ''}
                          onChange={(e) => handleAutoChangeEmployeeLink(u, e.target.value)}
                          className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                        >
                          <option value="">— غير مرتبط بمندوب —</option>
                          {employees.map((eItem) => (
                            <option key={eItem.id} value={eItem.id}>
                              {eItem.fullName} ({eItem.employeeCode})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-300">
                          {emp ? `${emp.fullName} (${emp.employeeCode})` : '—'}
                        </span>
                      )}
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

                    <td className="p-3">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {canEdit ? (
                          <>
                            {u.role !== 'super_admin' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedPermsUid((prev) =>
                                    prev === u.uid ? null : u.uid
                                  )
                                }
                                className={`px-2.5 py-1.5 border rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                  isPermsExpanded
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                                }`}
                                title="تعديل الصلاحيات التفصيلية بشكل تلقائي وفوري دون دعوة"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                                <span>صلاحيات فورية ({effectivePerms.size})</span>
                                {customOverridesCount > 0 && (
                                  <span className="px-1 py-0.2 rounded bg-amber-500 text-white text-[9px] font-mono">
                                    مخصص
                                  </span>
                                )}
                                {isPermsExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}

                            {canDisable && !isSelf && (
                              <button
                                type="button"
                                onClick={() => handleQuickToggleStatus(u)}
                                className={`px-2 py-1.5 border rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                  u.status === 'active'
                                    ? 'border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                                    : 'border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                                {u.status === 'active' ? 'تعطيل' : 'تفعيل'}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openEditModal({ kind: 'user', data: u })}
                              className="p-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                              title="تحرير الاسم والبيانات المتقدمة"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePasswordResetClick(u.email, u.uid)}
                              className="p-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                              title="إرسال رابط إعادة تعيين كلمة المرور"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            {isSuperAdmin &&
                              !isSelf &&
                              u.role !== 'super_admin' &&
                              (confirmDeleteUid === u.uid ? (
                                <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 px-2 py-1 rounded-lg">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUserAccount(u)}
                                    className="px-1.5 py-0.5 bg-rose-600 text-white rounded font-bold text-[10px]"
                                  >
                                    تأكيد حذف
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUid(null)}
                                    className="px-1 py-0.5 text-slate-600 dark:text-slate-300 text-[10px]"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUid(u.uid)}
                                  className="p-1.5 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg text-rose-600 dark:text-rose-400 cursor-pointer"
                                  title="حذف الحساب نهائياً"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ))}
                          </>
                        ) : (
                          <span className="text-slate-400">عرض فقط</span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* لوحة التعديل التلقائي الفوري للصلاحيات الفردية (بدون حفظ يدوي أو دعوة) */}
                  {isPermsExpanded && u.role !== 'super_admin' && (
                    <tr className="bg-slate-50/90 dark:bg-slate-950/70">
                      <td colSpan={7} className="p-4 border-t border-indigo-200 dark:border-indigo-900/60">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              <span className="font-extrabold text-slate-900 dark:text-white">
                                تخصيص الصلاحيات التلقائي الفوري للمستخدم: {u.name} (
                                {ROLE_SHORT_LABELS_AR[u.role]})
                              </span>
                              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                                • أي نقرة تُحفظ وتُطبق فوراً على حساب المستخدم دون دعوة
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {customOverridesCount > 0 && (
                                <button
                                  type="button"
                                  disabled={isRowSaving}
                                  onClick={() => handleAutoResetUserPermissions(u)}
                                  className="px-3 py-1 border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 rounded-lg font-bold flex items-center gap-1 text-[11px]"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  استعادة صلاحيات الدور القياسية
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setExpandedPermsUid(null)}
                                className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg font-bold text-[11px]"
                              >
                                إغلاق اللوحة
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {permissionGroups.map((groupName) => {
                              const groupPerms = ALL_PERMISSIONS.filter(
                                (p) => p.group === groupName
                              );
                              return (
                                <div
                                  key={groupName}
                                  className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                                >
                                  <div className="font-extrabold text-indigo-700 dark:text-indigo-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                                    {groupName}
                                  </div>
                                  <div className="space-y-1.5">
                                    {groupPerms.map((perm) => {
                                      const customizable = isPermissionCustomizableForRole(
                                        u.role,
                                        perm.key
                                      );
                                      const checked = effectivePerms.has(perm.key);
                                      const isExtra = u.extraPermissions?.includes(perm.key);
                                      const isRevoked = u.revokedPermissions?.includes(perm.key);

                                      return (
                                        <label
                                          key={perm.key}
                                          className={`flex items-center justify-between gap-2 p-1.5 rounded-lg transition-colors ${
                                            customizable
                                              ? 'hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer'
                                              : 'opacity-45 cursor-not-allowed'
                                          }`}
                                          title={
                                            customizable
                                              ? 'انقر للتفعيل أو السحب التلقائي الفوري'
                                              : 'مقفلة بسقف الأمان الأساسي لهذا الدور'
                                          }
                                        >
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="checkbox"
                                              disabled={!customizable || isRowSaving}
                                              checked={checked}
                                              onChange={() =>
                                                customizable &&
                                                handleAutoToggleUserPermission(u, perm.key)
                                              }
                                              className="rounded border-slate-300"
                                            />
                                            <span className="font-medium text-slate-800 dark:text-slate-200">
                                              {perm.label}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            {isExtra && (
                                              <span className="px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold">
                                                +ممنوحة
                                              </span>
                                            )}
                                            {isRevoked && (
                                              <span className="px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[9px] font-bold">
                                                -مسحوبة
                                              </span>
                                            )}
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* قسم الحسابات المخصصة صلاحياتها مسبقاً بالبريد قبل دخولها الأول (اختياري) */}
      {isSuperAdmin && pendingPreassigned.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            صلاحيات مجهزة مسبقاً بالبريد الإلكتروني وتُطبق تلقائياً فور أول دخول ({pendingPreassigned.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="p-2.5">الاسم</th>
                  <th className="p-2.5">البريد الإلكتروني</th>
                  <th className="p-2.5">الدور المخصص (تعديل تلقائي)</th>
                  <th className="p-2.5">الفريق / المندوب</th>
                  <th className="p-2.5">الحالة</th>
                  <th className="p-2.5 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pendingPreassigned.map((inv) => {
                  const emp = employees.find((e) => e.id === inv.employeeId);
                  const team = teams.find((t) => t.teamId === inv.teamId);
                  return (
                    <tr key={inv.emailKey}>
                      <td className="p-2.5 font-bold">{inv.name}</td>
                      <td className="p-2.5 font-mono" dir="ltr">
                        {inv.email}
                      </td>
                      <td className="p-2.5">
                        {inv.role !== 'super_admin' ? (
                          <select
                            disabled={autoSavingTargetId === inv.emailKey}
                            value={inv.role}
                            onChange={(e) =>
                              handleAutoChangePreassignedRole(
                                inv,
                                e.target.value as Exclude<UserRole, 'super_admin'>
                              )
                            }
                            className="border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 font-bold"
                          >
                            <option value="operations_manager">مدير التشغيل</option>
                            <option value="supervisor">مشرف فريق</option>
                            <option value="delivery_rep">مندوب</option>
                            <option value="viewer">مراقب قراءة فقط</option>
                          </select>
                        ) : (
                          <span className="font-bold">{ROLE_SHORT_LABELS_AR[inv.role]}</span>
                        )}
                      </td>
                      <td className="p-2.5">
                        {team?.teamName || inv.teamId || '—'}{' '}
                        {emp ? `· ${emp.fullName} (${emp.employeeCode})` : ''}
                      </td>
                      <td className="p-2.5 font-bold">
                        {inv.status === 'active'
                          ? 'يطبق تلقائياً فور الدخول'
                          : inv.status === 'disabled'
                          ? 'محظور من الدخول'
                          : 'معلق'}
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal({ kind: 'invitation', data: inv })}
                            className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded-lg font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            تعديل متقدم
                          </button>
                          {confirmDeleteInvKey === inv.emailKey ? (
                            <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 px-2 py-0.5 rounded-lg">
                              <button
                                type="button"
                                onClick={() => handleDeleteInvitation(inv)}
                                className="px-1.5 py-0.5 bg-rose-600 text-white rounded font-bold text-[10px]"
                              >
                                حذف
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteInvKey(null)}
                                className="px-1 py-0.5 text-[10px]"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteInvKey(inv.emailKey)}
                              className="p-1 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg text-rose-600 dark:text-rose-400"
                              title="حذف التخصيص المسبق"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* نافذة التخصيص المسبق بالبريد أو التحرير المتقدم */}
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
                    ? 'تخصيص صلاحيات لبريد إلكتروني مسبقاً (يطبق تلقائياً دون دعوة)'
                    : `تحرير بيانات وصلاحيات: ${editingTarget?.data.name}`}
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
                  <label className="font-bold block mb-1">البريد الإلكتروني *</label>
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
                  <label className="font-bold block mb-1">نطاق الفريق</label>
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
                  <label className="font-bold block mb-1">ربط بسجل مندوب حالي</label>
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

              {isCreateOpen && formRole === 'super_admin' && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 space-y-2">
                  <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    إجراء أمني خاص: منح صلاحية مدير نظام كامل (Super Admin)
                  </div>
                  <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                    للتأكيد اكتب عبارة <strong>تأكيد مدير نظام</strong> في الحقل التالي:
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

              {formRole !== 'super_admin' && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    الصلاحيات التفصيلية للدور ({ROLE_SHORT_LABELS_AR[formRole]})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pt-1">
                    {ALL_PERMISSIONS.map((perm) => {
                      const customizable = isPermissionCustomizableForRole(
                        formRole,
                        perm.key
                      );
                      const baseIncluded =
                        DEFAULT_ROLE_PERMISSIONS[formRole]?.includes(perm.key) ?? false;
                      const isChecked = customizable
                        ? baseIncluded
                          ? !formRevokedPerms.includes(perm.key)
                          : formExtraPerms.includes(perm.key)
                        : false;
                      return (
                        <label
                          key={perm.key}
                          className={`flex items-center gap-2 p-1.5 rounded ${
                            customizable
                              ? 'hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer'
                              : 'opacity-45 cursor-not-allowed'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={!customizable}
                            checked={isChecked}
                            onChange={() => customizable && toggleCustomPerm(perm.key)}
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
                  <label className="font-bold block mb-1">سبب التعديل (اختياري — يوثق في Audit Log)</label>
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
                formRole === 'super_admin' &&
                editingTarget.data.role !== 'super_admin' && (
                  <label className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sensitiveConfirmed}
                      onChange={(e) => setSensitiveConfirmed(e.target.checked)}
                    />
                    <span>أؤكد منح صلاحية مدير نظام كامل (Super Admin) لهذا الحساب.</span>
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
                  {isSaving ? 'جارٍ الحفظ...' : 'حفظ وتطبيق تلقائياً'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </WrapperTag>
  );
};
