import { AttendanceRecord, Employee, EmployeeSummary, MonthDay } from '../types';

export const MONTH_NAMES = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export function calculateShiftMinutes(
  startTime: string,
  endTime: string,
  breakMinutes: number = 0
): number {
  if (!startTime || !endTime) return 0;
  const partsStart = startTime.split(':').map(Number);
  const partsEnd = endTime.split(':').map(Number);
  if (partsStart.length < 2 || partsEnd.length < 2) return 0;

  const [startH, startM] = partsStart;
  const [endH, endM] = partsEnd;
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;

  const startTotal = startH * 60 + startM;
  let endTotal = endH * 60 + endM;

  // دعم الشفتات المسائية التي تعبر منتصف الليل (حتى 24 ساعة في حال تطابق البداية والنهاية؟ لا، تطابق تام = 0 ما لم يكن شفت ليلي)
  if (endTotal < startTotal) {
    endTotal += 24 * 60;
  }

  const safeBreak = Math.max(0, Number(breakMinutes) || 0);
  const total = endTotal - startTotal - safeBreak;
  return total > 0 ? total : 0;
}

export function formatMinutesToHoursText(minutes: number): string {
  if (minutes <= 0) return '0 ساعة';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} ساعة`;
  return `${hrs} س و ${mins} د`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function safeLoadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeSaveToStorage<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * دالة موحدة لحساب حالة اليوم (هل هو مستقبلي، أم منقضٍ، أم اليوم الحالي)
 * لضمان تطابق التلوين في الجدول مع حسابات ملخص الأداء وعدم احتساب اليوم الجاري كغياب تلقائي قبل انتهائه.
 */
export function getDayTemporalState(
  viewYear: number,
  viewMonth: number,
  dayNumber: number,
  today: Date
): { isPastDay: boolean; isToday: boolean; isFutureDay: boolean } {
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const todayDate = today.getDate();

  if (viewYear < todayYear || (viewYear === todayYear && viewMonth < todayMonth)) {
    return { isPastDay: true, isToday: false, isFutureDay: false };
  }
  if (viewYear > todayYear || (viewYear === todayYear && viewMonth > todayMonth)) {
    return { isPastDay: false, isToday: false, isFutureDay: true };
  }

  if (dayNumber < todayDate) {
    return { isPastDay: true, isToday: false, isFutureDay: false };
  }
  if (dayNumber === todayDate) {
    return { isPastDay: false, isToday: true, isFutureDay: false };
  }
  return { isPastDay: false, isToday: false, isFutureDay: true };
}

/**
 * حساب ملخص أداء المندوب للشهر المحدد بدقة رياضية متسقة مع ألوان الجدول:
 * - إذا اختار المندوب شفتاً في يوم منقضٍ (قبل اليوم) ولم يحضر (ولم يسجل إجازة/راحة)، يُحتسب غياباً فعلياً.
 * - اليوم الحالي لا يُحتسب غياباً تلقائياً إذا كان بانتظار الاعتماد (pending)، بل يُحتسب فقط إذا سُجّل حضوره أو غيابه صراحة.
 */
export function computeEmployeeSummary(
  emp: Employee,
  monthDaysList: MonthDay[],
  attendanceRecords: Record<string, AttendanceRecord>,
  viewYear: number,
  viewMonth: number,
  today: Date
): EmployeeSummary {
  let workedDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let dayOffDays = 0;
  let selectedDays = 0;
  let selectedNotWorkedDays = 0;
  let totalMinutes = 0;
  let scheduledDueDays = 0;
  let remainingDays = 0;

  monthDaysList.forEach(({ dateStr, dayNumber }) => {
    const key = `${emp.id}_${dateStr}`;
    const rec = attendanceRecords[key];
    const { isPastDay, isToday, isFutureDay } = getDayTemporalState(
      viewYear,
      viewMonth,
      dayNumber,
      today
    );

    if (isFutureDay) {
      remainingDays++;
    }

    const isSelected = rec?.shiftSelection === 'selected';
    if (isSelected) {
      selectedDays++;
    }

    if (rec?.attendance === 'leave') {
      leaveDays++;
      return;
    }

    if (rec?.attendance === 'day_off') {
      dayOffDays++;
      return;
    }

    if (rec?.attendance === 'worked') {
      workedDays++;
      totalMinutes += rec.totalWorkedMinutes || 0;
      if (isPastDay || isToday) {
        scheduledDueDays++;
      }
      return;
    }

    // حالة الغياب الصريح أو الغياب الضمني (يوم منقضٍ اختار فيه الشفت ولم يعمل)
    const isImplicitPastAbsence =
      isPastDay && isSelected && (!rec?.attendance || rec.attendance === 'pending');

    if (rec?.attendance === 'absent' || isImplicitPastAbsence) {
      absentDays++;
      if (isSelected) {
        selectedNotWorkedDays++;
      }
      if (isPastDay || isToday) {
        scheduledDueDays++;
      }
      return;
    }

    // الأيام المنقضية التي لم يُسجّل فيها إجازة أو راحة تدخل ضمن الأيام المستحقة للأداء
    if (isPastDay) {
      scheduledDueDays++;
      if (isSelected) {
        selectedNotWorkedDays++;
      }
    }
  });

  const totalHours = Number((totalMinutes / 60).toFixed(1));
  const avgHours = workedDays > 0 ? Number((totalHours / workedDays).toFixed(1)) : 0;
  const commitmentBase = workedDays + absentDays;
  const commitmentRate =
    commitmentBase > 0 ? Number(((workedDays / commitmentBase) * 100).toFixed(1)) : null;
  const performanceRate =
    scheduledDueDays > 0 ? Number(((workedDays / scheduledDueDays) * 100).toFixed(1)) : null;

  return {
    workedDays,
    absentDays,
    leaveDays,
    dayOffDays,
    selectedDays,
    selectedNotWorkedDays,
    totalHours,
    avgHours,
    commitmentRate,
    performanceRate,
    remainingDays,
  };
}

export function escapeCsvCell(val: string | number | null | undefined): string {
  const str = String(val ?? '');
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function generateNextUniqueEmployeeCode(employees: Employee[]): string {
  let maxNum = 0;
  employees.forEach((emp) => {
    const match = emp.employeeCode.match(/(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
    const idMatch = emp.id.match(/(\d+)/);
    if (idMatch) {
      const n = parseInt(idMatch[1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  return `EMP${String(maxNum + 1).padStart(3, '0')}`;
}
