export type EmployeeStatus = 'active' | 'suspended';

export type ShiftSelectionStatus = 'selected' | 'not_selected' | 'undecided' | 'exempt';

export type AttendanceStatus = 'worked' | 'absent' | 'leave' | 'day_off' | 'pending';

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string;
  hireDate: string;
  status: EmployeeStatus;
  externalId: string;
  notes: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  shiftSelection: ShiftSelectionStatus;
  attendance: AttendanceStatus;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalWorkedMinutes: number;
  supervisorNotes?: string;
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
