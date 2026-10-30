import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Users,
  Network,
  Globe,
  FileText,
  Sliders,
  Check,
  X,
  RotateCcw,
  Save,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  Eye,
  Power,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import {
  AppRoutePage,
  AttendanceRecord,
  AuditLogItem,
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
  canAccessRoute,
  canViewEmployee,
  DEFAULT_ROLE_PERMISSIONS,
  isPermissionCustomizableForRole,
  resolveEffectivePermissions,
  ROLE_LABELS_AR,
  ROLE_SHORT_LABELS_AR,
} from '../utils/rbac';
import {
  clearAllOperationalDataFirestore,
  migrateLocalDataToFirestore,
  saveSecurityPolicySettings,
  updateUserAccountByAdmin,
} from '../services/firestoreService';
import { UserManagementPage } from './UserManagementPage';
import { TeamsManagementPage } from './TeamsManagementPage';
import { AuditLogsPage } from './AuditLogsPage';

export type SecurityHubTab =
  | 'overview'
  | 'permissions_matrix'
  | 'users'
  | 'teams'
  | 'integration'
  | 'audit_and_simulator';

interface SuperAdminSecurityHubProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  users: UserProfile[];
  invitations: PreprovisionedInvitation[];
  teams: Team[];
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
  auditLogs: AuditLogItem[];
  initialTab?: SecurityHubTab;
  activeTabProp?: SecurityHubTab;
  onTabChange?: (tab: SecurityHubTab) => void;
  onSendPasswordReset: (email: string) => Promise<string>;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

type EditableRole = Exclude<UserRole, 'super_admin'>;

const ROLES_ORDER: UserRole[] = [
  'super_admin',
  'operations_manager',
  'supervisor',
  'delivery_rep',
  'viewer',
];

const SIMULATED_ROUTES: { route: AppRoutePage; label: string }[] = [
  { route: 'dashboard', label: 'الجدول الشهري' },
  { route: 'analytics', label: 'ملخص الأداء والتقارير' },
  { route: 'requests', label: 'الطلبات والإجازات' },
  { route: 'my_portal', label: 'بوابة المندوب الشخصية' },
  { route: 'teams', label: 'الفرق والمشرفون' },
  { route: 'users', label: 'إدارة المستخدمين' },
  { route: 'audit_logs', label: 'سجل المراجعة الأمني' },
  { route: 'security_center', label: 'مركز التحكم الأمني الشامل' },
];

export const SuperAdminSecurityHub: React.FC<SuperAdminSecurityHubProps> = ({
  currentUser,
  securityPolicy,
  users,
  invitations,
  teams,
  employees,
  attendanceRecords,
  auditLogs,
  initialTab = 'overview',
  activeTabProp,
  onTabChange,
  onSendPasswordReset,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<SecurityHubTab>(
    activeTabProp ?? initialTab
  );

  useEffect(() => {
    setActiveTab(activeTabProp ?? initialTab);
  }, [activeTabProp, initialTab]);

  const selectTab = (nextTab: SecurityHubTab) => {
    setActiveTab(nextTab);
    onTabChange?.(nextTab);
  };

  // حالات تحرير السياسات العامة والطوارئ
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
  const [lockdownMessage, setLockdownMessage] = useState(
    securityPolicy.lockdownMessage || ''
  );
  const [externalSyncEndpoint, setExternalSyncEndpoint] = useState(
    securityPolicy.externalSyncEndpoint || ''
  );

  // حالات مصفوفة الصلاحيات التفاعلية للأدوار
  const [roleMatrixDraft, setRoleMatrixDraft] = useState<{
    opsGrantedPerms: PermissionKey[];
    opsRevokedPerms: PermissionKey[];
    supGrantedPerms: PermissionKey[];
    supRevokedPerms: PermissionKey[];
    repGrantedPerms: PermissionKey[];
    repRevokedPerms: PermissionKey[];
    viewerGrantedPerms: PermissionKey[];
    viewerRevokedPerms: PermissionKey[];
  }>({
    opsGrantedPerms: securityPolicy.opsGrantedPerms || [],
    opsRevokedPerms: securityPolicy.opsRevokedPerms || [],
    supGrantedPerms: securityPolicy.supGrantedPerms || [],
    supRevokedPerms: securityPolicy.supRevokedPerms || [],
    repGrantedPerms: securityPolicy.repGrantedPerms || [],
    repRevokedPerms: securityPolicy.repRevokedPerms || [],
    viewerGrantedPerms: securityPolicy.viewerGrantedPerms || [],
    viewerRevokedPerms: securityPolicy.viewerRevokedPerms || [],
  });

  // مزامنة القيم المحلية عند تغير السياسة السحابية
  useEffect(() => {
    setAllowSupLeaveRec(securityPolicy.allowSupervisorLeaveRecommendation);
    setAllowViewerExport(securityPolicy.allowViewerExport);
    setAllowOpsIntegrationSync(securityPolicy.allowOpsIntegrationSync);
    setEnforceAdminMfaNotice(securityPolicy.enforceAdminMfaNotice);
    setSessionTimeoutMinutes(securityPolicy.sessionTimeoutMinutes || 60);
    setLockdownMessage(securityPolicy.lockdownMessage || '');
    setExternalSyncEndpoint(securityPolicy.externalSyncEndpoint || '');
    setRoleMatrixDraft({
      opsGrantedPerms: securityPolicy.opsGrantedPerms || [],
      opsRevokedPerms: securityPolicy.opsRevokedPerms || [],
      supGrantedPerms: securityPolicy.supGrantedPerms || [],
      supRevokedPerms: securityPolicy.supRevokedPerms || [],
      repGrantedPerms: securityPolicy.repGrantedPerms || [],
      repRevokedPerms: securityPolicy.repRevokedPerms || [],
      viewerGrantedPerms: securityPolicy.viewerGrantedPerms || [],
      viewerRevokedPerms: securityPolicy.viewerRevokedPerms || [],
    });
  }, [securityPolicy]);

  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [isSyncingExternal, setIsSyncingExternal] = useState(false);
  const [matrixGroupFilter, setMatrixGroupFilter] = useState<string>('all');
  const [autoSaveMatrix, setAutoSaveMatrix] = useState<boolean>(true);
  const [resetPhrase, setResetPhrase] = useState('');
  const [showResetBox, setShowResetBox] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // محاكي فحص الصلاحيات المباشر
  const [simMode, setSimMode] = useState<'existing_user' | 'role_preview'>('existing_user');
  const [simSelectedUid, setSimSelectedUid] = useState<string>(currentUser.uid);
  const [simRole, setSimRole] = useState<UserRole>('supervisor');
  const [simTeamId, setSimTeamId] = useState<string>(teams[0]?.teamId || '');
  const [simEmployeeId, setSimEmployeeId] = useState<string>(employees[0]?.id || '');

  // إحصاءات مركز القيادة
  const registeredEmailKeys = useMemo(
    () => new Set(users.map((u) => u.emailKey)),
    [users]
  );
  const pendingInvitationsCount = useMemo(
    () => invitations.filter((inv) => !registeredEmailKeys.has(inv.emailKey)).length,
    [invitations, registeredEmailKeys]
  );
  const activeUsersCount = useMemo(
    () => users.filter((u) => u.status === 'active').length,
    [users]
  );
  const disabledUsers = useMemo(
    () => users.filter((u) => u.status === 'disabled'),
    [users]
  );
  const securityEventsCount = useMemo(
    () => auditLogs.filter((l) => l.category === 'security').length,
    [auditLogs]
  );
  const deniedEventsCount = useMemo(
    () => auditLogs.filter((l) => l.result === 'denied' || l.result === 'failure').length,
    [auditLogs]
  );

  const permissionGroups = useMemo(
    () => Array.from(new Set(ALL_PERMISSIONS.map((p) => p.group))),
    []
  );

  // التبديل الفوري لوضع تجميد التعديلات (Emergency Read-Only Freeze)
  const handleToggleEmergencyReadOnly = async () => {
    const nextState = !securityPolicy.emergencyReadOnlyMode;
    setIsSavingPolicy(true);
    try {
      await saveSecurityPolicySettings({
        actor: currentUser,
        settings: {
          ...securityPolicy,
          emergencyReadOnlyMode: nextState,
        },
        auditActionLabel: nextState
          ? 'تفعيل وضع تجميد التعديلات الطارئ (Read-Only Freeze)'
          : 'إيقاف وضع تجميد التعديلات الطارئ واستئناف العمل',
      });
      onNotify(
        nextState
          ? 'تم تفعيل تجميد التعديلات الشامل: جميع المستخدمين غير مدير النظام في وضع القراءة فقط الآن.'
          : 'تم إلغاء تجميد التعديلات واستعادة صلاحيات التشغيل المعتادة.'
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر تحديث وضع الطوارئ.',
        'error'
      );
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // التبديل الفوري لوضع قفل النظام الشامل (System Lockdown)
  const handleToggleSystemLockdown = async () => {
    const nextState = !securityPolicy.systemLockdownMode;
    setIsSavingPolicy(true);
    try {
      await saveSecurityPolicySettings({
        actor: currentUser,
        settings: {
          ...securityPolicy,
          systemLockdownMode: nextState,
          lockdownMessage:
            lockdownMessage.trim() ||
            'النظام في وضع الصيانة الأمنية المؤقتة بأمر من مدير النظام. يرجى المحاولة لاحقاً.',
        },
        auditActionLabel: nextState
          ? 'تفعيل القفل الأمني الشامل للنظام (System Lockdown)'
          : 'فتح النظام وإلغاء القفل الأمني الشامل',
      });
      onNotify(
        nextState
          ? 'تم قفل النظام مؤقتاً أمام جميع الحسابات باستثناء مدير النظام (Super Admin).'
          : 'تم إلغاء القفل الأمني والسماح بدخول المستخدمين المصرح لهم.'
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر تحديث وضع قفل النظام.',
        'error'
      );
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // التحكم التلقائي الفوري في الدخول بدون دعوة والدور الافتراضي للمستخدمين الجدد
  const handleAutoProvisionPolicyChange = async (updates: {
    autoProvisionWithoutInvite?: boolean;
    autoProvisionDefaultRole?: SecurityPolicySettings['autoProvisionDefaultRole'];
    autoProvisionDefaultStatus?: SecurityPolicySettings['autoProvisionDefaultStatus'];
  }) => {
    setIsSavingPolicy(true);
    try {
      await saveSecurityPolicySettings({
        actor: currentUser,
        settings: {
          ...securityPolicy,
          ...updates,
        },
        auditActionLabel:
          'تحديث إعدادات التسجيل وتعديل الصلاحيات التلقائي بدون دعوة',
      });
      onNotify('تم تحديث إعدادات التسجيل التلقائي وتعميمها فوراً.');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر تحديث إعدادات التسجيل التلقائي.',
        'error'
      );
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // حفظ سياسات الحوكمة والجلسات
  const handleSaveGeneralPolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPolicy(true);
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
          lockdownMessage,
          externalSyncEndpoint,
        },
        auditActionLabel: 'حفظ سياسات الحوكمة والجلسات من مركز التحكم الأمني',
      });
      onNotify('تم حفظ سياسات الحوكمة والجلسات وتطبيقها فوراً على كافة المستخدمين.');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر حفظ السياسات الأمنية.',
        'error'
      );
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // فحص ما إذا كانت الصلاحية مفعلة لدور معين في المسودة الحالية
  const isRolePermCheckedInDraft = (role: UserRole, perm: PermissionKey): boolean => {
    if (role === 'super_admin') return true;
    if (!isPermissionCustomizableForRole(role, perm)) return false;

    const baseHas = DEFAULT_ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
    if (role === 'supervisor' && perm === 'leave.review' && !allowSupLeaveRec) {
      return false;
    }
    if (role === 'viewer' && perm === 'reports.export') {
      return allowViewerExport && !roleMatrixDraft.viewerRevokedPerms.includes(perm);
    }
    if (role === 'operations_manager' && perm === 'integration.manage') {
      return (
        (allowOpsIntegrationSync || roleMatrixDraft.opsGrantedPerms.includes(perm)) &&
        !roleMatrixDraft.opsRevokedPerms.includes(perm)
      );
    }

    const grantedMap: Record<EditableRole, PermissionKey[]> = {
      operations_manager: roleMatrixDraft.opsGrantedPerms,
      supervisor: roleMatrixDraft.supGrantedPerms,
      delivery_rep: roleMatrixDraft.repGrantedPerms,
      viewer: roleMatrixDraft.viewerGrantedPerms,
    };
    const revokedMap: Record<EditableRole, PermissionKey[]> = {
      operations_manager: roleMatrixDraft.opsRevokedPerms,
      supervisor: roleMatrixDraft.supRevokedPerms,
      delivery_rep: roleMatrixDraft.repRevokedPerms,
      viewer: roleMatrixDraft.viewerRevokedPerms,
    };

    if (revokedMap[role].includes(perm)) return false;
    if (grantedMap[role].includes(perm)) return true;
    return baseHas;
  };

  // تبديل صلاحية لدور كامل في مصفوفة الصلاحيات التفاعلية (مع دعم الحفظ التلقائي الفوري Auto-Save)
  const handleToggleRoleMatrixCell = async (role: EditableRole, perm: PermissionKey) => {
    if (!isPermissionCustomizableForRole(role, perm)) return;

    const nextAllowSup =
      role === 'supervisor' && perm === 'leave.review'
        ? !allowSupLeaveRec
        : allowSupLeaveRec;
    const nextAllowViewerExp =
      role === 'viewer' && perm === 'reports.export'
        ? !allowViewerExport
        : allowViewerExport;
    const nextAllowOpsSync =
      role === 'operations_manager' && perm === 'integration.manage'
        ? !allowOpsIntegrationSync
        : allowOpsIntegrationSync;

    if (role === 'supervisor' && perm === 'leave.review') {
      setAllowSupLeaveRec(nextAllowSup);
    }
    if (role === 'viewer' && perm === 'reports.export') {
      setAllowViewerExport(nextAllowViewerExp);
    }
    if (role === 'operations_manager' && perm === 'integration.manage') {
      setAllowOpsIntegrationSync(nextAllowOpsSync);
    }

    const currentlyEnabled = isRolePermCheckedInDraft(role, perm);
    const baseHas = DEFAULT_ROLE_PERMISSIONS[role]?.includes(perm) ?? false;

    const pairKeyMap: Record<
      EditableRole,
      {
        grantKey: keyof typeof roleMatrixDraft;
        revokeKey: keyof typeof roleMatrixDraft;
      }
    > = {
      operations_manager: {
        grantKey: 'opsGrantedPerms',
        revokeKey: 'opsRevokedPerms',
      },
      supervisor: {
        grantKey: 'supGrantedPerms',
        revokeKey: 'supRevokedPerms',
      },
      delivery_rep: {
        grantKey: 'repGrantedPerms',
        revokeKey: 'repRevokedPerms',
      },
      viewer: {
        grantKey: 'viewerGrantedPerms',
        revokeKey: 'viewerRevokedPerms',
      },
    };

    const { grantKey, revokeKey } = pairKeyMap[role];
    const grants = new Set(roleMatrixDraft[grantKey]);
    const revokes = new Set(roleMatrixDraft[revokeKey]);

    if (currentlyEnabled) {
      grants.delete(perm);
      if (baseHas) revokes.add(perm);
    } else {
      revokes.delete(perm);
      if (!baseHas) grants.add(perm);
    }

    const nextDraft = {
      ...roleMatrixDraft,
      [grantKey]: Array.from(grants),
      [revokeKey]: Array.from(revokes),
    };
    setRoleMatrixDraft(nextDraft);

    if (autoSaveMatrix) {
      setIsSavingPolicy(true);
      try {
        await saveSecurityPolicySettings({
          actor: currentUser,
          settings: {
            ...securityPolicy,
            allowSupervisorLeaveRecommendation: nextAllowSup,
            allowViewerExport: nextAllowViewerExp,
            allowOpsIntegrationSync: nextAllowOpsSync,
            ...nextDraft,
          },
          auditActionLabel: `تعديل تلقائي لمصفوفة دور (${ROLE_SHORT_LABELS_AR[role]}) — الصلاحية (${perm})`,
        });
        onNotify(
          `تم ${currentlyEnabled ? 'سحب' : 'تفعيل'} صلاحية (${perm}) لدور ${ROLE_SHORT_LABELS_AR[role]} تلقائياً وبأثر فوري.`
        );
      } catch (err) {
        onNotify(
          err instanceof Error ? err.message : 'تعذر الحفظ التلقائي للمصفوفة.',
          'error'
        );
      } finally {
        setIsSavingPolicy(false);
      }
    }
  };

  const handleSaveRoleMatrix = async () => {
    setIsSavingPolicy(true);
    try {
      await saveSecurityPolicySettings({
        actor: currentUser,
        settings: {
          ...securityPolicy,
          allowSupervisorLeaveRecommendation: allowSupLeaveRec,
          allowViewerExport,
          allowOpsIntegrationSync,
          ...roleMatrixDraft,
        },
        auditActionLabel: 'تحديث مصفوفة الصلاحيات العامة للأدوار (RBAC Matrix)',
      });
      onNotify('تم حفظ وتعميم مصفوفة الصلاحيات الجديدة على جميع الأدوار في النظام بنجاح.');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر حفظ مصفوفة الصلاحيات.',
        'error'
      );
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const handleResetRoleMatrixToDefault = async () => {
    const cleanMatrix = {
      opsGrantedPerms: [] as PermissionKey[],
      opsRevokedPerms: [] as PermissionKey[],
      supGrantedPerms: [] as PermissionKey[],
      supRevokedPerms: [] as PermissionKey[],
      repGrantedPerms: [] as PermissionKey[],
      repRevokedPerms: [] as PermissionKey[],
      viewerGrantedPerms: [] as PermissionKey[],
      viewerRevokedPerms: [] as PermissionKey[],
    };
    setRoleMatrixDraft(cleanMatrix);
    setAllowSupLeaveRec(true);
    setAllowViewerExport(true);
    setAllowOpsIntegrationSync(false);

    setIsSavingPolicy(true);
    try {
      await saveSecurityPolicySettings({
        actor: currentUser,
        settings: {
          ...securityPolicy,
          allowSupervisorLeaveRecommendation: true,
          allowViewerExport: true,
          allowOpsIntegrationSync: false,
          ...cleanMatrix,
        },
        auditActionLabel: 'استعادة الضبط القياسي لمصفوفة صلاحيات الأدوار',
      });
      onNotify('تمت استعادة الضبط القياسي لجميع صلاحيات الأدوار الخمسة.');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر استعادة الضبط الافتراضي.',
        'error'
      );
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // إعادة تفعيل حساب معطل مباشرة من غرفة القيادة
  const handleQuickReviveUser = async (target: UserProfile) => {
    try {
      await updateUserAccountByAdmin({
        actor: currentUser,
        targetUser: target,
        updates: {
          name: target.name,
          role: target.role,
          status: 'active',
          teamId: target.teamId,
          employeeId: target.employeeId,
          extraPermissions: target.extraPermissions || [],
          revokedPermissions: target.revokedPermissions || [],
        },
        reason: 'إعادة تفعيل فوري من غرفة القيادة الأمنية',
      });
      onNotify(`تمت إعادة تفعيل حساب "${target.name}" بنجاح.`);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر تفعيل الحساب.',
        'error'
      );
    }
  };

  // مزامنة خارجية عبر الخادم الخلفي الآمن
  const handleRunExternalSync = async () => {
    const trimmed = externalSyncEndpoint.trim();
    if (!trimmed) {
      onNotify('يرجى إدخال رابط HTTPS لنقطة بيانات الشركة أولاً أو استخدام استيراد JSON.', 'warning');
      return;
    }

    setIsSyncingExternal(true);
    try {
      const response = await fetch('/api/external-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointUrl: trimmed,
          actorRole: currentUser.role,
          actorStatus: currentUser.status,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      if (Array.isArray(payload.employees)) {
        const res = await migrateLocalDataToFirestore({
          actor: currentUser,
          employees: payload.employees,
          attendanceRecords: payload.attendanceRecords || {},
          sourceLabel: 'مزامنة خارجية مباشرة من مركز التحكم الأمني',
          markAsExternalSync: true,
        });
        await saveSecurityPolicySettings({
          actor: currentUser,
          settings: {
            ...securityPolicy,
            externalSyncEndpoint: trimmed,
            lastExternalSyncStatus: 'نجاح المزامنة الآمنة',
            lastExternalSyncImported: res.importedEmployees,
            lastExternalSyncFailed: payload.stats?.failedCount || 0,
            lastExternalSyncTime: new Date().toLocaleString('ar-EG'),
          },
          auditActionLabel: 'تشغيل مزامنة البيانات الخارجية من مركز التحكم الأمني',
        });
        onNotify(
          `تمت مزامنة ${res.importedEmployees} مندوب و ${res.importedAttendance} سجل شفت بنجاح.`
        );
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر الاتصال بنقطة المزامنة الخارجية.',
        'error'
      );
    } finally {
      setIsSyncingExternal(false);
    }
  };

  // تصدير نسخة احتياطية شاملة للنظام
  const handleExportFullBackup = () => {
    const backup = {
      version: '3.0-super-admin-security-hub',
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser.email,
      securityPolicy,
      teams,
      employees,
      attendanceRecords,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `نسخة_احتياطية_شاملة_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify('تم تصدير النسخة الاحتياطية الشاملة (JSON) بنجاح.');
  };

  // استيراد نسخة احتياطية JSON
  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || ''));
        if (!Array.isArray(parsed.employees)) {
          onNotify('ملف JSON غير صالح: لا يحتوي على مصفوفة المندوبين (employees).', 'error');
          return;
        }
        const res = await migrateLocalDataToFirestore({
          actor: currentUser,
          employees: parsed.employees,
          attendanceRecords: parsed.attendanceRecords || {},
          sourceLabel: 'استعادة نسخة احتياطية JSON من مركز التحكم الأمني',
        });
        onNotify(
          `تم استيراد ${res.importedEmployees} مندوب و ${res.importedAttendance} سجل حضور بنجاح.`
        );
      } catch {
        onNotify('تعذر قراءة ملف النسخة الاحتياطية JSON.', 'error');
      }
    };
    reader.readAsText(file);
  };

  // تفريغ آمن للبيانات التشغيلية بتأكيد نصي صريح
  const handleResetOperationalData = async () => {
    if (resetPhrase.trim() !== 'مسح البيانات') {
      onNotify('يرجى كتابة عبارة "مسح البيانات" بدقة لتأكيد التفريغ.', 'warning');
      return;
    }
    try {
      await clearAllOperationalDataFirestore({
        actor: currentUser,
        employees,
        attendanceRecords,
      });
      setResetPhrase('');
      setShowResetBox(false);
      onNotify('تم تفريغ سجلات المندوبين والحضور وتوثيق العملية في السجل الأمني.', 'info');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر تفريغ البيانات.',
        'error'
      );
    }
  };

  // حساب بيانات المحاكي الأمني المباشر
  const simulatedSubject: UserProfile = useMemo(() => {
    if (simMode === 'existing_user') {
      return users.find((u) => u.uid === simSelectedUid) || currentUser;
    }
    return {
      uid: 'simulated_preview_uid',
      name: `معاينة دور: ${ROLE_SHORT_LABELS_AR[simRole]}`,
      email: 'preview@company.com',
      emailKey: 'preview_company_com',
      role: simRole,
      extraPermissions: [],
      revokedPermissions: [],
      teamId: simRole === 'supervisor' || simRole === 'delivery_rep' ? simTeamId : '',
      employeeId: simRole === 'delivery_rep' ? simEmployeeId : '',
      status: 'active',
      createdAt: '',
      updatedAt: '',
      lastLoginAt: '',
    };
  }, [simMode, simSelectedUid, users, currentUser, simRole, simTeamId, simEmployeeId]);

  const simulatedEffectivePerms = useMemo(
    () => resolveEffectivePermissions(simulatedSubject, securityPolicy),
    [simulatedSubject, securityPolicy]
  );

  const simulatedVisibleEmployees = useMemo(
    () => employees.filter((emp) => canViewEmployee(simulatedSubject, emp, securityPolicy)),
    [employees, simulatedSubject, securityPolicy]
  );

  const tabs: {
    id: SecurityHubTab;
    label: string;
    icon: React.ReactNode;
    badge?: number | string;
  }[] = [
    {
      id: 'overview',
      label: 'غرفة القيادة والطوارئ',
      icon: <ShieldCheck className="w-4 h-4" />,
      badge:
        securityPolicy.systemLockdownMode || securityPolicy.emergencyReadOnlyMode
          ? 'طوارئ'
          : undefined,
    },
    {
      id: 'permissions_matrix',
      label: 'مصفوفة الصلاحيات التفاعلية',
      icon: <Sliders className="w-4 h-4" />,
      badge: 34,
    },
    {
      id: 'users',
      label: 'الحسابات والصلاحيات التلقائية',
      icon: <Users className="w-4 h-4" />,
      badge: users.length + pendingInvitationsCount,
    },
    {
      id: 'teams',
      label: 'الفرق ونطاق البيانات',
      icon: <Network className="w-4 h-4" />,
      badge: teams.length,
    },
    {
      id: 'integration',
      label: 'الربط والنسخ الاحتياطي',
      icon: <Globe className="w-4 h-4" />,
    },
    {
      id: 'audit_and_simulator',
      label: 'السجل الأمني ومحاكي الصلاحيات',
      icon: <FileText className="w-4 h-4" />,
      badge: auditLogs.length,
    },
  ];

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-[1900px] w-full mx-auto space-y-5 text-xs">
      {/* اللافتة الرئيسية لمركز التحكم الأمني الشامل */}
      <div className="bg-slate-900 dark:bg-slate-950 text-white border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-indigo-400 font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
              حصرياً لحساب المسؤول الرئيسي (Super Admin Command Center)
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
              مركز التحكم الأمني الشامل وإدارة الصلاحيات
            </h1>
            <p className="text-slate-300 text-xs max-w-3xl leading-relaxed">
              منصة موحدة للتحكم الفوري في كامل المنظومة الأمنية: أوامر الطوارئ وقفل النظام، تعديل مصفوفة الصلاحيات للأدوار الخمسة، إنشاء وتعطيل وحذف الحسابات، عزل نطاق الفرق، والرقابة على السجل الأمني.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                securityPolicy.systemLockdownMode
                  ? 'bg-rose-950/90 border-rose-700 text-rose-200'
                  : securityPolicy.emergencyReadOnlyMode
                  ? 'bg-amber-950/90 border-amber-700 text-amber-200'
                  : 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>
                الحالة الأمنية:{' '}
                {securityPolicy.systemLockdownMode
                  ? 'قفل شامل نشط (System Lockdown)'
                  : securityPolicy.emergencyReadOnlyMode
                  ? 'تجميد التعديلات نشط (Read-Only)'
                  : 'تشغيل آمن ومستقر (Zero-Trust Active)'}
              </span>
            </div>
          </div>
        </div>

        {/* شريط التبويبات الموحد داخل مركز التحكم الأمني */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/80'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold ${
                      tab.badge === 'طوارئ'
                        ? 'bg-rose-500 text-white'
                        : isActive
                        ? 'bg-indigo-800 text-indigo-100'
                        : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* التبويب 1: غرفة القيادة وأوامر الطوارئ والسياسات */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* بطاقات المؤشرات الأمنية الحية */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-slate-500 dark:text-slate-400 block">حسابات نشطة</span>
              <div className="text-2xl font-extrabold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                {activeUsersCount}
              </div>
              <span className="text-[11px] text-slate-400">من أصل {users.length} مسجل</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-slate-500 dark:text-slate-400 block">حسابات معطلة</span>
              <div className="text-2xl font-extrabold font-mono text-rose-700 dark:text-rose-400 mt-1">
                {disabledUsers.length}
              </div>
              <span className="text-[11px] text-slate-400">محجوبة فوراً</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-slate-500 dark:text-slate-400 block">دعوات معلقة</span>
              <div className="text-2xl font-extrabold font-mono text-amber-700 dark:text-amber-400 mt-1">
                {pendingInvitationsCount}
              </div>
              <span className="text-[11px] text-slate-400">بانتظار أول دخول</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-slate-500 dark:text-slate-400 block">الفرق المعزولة</span>
              <div className="text-2xl font-extrabold font-mono text-indigo-700 dark:text-indigo-400 mt-1">
                {teams.length}
              </div>
              <span className="text-[11px] text-slate-400">نطاق إشراف مستقل</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-slate-500 dark:text-slate-400 block">أحداث أمنية مسجلة</span>
              <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white mt-1">
                {securityEventsCount}
              </div>
              <span className="text-[11px] text-slate-400">في سجل Audit Log</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-slate-500 dark:text-slate-400 block">محاولات مرفوضة/فاشلة</span>
              <div className="text-2xl font-extrabold font-mono text-rose-700 dark:text-rose-400 mt-1">
                {deniedEventsCount}
              </div>
              <span className="text-[11px] text-slate-400">رصد تلقائي</span>
            </div>
          </div>

          {/* مفاتيح الطوارئ الفورية + سياسات الحوكمة */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* مفاتيح السيطرة الطارئة (تطبق على الواجهة وقواعد Firestore معاً) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  مفاتيح السيطرة الأمنية الفورية (Emergency Switches)
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                  تطبيق فوري على السحابة
                </span>
              </div>

              {/* مفتاح 1: تجميد التعديلات الشامل */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  securityPolicy.emergencyReadOnlyMode
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                      وضع تجميد التعديلات لغير مدير النظام (Read-Only Freeze)
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      يوقف فوراً جميع عمليات الإضافة أو التعديل أو الاعتماد لمديري التشغيل والمشرفين والمندوبين على مستوى الواجهة وقواعد Firestore، بينما يحتفظ حسابك (Super Admin) بكامل الصلاحيات.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSavingPolicy}
                    onClick={handleToggleEmergencyReadOnly}
                    className={`px-4 py-2 rounded-lg font-bold text-white shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                      securityPolicy.emergencyReadOnlyMode
                        ? 'bg-emerald-600 hover:bg-emerald-500'
                        : 'bg-amber-600 hover:bg-amber-500'
                    }`}
                  >
                    {securityPolicy.emergencyReadOnlyMode ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        إلغاء التجميد
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        تجميد التعديلات الآن
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* مفتاح 2: قفل النظام الشامل */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  securityPolicy.systemLockdownMode
                    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                      قفل النظام المؤقت (System Lockdown Mode)
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      يخرج جميع المستخدمين الحاليين (ما عدا Super Admin) ويعرض لهم رسالة الصيانة الأمنية أدناه لحين إلغاء القفل من قِبلك.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSavingPolicy}
                    onClick={handleToggleSystemLockdown}
                    className={`px-4 py-2 rounded-lg font-bold text-white shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                      securityPolicy.systemLockdownMode
                        ? 'bg-emerald-600 hover:bg-emerald-500'
                        : 'bg-rose-600 hover:bg-rose-500'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {securityPolicy.systemLockdownMode
                      ? 'فتح النظام للمستخدمين'
                      : 'قفل النظام مؤقتاً'}
                  </button>
                </div>

                <div>
                  <label className="font-bold block mb-1 text-slate-700 dark:text-slate-200">
                    رسالة الإغلاق التي تظهر للمستخدمين عند تفعيل القفل:
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={lockdownMessage}
                    onChange={(e) => setLockdownMessage(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    placeholder="النظام في وضع الصيانة الأمنية المؤقتة بأمر من مدير النظام..."
                  />
                </div>
              </div>

              {/* مفتاح 3: التسجيل التلقائي وتغيير الصلاحيات بدون دعوة مسبقة */}
              <div className="p-4 rounded-xl border bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      التسجيل التلقائي وتعديل الصلاحيات بدون دعوة
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      يسمح لأي مستخدم موثق بتسجيل الدخول مباشرة بدون الحاجة لإرسال دعوة، فيظهر فوراً في جدول المستخدمين لتتمكن من تغيير دوره وصلاحياته تلقائياً وبأثر لحظي.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSavingPolicy}
                    onClick={() =>
                      handleAutoProvisionPolicyChange({
                        autoProvisionWithoutInvite: !securityPolicy.autoProvisionWithoutInvite,
                      })
                    }
                    className={`px-4 py-2 rounded-lg font-bold text-white shrink-0 transition-colors cursor-pointer disabled:opacity-50 ${
                      securityPolicy.autoProvisionWithoutInvite
                        ? 'bg-emerald-600 hover:bg-emerald-500'
                        : 'bg-slate-600 hover:bg-slate-500'
                    }`}
                  >
                    {securityPolicy.autoProvisionWithoutInvite
                      ? 'مفعل (بدون دعوة)'
                      : 'مغلق (بدعوة فقط)'}
                  </button>
                </div>

                {securityPolicy.autoProvisionWithoutInvite && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="font-bold block mb-1 text-slate-700 dark:text-slate-200">
                        الدور المبدئي التلقائي عند أول دخول:
                      </label>
                      <select
                        disabled={isSavingPolicy}
                        value={securityPolicy.autoProvisionDefaultRole}
                        onChange={(e) =>
                          handleAutoProvisionPolicyChange({
                            autoProvisionDefaultRole: e.target
                              .value as SecurityPolicySettings['autoProvisionDefaultRole'],
                          })
                        }
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 font-bold"
                      >
                        <option value="viewer">مراقب / قراءة فقط (الأكثر أماناً افتراضياً)</option>
                        <option value="delivery_rep">مندوب توصيل</option>
                        <option value="supervisor">مشرف فريق</option>
                        <option value="operations_manager">مدير التشغيل</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold block mb-1 text-slate-700 dark:text-slate-200">
                        حالة الحساب التلقائية فور الدخول:
                      </label>
                      <select
                        disabled={isSavingPolicy}
                        value={securityPolicy.autoProvisionDefaultStatus}
                        onChange={(e) =>
                          handleAutoProvisionPolicyChange({
                            autoProvisionDefaultStatus: e.target
                              .value as SecurityPolicySettings['autoProvisionDefaultStatus'],
                          })
                        }
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 font-bold"
                      >
                        <option value="active">نشط فوراً (يدخل مباشرة وتعدل صلاحياته حياً)</option>
                        <option value="pending">معلق مؤقتاً (يظهر في القائمة وتفعله بضغطة)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* اختصارات الوصول السريع لأقسام التحكم */}
              <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => selectTab('users')}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-center transition-colors"
                >
                  صلاحيات المستخدمين التلقائية
                </button>
                <button
                  type="button"
                  onClick={() => selectTab('permissions_matrix')}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-center transition-colors"
                >
                  تعديل مصفوفة الصلاحيات
                </button>
                <button
                  type="button"
                  onClick={() => selectTab('teams')}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-center transition-colors"
                >
                  إدارة الفرق والمشرفين
                </button>
                <button
                  type="button"
                  onClick={() => selectTab('audit_and_simulator')}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-center transition-colors"
                >
                  فحص صلاحيات مستخدم
                </button>
              </div>
            </div>

            {/* سياسات الجلسات والحوكمة العامة */}
            <form
              onSubmit={handleSaveGeneralPolicies}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3.5">
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  ضوابط الجلسات والسياسات التشغيلية
                </h2>

                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowSupLeaveRec}
                    onChange={(e) => setAllowSupLeaveRec(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-bold">تمكين المشرفين من رفع توصية على طلبات الإجازات</div>
                    <p className="text-slate-500 mt-0.5">
                      يسمح للمشرف بمراجعة طلبات مندوبي فريقه فقط دون اعتماد نهائي.
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
                    <div className="font-bold">السماح لدور المراقب (Viewer) بتصدير تقارير Excel / CSV</div>
                    <p className="text-slate-500 mt-0.5">
                      مع بقاء حساب المراقب محجوباً تماماً عن أي تعديل أو إضافة.
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
                    <div className="font-bold">تفويض مدير التشغيل بتشغيل مزامنة الشفتات الخارجية</div>
                    <p className="text-slate-500 mt-0.5">
                      يمنح مدير التشغيل زر تشغيل المزامنة دون السماح له بتغيير عنوان نقطة الربط.
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
                    <div className="font-bold">تفعيل شريط تذكير التحقق بخطوتين (2FA / MFA) للإدارة</div>
                    <p className="text-slate-500 mt-0.5">
                      تنبيه أمني مستمر لحسابات الإدارة لتأمين البريد المؤسسي.
                    </p>
                  </div>
                </label>

                <div className="space-y-2 pt-1">
                  <label className="font-bold block">
                    مهلة إنهاء الجلسة التلقائي عند الخمول (بالدقائق):
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {[15, 30, 60, 120, 480].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setSessionTimeoutMinutes(mins)}
                        className={`px-3 py-1.5 rounded-lg border font-mono font-bold transition-colors ${
                          sessionTimeoutMinutes === mins
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {mins} د
                      </button>
                    ))}
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={sessionTimeoutMinutes}
                      onChange={(e) => setSessionTimeoutMinutes(Number(e.target.value) || 60)}
                      className="w-24 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 font-mono text-center"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingPolicy}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isSavingPolicy ? 'جارٍ الحفظ...' : 'حفظ سياسات الحوكمة والجلسات'}
                </button>
              </div>
            </form>
          </div>

          {/* قائمة الحسابات المعطلة مع زر إعادة التفعيل المباشر */}
          {disabledUsers.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/70 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                حسابات معطلة حالياً ({disabledUsers.length}) — يمكنك إعادة تفعيلها بضغطة واحدة
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {disabledUsers.map((u) => (
                  <div
                    key={u.uid}
                    className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{u.name}</div>
                      <div className="font-mono text-[11px] text-slate-500" dir="ltr">
                        {u.email}
                      </div>
                      <div className="text-[10px] text-rose-700 dark:text-rose-300 font-bold mt-0.5">
                        {ROLE_SHORT_LABELS_AR[u.role]}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickReviveUser(u)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] shrink-0"
                    >
                      إعادة تفعيل
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* التبويب 2: مصفوفة الصلاحيات التفاعلية المباشرة للأدوار الخمسة */}
      {activeTab === 'permissions_matrix' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                التحكم المباشر في مصفوفة صلاحيات الأدوار (Interactive Role Matrix — 34 صلاحية)
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                قم بتفعيل أو إلغاء أي صلاحية لأي دور مباشرةً من الجدول ثم اضغط "حفظ وتعميم مصفوفة الصلاحيات". الخانات المقفلة تمثل السقف الأمني الإلزامي لمنع تصعيد الصلاحيات.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSaveMatrix}
                  onChange={(e) => setAutoSaveMatrix(e.target.checked)}
                  className="rounded"
                />
                <Zap className="w-3.5 h-3.5" />
                <span>حفظ وتعميم تلقائي فوري</span>
              </label>

              <select
                value={matrixGroupFilter}
                onChange={(e) => setMatrixGroupFilter(e.target.value)}
                className="border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
              >
                <option value="all">كل مجموعات الصلاحيات (34)</option>
                {permissionGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={isSavingPolicy}
                onClick={handleResetRoleMatrixToDefault}
                className="px-3.5 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-bold flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                استعادة الضبط القياسي
              </button>

              {!autoSaveMatrix && (
                <button
                  type="button"
                  disabled={isSavingPolicy}
                  onClick={handleSaveRoleMatrix}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSavingPolicy ? 'جارٍ التعميم...' : 'حفظ وتعميم مصفوفة الصلاحيات'}
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="p-3">المجموعة</th>
                  <th className="p-3">الصلاحية الوظيفية</th>
                  <th className="p-3">المفتاح البرمجي</th>
                  {ROLES_ORDER.map((r) => (
                    <th key={r} className="p-3 text-center min-w-[115px]">
                      <div>{ROLE_SHORT_LABELS_AR[r]}</div>
                      <div className="text-[10px] font-normal text-slate-500">
                        {r === 'super_admin' ? 'صلاحية مطلقة ثابتة' : 'قابل للتخصيص'}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {ALL_PERMISSIONS.filter(
                  (p) => matrixGroupFilter === 'all' || p.group === matrixGroupFilter
                ).map((perm) => (
                  <tr
                    key={perm.key}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="p-2.5 text-slate-500 font-medium">{perm.group}</td>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">
                      {perm.label}
                    </td>
                    <td className="p-2.5 font-mono text-[11px] text-slate-500">
                      {perm.key}
                    </td>
                    {ROLES_ORDER.map((role) => {
                      if (role === 'super_admin') {
                        return (
                          <td key={role} className="p-2.5 text-center">
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400"
                              title="مدير النظام يمتلك هذه الصلاحية دائماً"
                            >
                              <Check className="w-4 h-4" />
                            </span>
                          </td>
                        );
                      }

                      const customizable = isPermissionCustomizableForRole(role, perm.key);
                      const checked = isRolePermCheckedInDraft(role, perm.key);
                      const isDefault =
                        DEFAULT_ROLE_PERMISSIONS[role]?.includes(perm.key) ?? false;
                      const isModified = customizable && checked !== isDefault;

                      if (!customizable) {
                        return (
                          <td key={role} className="p-2.5 text-center">
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800/70 text-slate-300 dark:text-slate-700 cursor-not-allowed"
                              title="محجوب بسقف الأمان الأساسي لهذا الدور"
                            >
                              <X className="w-3.5 h-3.5" />
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td key={role} className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleRoleMatrixCell(role, perm.key)}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all cursor-pointer ${
                              checked
                                ? isModified
                                  ? 'bg-indigo-600 border-indigo-700 text-white ring-2 ring-indigo-300 dark:ring-indigo-900'
                                  : 'bg-emerald-600 border-emerald-700 text-white'
                                : isModified
                                ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-400 text-rose-600 dark:text-rose-400'
                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400 hover:border-indigo-400'
                            }`}
                            title={
                              checked
                                ? 'مفعلة لهذا الدور (اضغط لإلغاء التفعيل)'
                                : 'غير مفعلة لهذا الدور (اضغط لمنح الصلاحية)'
                            }
                          >
                            {checked ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* التبويب 3: إدارة المستخدمين والدعوات والصلاحيات الفردية */}
      {activeTab === 'users' && (
        <UserManagementPage
          embedded
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          users={users}
          invitations={invitations}
          employees={employees}
          teams={teams}
          onSendPasswordReset={onSendPasswordReset}
          onNotify={onNotify}
        />
      )}

      {/* التبويب 4: إدارة الفرق والمشرفين وعزل نطاق البيانات */}
      {activeTab === 'teams' && (
        <TeamsManagementPage
          embedded
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          teams={teams}
          users={users}
          employees={employees}
          attendanceRecords={attendanceRecords}
          onNotify={onNotify}
        />
      )}

      {/* التبويب 5: الربط الخارجي والنسخ الاحتياطي الشامل وإعادة الضبط */}
      {activeTab === 'integration' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              الربط الآمن مع نظام / موقع الشركة الخارجي
            </h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              تتم المزامنة عبر الخادم الخلفي الآمن (<code className="font-mono">/api/external-sync</code>) دون تخزين أي مفاتيح API أو رموز سرية في المتصفح أو Firestore.
            </p>

            <div>
              <label className="font-bold block mb-1">
                رابط نقطة بيانات الشفتات الخارجية (HTTPS Endpoint)
              </label>
              <input
                type="url"
                dir="ltr"
                value={externalSyncEndpoint}
                onChange={(e) => setExternalSyncEndpoint(e.target.value)}
                placeholder="https://api.company.com/v1/shifts"
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 font-mono text-left"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-slate-500 block">حالة آخر مزامنة</span>
                <strong>{securityPolicy.lastExternalSyncStatus || 'جاهز'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">توقيت آخر مزامنة</span>
                <strong className="font-mono">{securityPolicy.lastExternalSyncTime || '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">السجلات المستوردة</span>
                <strong className="font-mono text-emerald-600">
                  {securityPolicy.lastExternalSyncImported}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">السجلات المرفوضة</span>
                <strong className="font-mono text-rose-600">
                  {securityPolicy.lastExternalSyncFailed}
                </strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={isSavingPolicy}
                onClick={handleSaveGeneralPolicies}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-bold flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                حفظ رابط الربط
              </button>
              <button
                type="button"
                disabled={isSyncingExternal}
                onClick={handleRunExternalSync}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingExternal ? 'animate-spin' : ''}`} />
                {isSyncingExternal ? 'جارٍ المزامنة...' : 'تشغيل المزامنة الآن'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                النسخ الاحتياطي الشامل واستعادة البيانات (JSON)
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                يمكنك تنزيل نسخة احتياطية كاملة تضم سياسات الأمان والفرق والمندوبين وسجلات الشفتات، أو استعادة نسخة سابقة مباشرة إلى قاعدة البيانات السحابية.
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleExportFullBackup}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  تصدير نسخة احتياطية شاملة (JSON)
                </button>
                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-bold flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  استيراد ملف بيانات (JSON)
                </button>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportBackupFile}
                  className="hidden"
                />
              </div>
            </div>

            {/* منطقة الخطر المحمية لمدير النظام فقط */}
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 space-y-3">
              <div className="font-extrabold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                منطقة حساسة: تفريغ السجلات التشغيلية (المندوبين والحضور فقط)
              </div>
              <p className="text-rose-800 dark:text-rose-300 leading-relaxed">
                يحذف سجلات المندوبين والحضور التجريبية مع الحفاظ التام على حسابات المستخدمين والفرق وسجل المراجعة الأمني.
              </p>
              {!showResetBox ? (
                <button
                  type="button"
                  onClick={() => setShowResetBox(true)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold"
                >
                  طلب تفريغ البيانات التشغيلية...
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={resetPhrase}
                    onChange={(e) => setResetPhrase(e.target.value)}
                    placeholder='اكتب "مسح البيانات" للتأكيد'
                    className="border border-rose-400 dark:border-rose-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleResetOperationalData}
                    className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg font-bold"
                  >
                    تأكيد المسح النهائي
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetBox(false);
                      setResetPhrase('');
                    }}
                    className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* التبويب 6: محاكي فحص الصلاحيات المباشر + سجل العمليات الأمنية */}
      {activeTab === 'audit_and_simulator' && (
        <div className="space-y-6">
          {/* محاكي فحص الصلاحيات ونطاق البيانات */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  محاكي فحص الصلاحيات ونطاق الرؤية المباشر (Live RBAC Simulator)
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  اختر أي مستخدم فعلي أو أي دور وظيفي للتحقق فوراً من الصفحات والصلاحيات والمندوبين المسموح له برؤيتهم في ظل إعداداتك الحالية.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSimMode('existing_user')}
                  className={`px-3 py-1.5 rounded-md font-bold transition-colors ${
                    simMode === 'existing_user'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  فحص حساب مستخدم مسجل
                </button>
                <button
                  type="button"
                  onClick={() => setSimMode('role_preview')}
                  className={`px-3 py-1.5 rounded-md font-bold transition-colors ${
                    simMode === 'role_preview'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  محاكاة دور افتراضي
                </button>
              </div>
            </div>

            {simMode === 'existing_user' ? (
              <div className="max-w-md">
                <label className="font-bold block mb-1">اختر المستخدم المراد فحص صلاحياته:</label>
                <select
                  value={simSelectedUid}
                  onChange={(e) => setSimSelectedUid(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                >
                  {users.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.name} ({u.email}) — {ROLE_SHORT_LABELS_AR[u.role]} [{u.status}]
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold block mb-1">الدور المراد محاكاته:</label>
                  <select
                    value={simRole}
                    onChange={(e) => setSimRole(e.target.value as UserRole)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                  >
                    {ROLES_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS_AR[r]}
                      </option>
                    ))}
                  </select>
                </div>
                {(simRole === 'supervisor' || simRole === 'delivery_rep') && (
                  <div>
                    <label className="font-bold block mb-1">الفريق المخصص للمحاكاة:</label>
                    <select
                      value={simTeamId}
                      onChange={(e) => setSimTeamId(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                    >
                      <option value="">— بدون فريق —</option>
                      {teams.map((t) => (
                        <option key={t.teamId} value={t.teamId}>
                          {t.teamName} ({t.teamId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {simRole === 'delivery_rep' && (
                  <div>
                    <label className="font-bold block mb-1">سجل المندوب المرتبط:</label>
                    <select
                      value={simEmployeeId}
                      onChange={(e) => setSimEmployeeId(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                    >
                      <option value="">— غير مرتبط —</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.fullName} ({emp.employeeCode})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* نتائج الفحص الفوري */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="font-extrabold text-slate-900 dark:text-white">
                  الصفحات المسموح الوصول إليها
                </div>
                <div className="space-y-1.5">
                  {SIMULATED_ROUTES.map((item) => {
                    const allowed = canAccessRoute(
                      simulatedSubject,
                      item.route,
                      securityPolicy
                    );
                    return (
                      <div
                        key={item.route}
                        className="flex items-center justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60 last:border-b-0"
                      >
                        <span>{item.label}</span>
                        {allowed ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            مسموح
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                            <Lock className="w-3.5 h-3.5" />
                            محجوب
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="font-extrabold text-slate-900 dark:text-white">
                  الصلاحيات الفعلية النشطة ({simulatedEffectivePerms.size} من 34)
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pt-1">
                  {simulatedEffectivePerms.size === 0 ? (
                    <span className="text-rose-600 font-bold">
                      لا توجد أي صلاحيات نشطة (الحساب معطل أو النظام في وضع قفل شامل).
                    </span>
                  ) : (
                    Array.from(simulatedEffectivePerms).map((pk) => (
                      <span
                        key={pk}
                        className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200 font-mono text-[10px]"
                      >
                        {pk}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="font-extrabold text-slate-900 dark:text-white">
                  نطاق رؤية المندوبين (Data Scope)
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  يرى هذا الحساب{' '}
                  <strong className="font-mono text-indigo-600 dark:text-indigo-400 text-sm">
                    {simulatedVisibleEmployees.length}
                  </strong>{' '}
                  مندوب من أصل <strong className="font-mono">{employees.length}</strong> مسجلين في النظام.
                </p>
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-200/60 dark:divide-slate-700/60 text-[11px]">
                  {simulatedVisibleEmployees.slice(0, 12).map((emp) => (
                    <div key={emp.id} className="py-1 flex justify-between">
                      <span className="font-bold">{emp.fullName}</span>
                      <span className="font-mono text-slate-500">
                        {emp.employeeCode} {emp.teamId ? `(${emp.teamId})` : ''}
                      </span>
                    </div>
                  ))}
                  {simulatedVisibleEmployees.length > 12 && (
                    <div className="pt-1 text-slate-400">
                      + {simulatedVisibleEmployees.length - 12} مندوب آخر ضمن النطاق...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* سجل العمليات الأمنية والتشغيلية غير القابل للتعديل */}
          <AuditLogsPage
            embedded
            currentUser={currentUser}
            securityPolicy={securityPolicy}
            logs={auditLogs}
            onNotify={onNotify}
          />
        </div>
      )}
    </main>
  );
};
