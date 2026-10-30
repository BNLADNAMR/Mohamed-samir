export type EmployeeStatus = 'active' | 'suspended';

export type ShiftSelectionStatus = 'selected' | 'not_selected' | 'undecided' | 'exempt';

export type AttendanceStatus = 'worked' | 'absent' | 'leave' | 'day_off' | 'pending';

export type AttendanceDataSource = 'manual' | 'external_sync' | 'approved_request';

export type UserRole =
  | 'super_admin'
  | 'operations_manager'
  | 'supervisor'
  | 'delivery_rep'
  | 'viewer';

export type AccountStatus = 'active' | 'disabled' | 'pending';

export type PermissionKey =
  | 'users.view'
  | 'users.create'
  | 'users.edit'
  | 'users.disable'
  | 'users.assign_role'
  | 'employees.view_all'
  | 'employees.view_team'
  | 'employees.view_self'
  | 'employees.create'
  | 'employees.edit'
  | 'employees.delete'
  | 'shifts.view_all'
  | 'shifts.view_team'
  | 'shifts.view_self'
  | 'shifts.edit'
  | 'shifts.approve'
  | 'attendance.view_all'
  | 'attendance.view_team'
  | 'attendance.view_self'
  | 'attendance.record'
  | 'attendance.edit'
  | 'attendance.approve_correction'
  | 'leave.request'
  | 'leave.review'
  | 'leave.approve'
  | 'reports.view_all'
  | 'reports.view_team'
  | 'reports.view_self'
  | 'reports.export'
  | 'teams.manage'
  | 'settings.manage'
  | 'integration.manage'
  | 'audit.view'
  | 'audit.export';

export type AppRoutePage =
  | 'dashboard'
  | 'analytics'
  | 'my_portal'
  | 'requests'
  | 'users'
  | 'teams'
  | 'audit_logs'
  | 'security_settings'
  | 'profile';

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string;
  hireDate: string;
  status: EmployeeStatus;
  externalId: string;
  teamId?: string;
  userId?: string;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  teamId?: string;
  date: string;
  shiftSelection: ShiftSelectionStatus;
  attendance: AttendanceStatus;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalWorkedMinutes: number;
  supervisorNotes?: string;
  source?: AttendanceDataSource;
  recordedBy?: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  emailKey: string;
  role: UserRole;
  extraPermissions: PermissionKey[];
  revokedPermissions: PermissionKey[];
  employeeId: string;
  teamId: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface PreprovisionedInvitation {
  emailKey: string;
  name: string;
  email: string;
  role: UserRole;
  extraPermissions: PermissionKey[];
  revokedPermissions: PermissionKey[];
  employeeId: string;
  teamId: string;
  status: AccountStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  teamId: string;
  teamName: string;
  supervisorId: string;
  status: 'active' | 'disabled';
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowRequestType =
  | 'leave'
  | 'absence_dispute'
  | 'attendance_correction'
  | 'checkout_correction'
  | 'shift_modification';

export type WorkflowRequestStatus =
  | 'pending'
  | 'recommended'
  | 'approved'
  | 'rejected';

export interface WorkflowRequest {
  requestId: string;
  employeeId: string;
  employeeName: string;
  teamId: string;
  submittedBy: string;
  submitterRole: UserRole;
  requestType: WorkflowRequestType;
  requestDate: string;
  proposedStartTime: string;
  proposedEndTime: string;
  description: string;
  evidenceUrl: string;
  status: WorkflowRequestStatus;
  supervisorRecommendation: string;
  reviewedBy: string;
  reviewerName: string;
  reviewComment: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogItem {
  logId: string;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  category: 'security' | 'operational';
  action: string;
  targetType: string;
  targetId: string;
  beforeSummary: string;
  afterSummary: string;
  reason: string;
  result: 'success' | 'denied' | 'failure';
  timestamp: string;
}

export interface SecurityPolicySettings {
  policyId: string;
  allowSupervisorLeaveRecommendation: boolean;
  allowViewerExport: boolean;
  allowOpsIntegrationSync: boolean;
  enforceAdminMfaNotice: boolean;
  sessionTimeoutMinutes: number;
  externalSyncEndpoint: string;
  lastExternalSyncStatus: string;
  lastExternalSyncImported: number;
  lastExternalSyncFailed: number;
  lastExternalSyncTime: string;
  updatedBy: string;
  updatedAt: string;
}

export interface EmployeeSummary {
  workedDays: number;
  absentDays: number;
  leaveDays: number;
  dayOffDays: number;
  selectedDays: number;
  selectedNotWorkedDays: number;
  totalHours: number;
  avgHours: number;
  commitmentRate: number | null;
  performanceRate: number | null;
  remainingDays: number;
}

export interface MonthDay {
  dayNumber: number;
  dateStr: string;
  dayName: string;
}

export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}
