import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  normalizeEmailToKey,
  OperationType,
} from '../firebase';
import {
  AccountStatus,
  AttendanceDataSource,
  AttendanceRecord,
  AuditLogItem,
  Employee,
  PermissionKey,
  PreprovisionedInvitation,
  SecurityPolicySettings,
  Team,
  UserProfile,
  UserRole,
  WorkflowRequest,
  WorkflowRequestType,
} from '../types';

export function formatFirestoreTimestamp(val: unknown): string {
  if (!val) return '';
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return String(val);
}

export function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

/**
 * تسجيل حدث أمني أو تشغيلي في سجل العمليات (Audit Log) بختم زمني موثوق من الخادم
 */
export async function recordAuditLog(params: {
  actor: UserProfile;
  category: 'security' | 'operational';
  action: string;
  targetType: string;
  targetId: string;
  beforeSummary?: string;
  afterSummary?: string;
  reason?: string;
  result?: 'success' | 'denied' | 'failure';
}): Promise<void> {
  const logId = sanitizeId(`log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `auditLogs/${logId}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      logId,
      actorUserId: params.actor.uid,
      actorName: params.actor.name.slice(0, 120),
      actorRole: params.actor.role,
      category: params.category,
      action: params.action.slice(0, 100),
      targetType: params.targetType.slice(0, 64),
      targetId: sanitizeId(params.targetId || 'system'),
      beforeSummary: (params.beforeSummary || '—').slice(0, 1000),
      afterSummary: (params.afterSummary || '—').slice(0, 1000),
      reason: (params.reason || '—').slice(0, 500),
      result: params.result || 'success',
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    // لا نكسر العملية الأساسية في حال انقطاع مؤقت، لكن نسجل الخطأ القياسي
    console.warn('Audit log write warning:', path, error);
  }
}

/**
 * إنشاء دعوة مستخدم مسبقة ومعتمدة من مدير النظام (منع التسجيل العام المفتوح)
 */
export async function createPreprovisionedUser(params: {
  actor: UserProfile;
  name: string;
  email: string;
  role: UserRole;
  employeeId: string;
  teamId: string;
  extraPermissions: PermissionKey[];
  revokedPermissions: PermissionKey[];
  status: AccountStatus;
}): Promise<void> {
  const cleanEmail = params.email.trim().toLowerCase();
  const emailKey = normalizeEmailToKey(cleanEmail);
  const path = `preprovisionedUsers/${emailKey}`;

  try {
    await setDoc(doc(db, 'preprovisionedUsers', emailKey), {
      emailKey,
      name: params.name.trim().slice(0, 120),
      email: cleanEmail.slice(0, 180),
      role: params.role,
      extraPermissions: params.extraPermissions.slice(0, 40),
      revokedPermissions: params.revokedPermissions.slice(0, 40),
      employeeId: sanitizeId(params.employeeId || ''),
      teamId: sanitizeId(params.teamId || ''),
      status: params.status,
      createdBy: params.actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      actor: params.actor,
      category: 'security',
      action: 'إنشاء حساب مستخدم / دعوة مصرح بها',
      targetType: 'user_invitation',
      targetId: emailKey,
      afterSummary: `البريد: ${cleanEmail} | الدور: ${params.role} | الفريق: ${params.teamId || '—'} | المندوب: ${params.employeeId || '—'}`,
      reason: 'إنشاء إداري بواسطة مدير النظام',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * تحديث حساب مستخدم فعلي (الدور، الفريق، المندوب، الحالة، الصلاحيات)
 */
export async function updateUserAccountByAdmin(params: {
  actor: UserProfile;
  targetUser: UserProfile;
  updates: {
    name: string;
    role: UserRole;
    status: AccountStatus;
    teamId: string;
    employeeId: string;
    extraPermissions: PermissionKey[];
    revokedPermissions: PermissionKey[];
  };
  reason?: string;
}): Promise<void> {
  const path = `users/${params.targetUser.uid}`;
  try {
    await updateDoc(doc(db, 'users', params.targetUser.uid), {
      name: params.updates.name.trim().slice(0, 120),
      role: params.updates.role,
      status: params.updates.status,
      teamId: sanitizeId(params.updates.teamId || ''),
      employeeId: sanitizeId(params.updates.employeeId || ''),
      extraPermissions: params.updates.extraPermissions.slice(0, 40),
      revokedPermissions: params.updates.revokedPermissions.slice(0, 40),
      updatedAt: serverTimestamp(),
    });

    // فك ارتباط سجل المندوب السابق إذا تم تغييره أو إلغاؤه
    if (
      params.targetUser.employeeId &&
      params.targetUser.employeeId !== params.updates.employeeId
    ) {
      const prevEmpRef = doc(db, 'employees', sanitizeId(params.targetUser.employeeId));
      const prevEmpSnap = await getDoc(prevEmpRef);
      if (prevEmpSnap.exists() && prevEmpSnap.data().userId === params.targetUser.uid) {
        await updateDoc(prevEmpRef, {
          userId: '',
          updatedAt: serverTimestamp(),
        });
      }
    }

    // إذا تم ربط الحساب بسجل مندوب موجود، نحدّث حقل userId على سجل المندوب دون إنشاء مندوب مكرر
    if (params.updates.employeeId) {
      const empRef = doc(db, 'employees', sanitizeId(params.updates.employeeId));
      const empSnap = await getDoc(empRef);
      if (empSnap.exists()) {
        await updateDoc(empRef, {
          userId: params.targetUser.uid,
          ...(params.updates.teamId ? { teamId: sanitizeId(params.updates.teamId) } : {}),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await recordAuditLog({
      actor: params.actor,
      category: 'security',
      action: 'تعديل حساب مستخدم وصلاحياته',
      targetType: 'user',
      targetId: params.targetUser.uid,
      beforeSummary: `الدور: ${params.targetUser.role} | الحالة: ${params.targetUser.status} | الفريق: ${params.targetUser.teamId || '—'}`,
      afterSummary: `الدور: ${params.updates.role} | الحالة: ${params.updates.status} | الفريق: ${params.updates.teamId || '—'}`,
      reason: params.reason || 'تحديث إداري للصلاحيات أو الحالة',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updatePreprovisionedInvitationByAdmin(params: {
  actor: UserProfile;
  invitation: PreprovisionedInvitation;
  updates: {
    name: string;
    role: UserRole;
    status: AccountStatus;
    teamId: string;
    employeeId: string;
    extraPermissions: PermissionKey[];
    revokedPermissions: PermissionKey[];
  };
}): Promise<void> {
  const path = `preprovisionedUsers/${params.invitation.emailKey}`;
  try {
    await updateDoc(doc(db, 'preprovisionedUsers', params.invitation.emailKey), {
      name: params.updates.name.trim().slice(0, 120),
      role: params.updates.role,
      status: params.updates.status,
      teamId: sanitizeId(params.updates.teamId || ''),
      employeeId: sanitizeId(params.updates.employeeId || ''),
      extraPermissions: params.updates.extraPermissions.slice(0, 40),
      revokedPermissions: params.updates.revokedPermissions.slice(0, 40),
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      actor: params.actor,
      category: 'security',
      action: 'تعديل دعوة حساب معلقة',
      targetType: 'user_invitation',
      targetId: params.invitation.emailKey,
      beforeSummary: `الدور: ${params.invitation.role} | الحالة: ${params.invitation.status}`,
      afterSummary: `الدور: ${params.updates.role} | الحالة: ${params.updates.status}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * حذف دعوة حساب معلقة نهائياً بواسطة مدير النظام
 */
export async function deletePreprovisionedInvitationByAdmin(params: {
  actor: UserProfile;
  invitation: PreprovisionedInvitation;
}): Promise<void> {
  const path = `preprovisionedUsers/${params.invitation.emailKey}`;
  try {
    await deleteDoc(doc(db, 'preprovisionedUsers', params.invitation.emailKey));
    await recordAuditLog({
      actor: params.actor,
      category: 'security',
      action: 'حذف دعوة حساب معتمدة مسبقاً',
      targetType: 'user_invitation',
      targetId: params.invitation.emailKey,
      beforeSummary: `البريد: ${params.invitation.email} | الدور: ${params.invitation.role}`,
      reason: 'إلغاء وحذف الدعوة بواسطة مدير النظام',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * حذف سجل مستخدم غير مدير نظام بواسطة مدير النظام مع فك ارتباط المندوب إن وجد
 */
export async function deleteUserAccountByAdmin(params: {
  actor: UserProfile;
  targetUser: UserProfile;
}): Promise<void> {
  const path = `users/${params.targetUser.uid}`;
  try {
    await deleteDoc(doc(db, 'users', params.targetUser.uid));

    if (params.targetUser.emailKey) {
      const invRef = doc(db, 'preprovisionedUsers', params.targetUser.emailKey);
      const invSnap = await getDoc(invRef);
      if (invSnap.exists()) {
        await deleteDoc(invRef);
      }
    }

    if (params.targetUser.employeeId) {
      const empRef = doc(db, 'employees', sanitizeId(params.targetUser.employeeId));
      const empSnap = await getDoc(empRef);
      if (empSnap.exists() && empSnap.data().userId === params.targetUser.uid) {
        await updateDoc(empRef, {
          userId: '',
          updatedAt: serverTimestamp(),
        });
      }
    }

    await recordAuditLog({
      actor: params.actor,
      category: 'security',
      action: 'حذف حساب مستخدم من النظام',
      targetType: 'user',
      targetId: params.targetUser.uid,
      beforeSummary: `${params.targetUser.name} (${params.targetUser.email}) — الدور: ${params.targetUser.role}`,
      reason: 'حذف إداري كامل بواسطة مدير النظام',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * إنشاء أو تعديل فريق تشغيلي وتعيين المشرف
 */
export async function saveTeamRecord(params: {
  actor: UserProfile;
  team: {
    teamId: string;
    teamName: string;
    supervisorId: string;
    status: 'active' | 'disabled';
    memberCount: number;
  };
  isEdit: boolean;
}): Promise<void> {
  const teamId = sanitizeId(params.team.teamId);
  const path = `teams/${teamId}`;
  try {
    if (params.isEdit) {
      await updateDoc(doc(db, 'teams', teamId), {
        teamName: params.team.teamName.trim().slice(0, 120),
        supervisorId: sanitizeId(params.team.supervisorId || ''),
        status: params.team.status,
        memberCount: Math.max(0, params.team.memberCount),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'teams', teamId), {
        teamId,
        teamName: params.team.teamName.trim().slice(0, 120),
        supervisorId: sanitizeId(params.team.supervisorId || ''),
        status: params.team.status,
        memberCount: Math.max(0, params.team.memberCount),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // مزامنة teamId للمشرف المعيّن إن وجد
    if (params.team.supervisorId && params.actor.role === 'super_admin') {
      const supRef = doc(db, 'users', sanitizeId(params.team.supervisorId));
      const supSnap = await getDoc(supRef);
      if (supSnap.exists() && supSnap.data().role !== 'super_admin') {
        await updateDoc(supRef, {
          teamId,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await recordAuditLog({
      actor: params.actor,
      category: 'operational',
      action: params.isEdit ? 'تعديل بيانات فريق' : 'إنشاء فريق جديد',
      targetType: 'team',
      targetId: teamId,
      afterSummary: `الفريق: ${params.team.teamName} | المشرف: ${params.team.supervisorId || 'غير معين'} | الحالة: ${params.team.status}`,
    });
  } catch (error) {
    handleFirestoreError(
      error,
      params.isEdit ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

/**
 * حذف فريق تشغيلي بواسطة مدير النظام وإخلاء ارتباط أعضائه بأمان
 */
export async function deleteTeamByAdmin(params: {
  actor: UserProfile;
  team: Team;
  teamMembers?: Employee[];
}): Promise<void> {
  const teamId = sanitizeId(params.team.teamId);
  const path = `teams/${teamId}`;
  try {
    const batch = writeBatch(db);
    (params.teamMembers || []).slice(0, 350).forEach((emp) => {
      batch.update(doc(db, 'employees', sanitizeId(emp.id)), {
        teamId: '',
        updatedAt: serverTimestamp(),
      });
    });
    batch.delete(doc(db, 'teams', teamId));
    await batch.commit();

    await recordAuditLog({
      actor: params.actor,
      category: 'security',
      action: 'حذف فريق تشغيلي',
      targetType: 'team',
      targetId: teamId,
      beforeSummary: `الفريق: ${params.team.teamName} (${teamId})`,
      reason: 'حذف الفريق بواسطة مدير النظام',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * نقل مندوب إلى فريق آخر مع تحديث نطاق الوصول على المندوب وسجلات حضوره وحساب المستخدم المرتبط به وتسجيل العملية في Audit Log
 */
export async function transferEmployeeToTeam(params: {
  actor: UserProfile;
  employee: Employee;
  newTeamId: string;
  attendanceRecords: Record<string, AttendanceRecord>;
  allTeams: Team[];
}): Promise<void> {
  const cleanNewTeamId = sanitizeId(params.newTeamId || '');
  const oldTeamId = params.employee.teamId || '';
  const empId = sanitizeId(params.employee.id);
  const path = `employees/${empId}`;

  try {
    const batch = writeBatch(db);
    const empRef = doc(db, 'employees', empId);
    batch.update(empRef, {
      teamId: cleanNewTeamId,
      updatedAt: serverTimestamp(),
    });

    // تحديث حساب المندوب إن كان مرتبطاً
    if (params.employee.userId && params.actor.role === 'super_admin') {
      batch.update(doc(db, 'users', sanitizeId(params.employee.userId)), {
        teamId: cleanNewTeamId,
        updatedAt: serverTimestamp(),
      });
    }

    // تحديث عداد الأعضاء للفرق
    if (oldTeamId) {
      const oldTeam = params.allTeams.find((t) => t.teamId === oldTeamId);
      if (oldTeam) {
        batch.update(doc(db, 'teams', oldTeamId), {
          memberCount: Math.max(0, (oldTeam.memberCount || 1) - 1),
          updatedAt: serverTimestamp(),
        });
      }
    }
    if (cleanNewTeamId) {
      const newTeam = params.allTeams.find((t) => t.teamId === cleanNewTeamId);
      if (newTeam) {
        batch.update(doc(db, 'teams', cleanNewTeamId), {
          memberCount: (newTeam.memberCount || 0) + 1,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // تحديث سجلات حضور المندوب للشهر الحالي ليتطابق نطاق الوصول تلقائياً مع الفريق الجديد (بحد أقصى 400 سجل في الدفعة)
    let updatedAttCount = 0;
    Object.values(params.attendanceRecords).forEach((rec) => {
      if (rec.employeeId === params.employee.id && updatedAttCount < 400) {
        batch.update(doc(db, 'attendance', sanitizeId(rec.id)), {
          teamId: cleanNewTeamId,
          recordedBy: params.actor.uid,
          updatedAt: serverTimestamp(),
        });
        updatedAttCount++;
      }
    });

    await batch.commit();

    await recordAuditLog({
      actor: params.actor,
      category: 'operational',
      action: 'نقل مندوب بين الفرق',
      targetType: 'employee',
      targetId: empId,
      beforeSummary: `الفريق السابق: ${oldTeamId || 'بدون فريق'}`,
      afterSummary: `الفريق الجديد: ${cleanNewTeamId || 'بدون فريق'}`,
      reason: 'إعادة توزيع الفرق وتحديث نطاق وصول المشرف تلقائياً',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * حفظ أو تحديث سجل مندوب في Firestore
 */
export async function saveEmployeeFirestore(params: {
  actor: UserProfile;
  employee: Employee;
  isEdit: boolean;
}): Promise<void> {
  const empId = sanitizeId(params.employee.id);
  const path = `employees/${empId}`;

  try {
    if (params.isEdit) {
      // إذا كان المشرف يعدل الملاحظات فقط
      if (params.actor.role === 'supervisor') {
        await updateDoc(doc(db, 'employees', empId), {
          notes: (params.employee.notes || '').slice(0, 500),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'employees', empId), {
          employeeCode: params.employee.employeeCode.slice(0, 64),
          fullName: params.employee.fullName.slice(0, 120),
          phone: (params.employee.phone || '').slice(0, 32),
          hireDate: (params.employee.hireDate || '').slice(0, 20),
          status: params.employee.status,
          externalId: (params.employee.externalId || '').slice(0, 128),
          teamId: sanitizeId(params.employee.teamId || ''),
          userId: sanitizeId(params.employee.userId || ''),
          notes: (params.employee.notes || '').slice(0, 500),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      await setDoc(doc(db, 'employees', empId), {
        id: empId,
        employeeCode: params.employee.employeeCode.slice(0, 64),
        fullName: params.employee.fullName.slice(0, 120),
        phone: (params.employee.phone || '').slice(0, 32),
        hireDate: (params.employee.hireDate || '').slice(0, 20),
        status: params.employee.status,
        externalId: (params.employee.externalId || '').slice(0, 128),
        teamId: sanitizeId(params.employee.teamId || ''),
        userId: sanitizeId(params.employee.userId || ''),
        notes: (params.employee.notes || '').slice(0, 500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await recordAuditLog({
      actor: params.actor,
      category: 'operational',
      action: params.isEdit ? 'تعديل بيانات مندوب' : 'إضافة مندوب جديد',
      targetType: 'employee',
      targetId: empId,
      afterSummary: `${params.employee.fullName} (${params.employee.employeeCode}) | الحالة: ${params.employee.status}`,
    });
  } catch (error) {
    handleFirestoreError(
      error,
      params.isEdit ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

export async function deleteEmployeeFirestore(params: {
  actor: UserProfile;
  employee: Employee;
}): Promise<void> {
  const empId = sanitizeId(params.employee.id);
  const path = `employees/${empId}`;
  try {
    await deleteDoc(doc(db, 'employees', empId));
    await recordAuditLog({
      actor: params.actor,
      category: 'security',
      action: 'حذف سجل مندوب',
      targetType: 'employee',
      targetId: empId,
      beforeSummary: `${params.employee.fullName} (${params.employee.employeeCode})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * حفظ أو تعديل سجل حضور وشفت في Firestore مع التحقق من مصدر السجل وصلاحية المشرف
 */
export async function saveAttendanceFirestore(params: {
  actor: UserProfile;
  employee: Employee;
  record: AttendanceRecord;
  previousRecord?: AttendanceRecord;
  source?: AttendanceDataSource;
}): Promise<void> {
  const recId = sanitizeId(`${params.employee.id}_${params.record.date}`);
  const path = `attendance/${recId}`;
  const docRef = doc(db, 'attendance', recId);

  try {
    const snap = await getDoc(docRef);
    const effectiveSource: AttendanceDataSource =
      params.source || params.record.source || 'manual';

    if (snap.exists()) {
      if (params.actor.role === 'supervisor') {
        await updateDoc(docRef, {
          attendance: params.record.attendance,
          startTime: params.record.startTime.slice(0, 10),
          endTime: params.record.endTime.slice(0, 10),
          breakMinutes: Math.max(0, Math.min(720, Math.round(params.record.breakMinutes))),
          totalWorkedMinutes: Math.max(0, Math.min(1440, Math.round(params.record.totalWorkedMinutes))),
          supervisorNotes: (params.record.supervisorNotes || '').slice(0, 500),
          source: 'manual',
          recordedBy: params.actor.uid,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(docRef, {
          teamId: sanitizeId(params.employee.teamId || ''),
          shiftSelection: params.record.shiftSelection,
          attendance: params.record.attendance,
          startTime: params.record.startTime.slice(0, 10),
          endTime: params.record.endTime.slice(0, 10),
          breakMinutes: Math.max(0, Math.min(720, Math.round(params.record.breakMinutes))),
          totalWorkedMinutes: Math.max(0, Math.min(1440, Math.round(params.record.totalWorkedMinutes))),
          supervisorNotes: (params.record.supervisorNotes || '').slice(0, 500),
          source: effectiveSource,
          recordedBy: params.actor.uid,
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      await setDoc(docRef, {
        id: recId,
        employeeId: sanitizeId(params.employee.id),
        teamId: sanitizeId(params.employee.teamId || ''),
        date: params.record.date,
        shiftSelection: params.record.shiftSelection,
        attendance: params.record.attendance,
        startTime: params.record.startTime.slice(0, 10),
        endTime: params.record.endTime.slice(0, 10),
        breakMinutes: Math.max(0, Math.min(720, Math.round(params.record.breakMinutes))),
        totalWorkedMinutes: Math.max(0, Math.min(1440, Math.round(params.record.totalWorkedMinutes))),
        supervisorNotes: (params.record.supervisorNotes || '').slice(0, 500),
        source: effectiveSource,
        recordedBy: params.actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await recordAuditLog({
      actor: params.actor,
      category: 'operational',
      action: snap.exists() ? 'تعديل سجل شفت / حضور' : 'تسجيل حضور وشفت جديد',
      targetType: 'attendance',
      targetId: recId,
      beforeSummary: params.previousRecord
        ? `الحضور: ${params.previousRecord.attendance} | الشفت: ${params.previousRecord.shiftSelection}`
        : 'لا يوجد سجل سابق',
      afterSummary: `المندوب: ${params.employee.fullName} | التاريخ: ${params.record.date} | الحضور: ${params.record.attendance} | المصدر: ${effectiveSource}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAttendanceFirestore(params: {
  actor: UserProfile;
  employeeId: string;
  date: string;
}): Promise<void> {
  const recId = sanitizeId(`${params.employeeId}_${params.date}`);
  const path = `attendance/${recId}`;
  try {
    await deleteDoc(doc(db, 'attendance', recId));
    await recordAuditLog({
      actor: params.actor,
      category: 'operational',
      action: 'مسح سجل يومي',
      targetType: 'attendance',
      targetId: recId,
      reason: `حذف سجل تاريخ ${params.date}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * إنشاء طلب إجازة أو اعتراض على غياب أو تصحيح حضور / شفت
 */
export async function submitWorkflowRequest(params: {
  actor: UserProfile;
  employee: Employee;
  requestType: WorkflowRequestType;
  requestDate: string;
  proposedStartTime?: string;
  proposedEndTime?: string;
  description: string;
  evidenceUrl?: string;
}): Promise<void> {
  const requestId = sanitizeId(`req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const path = `requests/${requestId}`;

  try {
    await setDoc(doc(db, 'requests', requestId), {
      requestId,
      employeeId: sanitizeId(params.employee.id),
      employeeName: params.employee.fullName.slice(0, 120),
      teamId: sanitizeId(params.employee.teamId || ''),
      submittedBy: params.actor.uid,
      submitterRole: params.actor.role,
      requestType: params.requestType,
      requestDate: params.requestDate,
      proposedStartTime: (params.proposedStartTime || '').slice(0, 10),
      proposedEndTime: (params.proposedEndTime || '').slice(0, 10),
      description: params.description.trim().slice(0, 1000),
      evidenceUrl: (params.evidenceUrl || '').trim().slice(0, 500),
      status: 'pending',
      supervisorRecommendation: '',
      reviewedBy: '',
      reviewerName: '',
      reviewComment: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      actor: params.actor,
      category: 'operational',
      action: 'إرسال طلب إجازة / تصحيح',
      targetType: 'request',
      targetId: requestId,
      afterSummary: `المندوب: ${params.employee.fullName} | النوع: ${params.requestType} | التاريخ: ${params.requestDate}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * إضافة توصية المشرف على طلب ضمن فريقه دون تعديل سجل الحضور تلقائياً
 */
export async function recommendWorkflowRequestBySupervisor(params: {
  actor: UserProfile;
  request: WorkflowRequest;
  recommendation: string;
}): Promise<void> {
  const path = `requests/${params.request.requestId}`;
  try {
    await updateDoc(doc(db, 'requests', params.request.requestId), {
      status: 'recommended',
      supervisorRecommendation: params.recommendation.trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      actor: params.actor,
      category: 'operational',
      action: 'توصية مشرف على طلب',
      targetType: 'request',
      targetId: params.request.requestId,
      afterSummary: `التوصية: ${params.recommendation.trim().slice(0, 200)}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * اعتماد أو رفض الطلب من قبل مدير التشغيل أو مدير النظام، وتحديث الحضور ذرياً عند الاعتماد مع التسجيل في Audit Log
 */
export async function decideWorkflowRequest(params: {
  actor: UserProfile;
  request: WorkflowRequest;
  employee?: Employee;
  decision: 'approved' | 'rejected';
  reviewComment: string;
  calculatedMinutes?: number;
}): Promise<void> {
  const reqPath = `requests/${params.request.requestId}`;
  try {
    await runTransaction(db, async (tx) => {
      const reqRef = doc(db, 'requests', params.request.requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) throw new Error('الطلب غير موجود');

      const attId = sanitizeId(`${params.request.employeeId}_${params.request.requestDate}`);
      const attRef = doc(db, 'attendance', attId);
      const attSnap = params.decision === 'approved' ? await tx.get(attRef) : null;

      tx.update(reqRef, {
        status: params.decision,
        reviewedBy: params.actor.uid,
        reviewerName: params.actor.name.slice(0, 120),
        reviewComment: params.reviewComment.trim().slice(0, 500),
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // إذا تم الاعتماد، نحدّث سجل الحضور المقابل بمصدر approved_request
      if (params.decision === 'approved') {
        const isLeave = params.request.requestType === 'leave';
        const startT = params.request.proposedStartTime || '09:00';
        const endT = params.request.proposedEndTime || '17:00';
        const workedMins = isLeave ? 0 : (params.calculatedMinutes ?? 450);

        if (attSnap && attSnap.exists()) {
          tx.update(attRef, {
            teamId: sanitizeId(params.employee?.teamId || params.request.teamId || ''),
            shiftSelection: isLeave ? 'exempt' : 'selected',
            attendance: isLeave ? 'leave' : 'worked',
            startTime: startT,
            endTime: endT,
            breakMinutes: isLeave ? 0 : 30,
            totalWorkedMinutes: workedMins,
            supervisorNotes: `معتمد بموجب طلب #${params.request.requestId.slice(-6)}: ${params.reviewComment.trim().slice(0, 200)}`,
            source: 'approved_request',
            recordedBy: params.actor.uid,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(attRef, {
            id: attId,
            employeeId: sanitizeId(params.request.employeeId),
            teamId: sanitizeId(params.employee?.teamId || params.request.teamId || ''),
            date: params.request.requestDate,
            shiftSelection: isLeave ? 'exempt' : 'selected',
            attendance: isLeave ? 'leave' : 'worked',
            startTime: startT,
            endTime: endT,
            breakMinutes: isLeave ? 0 : 30,
            totalWorkedMinutes: workedMins,
            supervisorNotes: `معتمد بموجب طلب #${params.request.requestId.slice(-6)}`,
            source: 'approved_request',
            recordedBy: params.actor.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    });

    await recordAuditLog({
      actor: params.actor,
      category: 'operational',
      action: params.decision === 'approved' ? 'اعتماد طلب وتحديث الحضور' : 'رفض طلب إجازة / تصحيح',
      targetType: 'request',
      targetId: params.request.requestId,
      beforeSummary: `الحالة السابقة: ${params.request.status}`,
      afterSummary: `القرار: ${params.decision} | المندوب: ${params.request.employeeName} | التاريخ: ${params.request.requestDate}`,
      reason: params.reviewComment.trim() || 'مراجعة إدارية',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, reqPath);
  }
}

/**
 * حفظ إعدادات الأمان والربط غير السرية بواسطة مدير النظام فقط
 */
export async function saveSecurityPolicySettings(params: {
  actor: UserProfile;
  settings: Omit<SecurityPolicySettings, 'policyId' | 'updatedBy' | 'updatedAt'>;
  auditActionLabel?: string;
}): Promise<void> {
  const path = 'securitySettings/global';
  const ref = doc(db, 'securitySettings', 'global');
  try {
    const snap = await getDoc(ref);
    const payload = {
      policyId: 'global',
      allowSupervisorLeaveRecommendation: Boolean(
        params.settings.allowSupervisorLeaveRecommendation
      ),
      allowViewerExport: Boolean(params.settings.allowViewerExport),
      allowOpsIntegrationSync: Boolean(params.settings.allowOpsIntegrationSync),
      enforceAdminMfaNotice: Boolean(params.settings.enforceAdminMfaNotice),
      emergencyReadOnlyMode: Boolean(params.settings.emergencyReadOnlyMode),
      systemLockdownMode: Boolean(params.settings.systemLockdownMode),
      lockdownMessage: (
        params.settings.lockdownMessage ||
        'النظام في وضع الصيانة الأمنية المؤقتة بأمر من مدير النظام. يرجى المحاولة لاحقاً.'
      )
        .trim()
        .slice(0, 300),
      autoProvisionWithoutInvite: params.settings.autoProvisionWithoutInvite !== false,
      autoProvisionDefaultRole: (
        ['operations_manager', 'supervisor', 'delivery_rep', 'viewer'].includes(
          params.settings.autoProvisionDefaultRole
        )
          ? params.settings.autoProvisionDefaultRole
          : 'viewer'
      ) as SecurityPolicySettings['autoProvisionDefaultRole'],
      autoProvisionDefaultStatus:
        params.settings.autoProvisionDefaultStatus === 'pending' ? 'pending' : 'active',
      opsGrantedPerms: (params.settings.opsGrantedPerms || []).slice(0, 40),
      opsRevokedPerms: (params.settings.opsRevokedPerms || []).slice(0, 40),
      supGrantedPerms: (params.settings.supGrantedPerms || []).slice(0, 40),
      supRevokedPerms: (params.settings.supRevokedPerms || []).slice(0, 40),
      repGrantedPerms: (params.settings.repGrantedPerms || []).slice(0, 40),
      repRevokedPerms: (params.settings.repRevokedPerms || []).slice(0, 40),
      viewerGrantedPerms: (params.settings.viewerGrantedPerms || []).slice(0, 40),
      viewerRevokedPerms: (params.settings.viewerRevokedPerms || []).slice(0, 40),
      sessionTimeoutMinutes: Math.max(
        5,
        Math.min(1440, Math.round(params.settings.sessionTimeoutMinutes || 60))
      ),
      externalSyncEndpoint: (params.settings.externalSyncEndpoint || '').trim().slice(0, 300),
      lastExternalSyncStatus: (params.settings.lastExternalSyncStatus || '').slice(0, 100),
      lastExternalSyncImported: Math.max(0, params.settings.lastExternalSyncImported || 0),
      lastExternalSyncFailed: Math.max(0, params.settings.lastExternalSyncFailed || 0),
      lastExternalSyncTime: (params.settings.lastExternalSyncTime || '—').slice(0, 64),
      updatedBy: params.actor.uid,
      updatedAt: serverTimestamp(),
    };

    if (snap.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, payload);
    }

    await recordAuditLog({
      actor: params.actor,
      category: 'security',
      action: params.auditActionLabel || 'تحديث إعدادات الأمان وسياسات النظام',
      targetType: 'securitySettings',
      targetId: 'global',
      afterSummary: `دخول تلقائي بدون دعوة: ${payload.autoProvisionWithoutInvite ? 'مفعل' : 'متوقف'} (${payload.autoProvisionDefaultRole}) | تجميد التعديلات: ${payload.emergencyReadOnlyMode ? 'مفعل' : 'متوقف'} | قفل النظام: ${payload.systemLockdownMode ? 'مفعل' : 'متوقف'}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * ترحيل آمن وغير مدمّر للبيانات المحلية السابقة في المتصفح إلى Cloud Firestore (لمرة واحدة فقط عند رغبة مدير النظام أو التشغيل)
 */
export async function migrateLocalDataToFirestore(params: {
  actor: UserProfile;
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
  sourceLabel?: string;
  markAsExternalSync?: boolean;
}): Promise<{ importedEmployees: number; importedAttendance: number }> {
  let importedEmployees = 0;
  let importedAttendance = 0;

  // تقسيم الدفعات إلى 350 عملية لكل دفعة، مع حفظ المندوبين أولاً قبل سجلات الحضور لضمان نجاح تحقق exists() في قواعد Firestore
  const empOps: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];
  const attOps: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];

  for (const emp of params.employees) {
    const empId = sanitizeId(emp.id || emp.employeeCode);
    if (!empId) continue;
    empOps.push((batch) => {
      batch.set(doc(db, 'employees', empId), {
        id: empId,
        employeeCode: (emp.employeeCode || empId).slice(0, 64),
        fullName: (emp.fullName || 'مندوب').slice(0, 120),
        phone: (emp.phone || '').slice(0, 32),
        hireDate: (emp.hireDate || '2025-01-01').slice(0, 20),
        status: emp.status === 'suspended' ? 'suspended' : 'active',
        externalId: (emp.externalId || `EXT_${empId}`).slice(0, 128),
        teamId: sanitizeId(emp.teamId || ''),
        userId: sanitizeId(emp.userId || ''),
        notes: (emp.notes || '').slice(0, 500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    importedEmployees++;
  }

  for (const rec of Object.values(params.attendanceRecords)) {
    const empId = sanitizeId(rec.employeeId);
    if (!empId || !rec.date) continue;
    const recId = sanitizeId(`${empId}_${rec.date}`);
    const matchingEmp = params.employees.find((e) => e.id === rec.employeeId);
    attOps.push((batch) => {
      batch.set(doc(db, 'attendance', recId), {
        id: recId,
        employeeId: empId,
        teamId: sanitizeId(rec.teamId || matchingEmp?.teamId || ''),
        date: rec.date.slice(0, 10),
        shiftSelection: rec.shiftSelection || 'undecided',
        attendance: rec.attendance || 'pending',
        startTime: (rec.startTime || '09:00').slice(0, 10),
        endTime: (rec.endTime || '17:00').slice(0, 10),
        breakMinutes: Math.max(0, Math.min(720, Math.round(rec.breakMinutes || 0))),
        totalWorkedMinutes: Math.max(0, Math.min(1440, Math.round(rec.totalWorkedMinutes || 0))),
        supervisorNotes: (rec.supervisorNotes || '').slice(0, 500),
        source: params.markAsExternalSync ? 'external_sync' : (rec.source || 'manual'),
        recordedBy: params.actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    importedAttendance++;
  }

  const CHUNK_SIZE = 350;
  for (let i = 0; i < empOps.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    empOps.slice(i, i + CHUNK_SIZE).forEach((op) => op(batch));
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'employees_batch_migration');
    }
  }

  for (let i = 0; i < attOps.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    attOps.slice(i, i + CHUNK_SIZE).forEach((op) => op(batch));
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance_batch_migration');
    }
  }

  await recordAuditLog({
    actor: params.actor,
    category: 'operational',
    action: params.sourceLabel || 'ترحيل / مزامنة سجلات الشفتات إلى السحابة',
    targetType: 'database_sync',
    targetId: 'firestore_import',
    afterSummary: `تم استيراد ${importedEmployees} مندوب و ${importedAttendance} سجل حضور`,
  });

  return { importedEmployees, importedAttendance };
}

/**
 * تفريغ بيانات الشفتات والمندوبين التجريبية (متاح حصرياً لمدير النظام مع تسجيل أمني كامل)
 */
export async function clearAllOperationalDataFirestore(params: {
  actor: UserProfile;
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
}): Promise<void> {
  const deleteOps: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];

  for (const rec of Object.values(params.attendanceRecords)) {
    const recId = sanitizeId(rec.id || `${rec.employeeId}_${rec.date}`);
    if (!recId) continue;
    deleteOps.push((batch) => batch.delete(doc(db, 'attendance', recId)));
  }

  for (const emp of params.employees) {
    const empId = sanitizeId(emp.id);
    if (!empId) continue;
    deleteOps.push((batch) => batch.delete(doc(db, 'employees', empId)));
  }

  const CHUNK_SIZE = 350;
  for (let i = 0; i < deleteOps.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    deleteOps.slice(i, i + CHUNK_SIZE).forEach((op) => op(batch));
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'batch_clear');
    }
  }

  await recordAuditLog({
    actor: params.actor,
    category: 'security',
    action: 'إعادة ضبط وتفريغ سجلات المندوبين والحضور',
    targetType: 'database_reset',
    targetId: 'operational_data',
    beforeSummary: `المندوبون: ${params.employees.length} | سجلات الحضور: ${Object.keys(params.attendanceRecords).length}`,
    afterSummary: 'تم التفريغ بالكامل بواسطة مدير النظام',
  });
}

