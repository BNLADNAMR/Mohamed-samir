import {
  AppRoutePage,
  AttendanceRecord,
  Employee,
  PermissionKey,
  SecurityPolicySettings,
  UserProfile,
  UserRole,
  WorkflowRequest,
} from '../types';

export const BOOTSTRAPPED_SUPER_ADMIN_EMAIL = 'aladdinamrr@gmail.com';

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  super_admin: 'مدير النظام (Super Admin)',
  operations_manager: 'مدير التشغيل (Operations Manager)',
  supervisor: 'مشرف فريق (Supervisor)',
  delivery_rep: 'مندوب توصيل (Delivery Rep)',
  viewer: 'مراقب / قراءة فقط (Viewer)',
};

export const ROLE_SHORT_LABELS_AR: Record<UserRole, string> = {
  super_admin: 'مدير النظام',
  operations_manager: 'مدير التشغيل',
  supervisor: 'مشرف فريق',
  delivery_rep: 'مندوب',
  viewer: 'مراقب قراءة فقط',
};

export const ALL_PERMISSIONS: {
  key: PermissionKey;
  label: string;
  group: string;
}[] = [
  { key: 'users.view', label: 'عرض المستخدمين', group: 'المستخدمون' },
  { key: 'users.create', label: 'إنشاء حسابات المستخدمين', group: 'المستخدمون' },
  { key: 'users.edit', label: 'تعديل بيانات المستخدمين', group: 'المستخدمون' },
  { key: 'users.disable', label: 'تعطيل وتفعيل الحسابات', group: 'المستخدمون' },
  { key: 'users.assign_role', label: 'تعيين وتغيير الأدوار', group: 'المستخدمون' },

  { key: 'employees.view_all', label: 'مشاهدة جميع المندوبين', group: 'المندوبون' },
  { key: 'employees.view_team', label: 'مشاهدة مندوبي الفريق', group: 'المندوبون' },
  { key: 'employees.view_self', label: 'مشاهدة الملف الشخصي للمندوب', group: 'المندوبون' },
  { key: 'employees.create', label: 'إضافة مندوب جديد', group: 'المندوبون' },
  { key: 'employees.edit', label: 'تعديل بيانات المندوبين', group: 'المندوبون' },
  { key: 'employees.delete', label: 'حذف سجل مندوب', group: 'المندوبون' },

  { key: 'shifts.view_all', label: 'مشاهدة جميع الشفتات', group: 'الشفتات' },
  { key: 'shifts.view_team', label: 'مشاهدة شفتات الفريق', group: 'الشفتات' },
  { key: 'shifts.view_self', label: 'مشاهدة الشفتات الشخصية', group: 'الشفتات' },
  { key: 'shifts.edit', label: 'تعديل الشفتات', group: 'الشفتات' },
  { key: 'shifts.approve', label: 'اعتماد تعديلات الشفتات', group: 'الشفتات' },

  { key: 'attendance.view_all', label: 'متابعة حضور جميع الفرق', group: 'الحضور والانصراف' },
  { key: 'attendance.view_team', label: 'متابعة حضور الفريق', group: 'الحضور والانصراف' },
  { key: 'attendance.view_self', label: 'مشاهدة سجل الحضور الشخصي', group: 'الحضور والانصراف' },
  { key: 'attendance.record', label: 'تسجيل الحضور والغياب اليومي', group: 'الحضور والانصراف' },
  { key: 'attendance.edit', label: 'تعديل سجلات الحضور والانصراف', group: 'الحضور والانصراف' },
  { key: 'attendance.approve_correction', label: 'اعتماد طلبات تصحيح الحضور', group: 'الحضور والانصراف' },

  { key: 'leave.request', label: 'تقديم طلب إجازة أو تصحيح', group: 'الإجازات والطلبات' },
  { key: 'leave.review', label: 'مراجعة الطلبات ورفع توصية', group: 'الإجازات والطلبات' },
  { key: 'leave.approve', label: 'اعتماد أو رفض الإجازات والطلبات', group: 'الإجازات والطلبات' },

  { key: 'reports.view_all', label: 'مشاهدة جميع التقارير والإحصاءات', group: 'التقارير' },
  { key: 'reports.view_team', label: 'مشاهدة تقارير الفريق فقط', group: 'التقارير' },
  { key: 'reports.view_self', label: 'مشاهدة ملخص الأداء الشخصي', group: 'التقارير' },
  { key: 'reports.export', label: 'تصدير التقارير (Excel / CSV)', group: 'التقارير' },

  { key: 'teams.manage', label: 'إدارة الفرق وتعيين المشرفين', group: 'الإدارة والأمان' },
  { key: 'settings.manage', label: 'إدارة إعدادات الأمان والنظام', group: 'الإدارة والأمان' },
  { key: 'integration.manage', label: 'إدارة إعدادات الربط الخارجي', group: 'الإدارة والأمان' },
  { key: 'audit.view', label: 'الاطلاع على سجل العمليات الأمنية', group: 'الإدارة والأمان' },
  { key: 'audit.export', label: 'تصدير سجل العمليات الأمنية', group: 'الإدارة والأمان' },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  super_admin: ALL_PERMISSIONS.map((p) => p.key),
  operations_manager: [
    'users.view',
    'employees.view_all',
    'employees.create',
    'employees.edit',
    'shifts.view_all',
    'shifts.edit',
    'shifts.approve',
    'attendance.view_all',
    'attendance.record',
    'attendance.edit',
    'attendance.approve_correction',
    'leave.review',
    'leave.approve',
    'reports.view_all',
    'reports.export',
    'audit.view',
  ],
  supervisor: [
    'employees.view_team',
    'shifts.view_team',
    'attendance.view_team',
    'attendance.record',
    'leave.request',
    'leave.review',
    'reports.view_team',
  ],
  delivery_rep: [
    'employees.view_self',
    'shifts.view_self',
    'attendance.view_self',
    'leave.request',
    'reports.view_self',
  ],
  viewer: [
    'employees.view_all',
    'shifts.view_all',
    'attendance.view_all',
    'reports.view_all',
  ],
};

// الصلاحيات الأمنية غير القابلة للمنح لغير مدير النظام لمنع تجاوز حدود الأمان الأساسية
const SUPER_ADMIN_EXCLUSIVE_PERMISSIONS: Set<PermissionKey> = new Set([
  'users.create',
  'users.disable',
  'users.assign_role',
  'settings.manage',
  'employees.delete',
]);

// المراقب والمندوب لا يحصلان أبداً على أي صلاحية تعديل أو كتابة إدارية حتى لو أضيفت بالخطأ
const READ_ONLY_OR_REP_BLOCKED_PERMISSIONS: Set<PermissionKey> = new Set([
  'users.create',
  'users.edit',
  'users.disable',
  'users.assign_role',
  'employees.create',
  'employees.edit',
  'employees.delete',
  'shifts.edit',
  'shifts.approve',
  'attendance.record',
  'attendance.edit',
  'attendance.approve_correction',
  'leave.approve',
  'teams.manage',
  'settings.manage',
  'integration.manage',
]);

export const WRITE_ACTION_PERMISSIONS: Set<PermissionKey> = new Set([
  'users.create',
  'users.edit',
  'users.disable',
  'users.assign_role',
  'employees.create',
  'employees.edit',
  'employees.delete',
  'shifts.edit',
  'shifts.approve',
  'attendance.record',
  'attendance.edit',
  'attendance.approve_correction',
  'leave.request',
  'leave.review',
  'leave.approve',
  'teams.manage',
  'settings.manage',
  'integration.manage',
]);

export const DEFAULT_SECURITY_POLICY: SecurityPolicySettings = {
  policyId: 'global',
  allowSupervisorLeaveRecommendation: true,
  allowViewerExport: true,
  allowOpsIntegrationSync: false,
  enforceAdminMfaNotice: true,
  emergencyReadOnlyMode: false,
  systemLockdownMode: false,
  lockdownMessage: 'النظام في وضع الصيانة الأمنية المؤقتة بأمر من مدير النظام. يرجى المحاولة لاحقاً.',
  autoProvisionWithoutInvite: true,
  autoProvisionDefaultRole: 'viewer',
  autoProvisionDefaultStatus: 'active',
  opsGrantedPerms: [],
  opsRevokedPerms: [],
  supGrantedPerms: [],
  supRevokedPerms: [],
  repGrantedPerms: [],
  repRevokedPerms: [],
  viewerGrantedPerms: [],
  viewerRevokedPerms: [],
  sessionTimeoutMinutes: 60,
  externalSyncEndpoint: '',
  lastExternalSyncStatus: 'جاهز للمزامنة الآمنة',
  lastExternalSyncImported: 0,
  lastExternalSyncFailed: 0,
  lastExternalSyncTime: '—',
  updatedBy: 'system',
  updatedAt: new Date().toISOString(),
};

export function isPermissionCustomizableForRole(
  role: UserRole,
  perm: PermissionKey
): boolean {
  if (role === 'super_admin') return false;
  if (SUPER_ADMIN_EXCLUSIVE_PERMISSIONS.has(perm)) return false;
  if (
    (role === 'viewer' || role === 'delivery_rep') &&
    READ_ONLY_OR_REP_BLOCKED_PERMISSIONS.has(perm)
  ) {
    return false;
  }
  return true;
}

/**
 * حساب الصلاحيات الفعلية للمستخدم مع دمج تحكم مدير النظام الديناميكي ووضع الطوارئ وعدم السماح بتجاوز السقف الأمني
 */
export function resolveEffectivePermissions(
  user: UserProfile | null,
  policy: SecurityPolicySettings = DEFAULT_SECURITY_POLICY
): Set<PermissionKey> {
  if (!user || user.status !== 'active') {
    return new Set();
  }

  if (user.role === 'super_admin') {
    return new Set(DEFAULT_ROLE_PERMISSIONS.super_admin);
  }

  if (policy.systemLockdownMode) {
    return new Set();
  }

  const effective = new Set<PermissionKey>(DEFAULT_ROLE_PERMISSIONS[user.role] || []);

  // تطبيق سياسات مدير النظام الديناميكية
  if (user.role === 'supervisor' && !policy.allowSupervisorLeaveRecommendation) {
    effective.delete('leave.review');
  }
  if (user.role === 'viewer' && policy.allowViewerExport) {
    effective.add('reports.export');
  } else if (user.role === 'viewer' && !policy.allowViewerExport) {
    effective.delete('reports.export');
  }
  if (user.role === 'operations_manager' && policy.allowOpsIntegrationSync) {
    effective.add('integration.manage');
  }

  // تطبيق تعديلات مصفوفة الأدوار الشاملة التي يحددها مدير النظام (Super Admin)
  const roleGrantsMap: Record<Exclude<UserRole, 'super_admin'>, PermissionKey[]> = {
    operations_manager: policy.opsGrantedPerms || [],
    supervisor: policy.supGrantedPerms || [],
    delivery_rep: policy.repGrantedPerms || [],
    viewer: policy.viewerGrantedPerms || [],
  };
  const roleRevokesMap: Record<Exclude<UserRole, 'super_admin'>, PermissionKey[]> = {
    operations_manager: policy.opsRevokedPerms || [],
    supervisor: policy.supRevokedPerms || [],
    delivery_rep: policy.repRevokedPerms || [],
    viewer: policy.viewerRevokedPerms || [],
  };

  for (const granted of roleGrantsMap[user.role] || []) {
    if (isPermissionCustomizableForRole(user.role, granted)) {
      effective.add(granted);
    }
  }
  for (const revoked of roleRevokesMap[user.role] || []) {
    effective.delete(revoked);
  }

  // إضافة الصلاحيات المخصصة الفردية للمستخدم ضمن سقف الأمان
  for (const extra of user.extraPermissions || []) {
    if (!isPermissionCustomizableForRole(user.role, extra)) continue;
    effective.add(extra);
  }

  // سحب الصلاحيات الملغاة فردياً
  for (const revoked of user.revokedPermissions || []) {
    effective.delete(revoked);
  }

  // في حال تفعيل وضع تجميد التعديلات الشامل من مدير النظام، تُحجب جميع صلاحيات الكتابة عن غير مدير النظام فوراً
  if (policy.emergencyReadOnlyMode) {
    for (const writePerm of WRITE_ACTION_PERMISSIONS) {
      effective.delete(writePerm);
    }
  }

  return effective;
}

export function hasPermission(
  user: UserProfile | null,
  permission: PermissionKey,
  policy: SecurityPolicySettings = DEFAULT_SECURITY_POLICY
): boolean {
  return resolveEffectivePermissions(user, policy).has(permission);
}

/**
 * التحقق المزدوج: الصلاحية + نطاق البيانات (Data Scope)
 */
export function canViewEmployee(user: UserProfile | null, emp: Employee, policy?: SecurityPolicySettings): boolean {
  if (!user || user.status !== 'active') return false;
  if (hasPermission(user, 'employees.view_all', policy)) return true;
  if (hasPermission(user, 'employees.view_team', policy)) {
    return Boolean(user.teamId && emp.teamId === user.teamId);
  }
  if (hasPermission(user, 'employees.view_self', policy)) {
    return Boolean(
      (user.employeeId && emp.id === user.employeeId) ||
        (emp.userId && emp.userId === user.uid)
    );
  }
  return false;
}

export function canRecordOrEditAttendance(
  user: UserProfile | null,
  emp: Employee,
  existingRecord?: AttendanceRecord,
  policy?: SecurityPolicySettings
): boolean {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'viewer' || user.role === 'delivery_rep') return false;

  if (user.role === 'super_admin' || user.role === 'operations_manager') {
    return (
      hasPermission(user, 'attendance.edit', policy) ||
      hasPermission(user, 'attendance.record', policy)
    );
  }

  if (user.role === 'supervisor') {
    if (!user.teamId || emp.teamId !== user.teamId) return false;
    // المشرف لا يعدل سجلات مستوردة مباشرة من النظام الخارجي دون طلب تصحيح
    if (existingRecord?.source === 'external_sync') return false;
    return hasPermission(user, 'attendance.record', policy);
  }

  return false;
}

export function canReviewOrApproveRequest(
  user: UserProfile | null,
  req: WorkflowRequest,
  action: 'recommend' | 'approve_or_reject',
  policy: SecurityPolicySettings = DEFAULT_SECURITY_POLICY
): boolean {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'super_admin') return true;

  // لا يجوز لأي مستخدم غير مدير النظام اعتماد طلب قدمه بنفسه
  if (req.submittedBy === user.uid) return false;

  if (req.status === 'approved' || req.status === 'rejected') {
    return false;
  }

  if (action === 'recommend') {
    return (
      user.role === 'supervisor' &&
      Boolean(user.teamId && req.teamId === user.teamId) &&
      hasPermission(user, 'leave.review', policy)
    );
  }

  if (action === 'approve_or_reject') {
    return (
      user.role === 'operations_manager' &&
      (hasPermission(user, 'leave.approve', policy) ||
        hasPermission(user, 'attendance.approve_correction', policy))
    );
  }

  return false;
}

export function canAccessRoute(
  user: UserProfile | null,
  route: AppRoutePage,
  policy: SecurityPolicySettings = DEFAULT_SECURITY_POLICY
): boolean {
  if (!user || user.status !== 'active') return false;
  if (user.role !== 'super_admin' && policy.systemLockdownMode) return false;

  switch (route) {
    case 'security_center':
    case 'security_settings':
      return user.role === 'super_admin' && hasPermission(user, 'settings.manage', policy);
    case 'profile':
      return true;
    case 'my_portal':
      return user.role === 'delivery_rep' || hasPermission(user, 'employees.view_self', policy);
    case 'dashboard':
    case 'monthly_grid':
      return (
        user.role !== 'delivery_rep' &&
        (hasPermission(user, 'shifts.view_all', policy) ||
          hasPermission(user, 'shifts.view_team', policy))
      );
    case 'analytics':
      return (
        user.role !== 'delivery_rep' &&
        (hasPermission(user, 'reports.view_all', policy) ||
          hasPermission(user, 'reports.view_team', policy))
      );
    case 'requests':
      return (
        user.role === 'super_admin' ||
        hasPermission(user, 'leave.request', policy) ||
        hasPermission(user, 'leave.review', policy) ||
        hasPermission(user, 'leave.approve', policy) ||
        user.role === 'delivery_rep' ||
        user.role === 'supervisor' ||
        user.role === 'operations_manager'
      );
    case 'users':
      return user.role === 'super_admin' || hasPermission(user, 'users.view', policy);
    case 'teams':
      return (
        user.role === 'super_admin' ||
        user.role === 'operations_manager' ||
        user.role === 'supervisor' ||
        hasPermission(user, 'teams.manage', policy)
      );
    case 'audit_logs':
      return user.role === 'super_admin' || hasPermission(user, 'audit.view', policy);
    default:
      return false;
  }
}

export function getDefaultRouteForRole(role: UserRole): AppRoutePage {
  if (role === 'delivery_rep') return 'my_portal';
  return 'dashboard';
}
