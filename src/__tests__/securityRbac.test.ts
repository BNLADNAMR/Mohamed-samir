import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  canAccessRoute,
  canRecordOrEditAttendance,
  canReviewOrApproveRequest,
  canViewEmployee,
  DEFAULT_SECURITY_POLICY,
  hasPermission,
  resolveEffectivePermissions,
} from '../utils/rbac';
import {
  AttendanceRecord,
  Employee,
  UserProfile,
  WorkflowRequest,
} from '../types';

function makeUser(overrides: Partial<UserProfile>): UserProfile {
  return {
    uid: 'u_default',
    name: 'مستخدم اختبار',
    email: 'test@company.com',
    emailKey: 'test_company_com',
    role: 'viewer',
    extraPermissions: [],
    revokedPermissions: [],
    employeeId: '',
    teamId: '',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    lastLoginAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const empTeamA: Employee = {
  id: 'EMP001',
  employeeCode: 'EMP001',
  fullName: 'أحمد السيد',
  phone: '01000000001',
  hireDate: '2025-01-01',
  status: 'active',
  externalId: 'EXT_1001',
  teamId: 'TEAM_A',
  userId: 'uid_rep_1',
  notes: '',
};

const empTeamB: Employee = {
  id: 'EMP002',
  employeeCode: 'EMP002',
  fullName: 'محمود علي',
  phone: '01000000002',
  hireDate: '2025-01-01',
  status: 'active',
  externalId: 'EXT_1002',
  teamId: 'TEAM_B',
  userId: 'uid_rep_2',
  notes: '',
};

describe('اختبارات الأمان والصلاحيات الإلزامية (RBAC & Firestore Rules Verification)', () => {
  const rulesText = fs.readFileSync(
    path.resolve(__dirname, '../../firestore.rules'),
    'utf8'
  );

  it('1. المندوب لا يستطيع قراءة بيانات مندوب آخر (عزل الهوية ونطاق البيانات)', () => {
    const rep1 = makeUser({
      uid: 'uid_rep_1',
      role: 'delivery_rep',
      employeeId: 'EMP001',
      teamId: 'TEAM_A',
    });
    expect(canViewEmployee(rep1, empTeamA)).toBe(true);
    expect(canViewEmployee(rep1, empTeamB)).toBe(false);
    expect(rulesText).toContain(
      'isDeliveryRep() && (employeeId == currentUserData().employeeId || existing().userId == request.auth.uid)'
    );
  });

  it('2. المندوب لا يستطيع تعديل حضوره أو حضور غيره حتى لو أضيفت صلاحية بالخطأ', () => {
    const rep1 = makeUser({
      uid: 'uid_rep_1',
      role: 'delivery_rep',
      employeeId: 'EMP001',
      extraPermissions: ['attendance.edit', 'attendance.record'],
    });
    expect(hasPermission(rep1, 'attendance.edit')).toBe(false);
    expect(canRecordOrEditAttendance(rep1, empTeamA)).toBe(false);
  });

  it('3. المندوب لا يستطيع فتح صفحات الإدارة أو المستخدمين أو إعدادات الأمان', () => {
    const rep1 = makeUser({
      uid: 'uid_rep_1',
      role: 'delivery_rep',
      employeeId: 'EMP001',
    });
    expect(canAccessRoute(rep1, 'my_portal')).toBe(true);
    expect(canAccessRoute(rep1, 'dashboard')).toBe(false);
    expect(canAccessRoute(rep1, 'users')).toBe(false);
    expect(canAccessRoute(rep1, 'security_settings')).toBe(false);
    expect(canAccessRoute(rep1, 'audit_logs')).toBe(false);
  });

  it('4. المشرف لا يستطيع رؤية أو تعديل فريق آخر غير معين له', () => {
    const supA = makeUser({
      uid: 'uid_sup_a',
      role: 'supervisor',
      teamId: 'TEAM_A',
    });
    expect(canViewEmployee(supA, empTeamA)).toBe(true);
    expect(canViewEmployee(supA, empTeamB)).toBe(false);
    expect(canRecordOrEditAttendance(supA, empTeamA)).toBe(true);
    expect(canRecordOrEditAttendance(supA, empTeamB)).toBe(false);
  });

  it('5. المشرف لا يستطيع تعديل صلاحياته أو دوره ولا تعديل سجلات مستوردة من النظام الخارجي مباشرة', () => {
    const supA = makeUser({
      uid: 'uid_sup_a',
      role: 'supervisor',
      teamId: 'TEAM_A',
      extraPermissions: ['users.assign_role', 'settings.manage'],
    });
    expect(hasPermission(supA, 'users.assign_role')).toBe(false);
    expect(hasPermission(supA, 'settings.manage')).toBe(false);

    const extRecord: AttendanceRecord = {
      id: 'EMP001_2026-10-10',
      employeeId: 'EMP001',
      teamId: 'TEAM_A',
      date: '2026-10-10',
      shiftSelection: 'selected',
      attendance: 'worked',
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 30,
      totalWorkedMinutes: 450,
      source: 'external_sync',
      updatedAt: '2026-10-10T18:00:00Z',
    };
    expect(canRecordOrEditAttendance(supA, empTeamA, extRecord)).toBe(false);
  });

  it('6. المشرف لا يستطيع تعديل إعدادات الربط الخارجي', () => {
    const supA = makeUser({
      uid: 'uid_sup_a',
      role: 'supervisor',
      teamId: 'TEAM_A',
    });
    expect(hasPermission(supA, 'integration.manage')).toBe(false);
    expect(canAccessRoute(supA, 'security_settings')).toBe(false);
  });

  it('7. مدير التشغيل يستطيع عرض كل الفرق والمندوبين واعتماد الطلبات المقدمة من الآخرين فقط', () => {
    const ops = makeUser({
      uid: 'uid_ops_1',
      role: 'operations_manager',
    });
    expect(canViewEmployee(ops, empTeamA)).toBe(true);
    expect(canViewEmployee(ops, empTeamB)).toBe(true);

    const repReq: WorkflowRequest = {
      requestId: 'req_1',
      employeeId: 'EMP001',
      employeeName: 'أحمد السيد',
      teamId: 'TEAM_A',
      submittedBy: 'uid_rep_1',
      submitterRole: 'delivery_rep',
      requestType: 'leave',
      requestDate: '2026-10-12',
      proposedStartTime: '',
      proposedEndTime: '',
      description: 'ظرف عائلي طارئ',
      evidenceUrl: '',
      status: 'pending',
      supervisorRecommendation: '',
      reviewedBy: '',
      reviewerName: '',
      reviewComment: '',
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
    };
    expect(canReviewOrApproveRequest(ops, repReq, 'approve_or_reject')).toBe(true);

    // منع اعتماد المستخدم لطلب قدمه بنفسه
    const selfReq: WorkflowRequest = { ...repReq, submittedBy: 'uid_ops_1' };
    expect(canReviewOrApproveRequest(ops, selfReq, 'approve_or_reject')).toBe(false);
  });

  it('8. مدير التشغيل لا يستطيع إنشاء Super Admin أو تعديل سياسات الأمان', () => {
    const ops = makeUser({
      uid: 'uid_ops_1',
      role: 'operations_manager',
      extraPermissions: ['users.create', 'users.assign_role', 'settings.manage'],
    });
    expect(hasPermission(ops, 'users.create')).toBe(false);
    expect(hasPermission(ops, 'users.assign_role')).toBe(false);
    expect(hasPermission(ops, 'settings.manage')).toBe(false);
    expect(canAccessRoute(ops, 'security_settings')).toBe(false);
  });

  it('9. المراقب (Viewer) لا يستطيع تعديل أي بيانات إطلاقاً ويكتفي بالقراءة والتصدير المسموح', () => {
    const viewer = makeUser({
      uid: 'uid_viewer_1',
      role: 'viewer',
      extraPermissions: ['employees.edit', 'attendance.edit', 'shifts.edit'],
    });
    expect(canViewEmployee(viewer, empTeamA)).toBe(true);
    expect(canRecordOrEditAttendance(viewer, empTeamA)).toBe(false);
    expect(hasPermission(viewer, 'employees.edit')).toBe(false);
    expect(hasPermission(viewer, 'reports.export', DEFAULT_SECURITY_POLICY)).toBe(true);
    expect(
      hasPermission(viewer, 'reports.export', {
        ...DEFAULT_SECURITY_POLICY,
        allowViewerExport: false,
      })
    ).toBe(false);
  });

  it('10. مدير النظام (Super Admin) يمتلك كافة الصلاحيات لإدارة المستخدمين والفرق والأمان', () => {
    const admin = makeUser({
      uid: 'uid_admin_1',
      role: 'super_admin',
    });
    expect(resolveEffectivePermissions(admin).size).toBe(34);
    expect(canAccessRoute(admin, 'users')).toBe(true);
    expect(canAccessRoute(admin, 'teams')).toBe(true);
    expect(canAccessRoute(admin, 'security_settings')).toBe(true);
    expect(canAccessRoute(admin, 'audit_logs')).toBe(true);
  });

  it('11. الحساب المعطل أو المعلق يمنع فوراً من جميع الصلاحيات والمسارات', () => {
    const disabledAdmin = makeUser({
      uid: 'uid_disabled',
      role: 'super_admin',
      status: 'disabled',
    });
    expect(resolveEffectivePermissions(disabledAdmin).size).toBe(0);
    expect(canAccessRoute(disabledAdmin, 'dashboard')).toBe(false);
    expect(canViewEmployee(disabledAdmin, empTeamA)).toBe(false);
    expect(rulesText).toContain("get(userDocPath(request.auth.uid)).data.status == 'active'");
  });

  it('12. المستخدم غير المسجل (Unauthenticated) محجوب بالكامل بشبكة الرفض الافتراضي في Firestore', () => {
    expect(resolveEffectivePermissions(null).size).toBe(0);
    expect(canAccessRoute(null, 'dashboard')).toBe(false);
    expect(rulesText).toContain('match /{document=**} {\n      allow read, write: if false;\n    }');
  });

  it('13. حماية حساب Super Admin من الحذف أو خفض الصلاحية الذاتي في قواعد Firestore', () => {
    expect(rulesText).toContain(
      "request.auth.uid != userId ||\n              (incoming().role == 'super_admin' && incoming().status == 'active')"
    );
    expect(rulesText).toContain("existing().role != 'super_admin'");
  });

  it('14. منع التلاعب بمعرف المندوب أو المستخدم في قواعد Firestore (Anti-Spoofing & Path Match)', () => {
    expect(rulesText).toContain('incoming().uid == userId');
    expect(rulesText).toContain('incoming().id == employeeId');
    expect(rulesText).toContain('incoming().employeeId == existing().employeeId');
    expect(rulesText).toContain('incoming().actorUserId == request.auth.uid');
  });

  it('15. سجل العمليات الأمنية (Audit Log) غير قابل للتعديل أو الحذف نهائياً', () => {
    const auditSection = rulesText.slice(rulesText.indexOf('match /auditLogs/{logId}'));
    expect(auditSection).toContain('allow update: if false;');
    expect(auditSection).toContain('allow delete: if false;');
  });
});
