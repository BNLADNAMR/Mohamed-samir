import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  MapPin,
  Users,
  Calendar,
  CalendarCheck,
  ChevronDown,
  Clock,
  AlertTriangle,
  Award,
  FileCheck2,
  Globe,
  X,
  ArrowUpLeft,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Layers,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  AppRoutePage,
  AttendanceRecord,
  Employee,
  EmployeeSummary,
  MonthDay,
  SecurityPolicySettings,
  Team,
  UserProfile,
  WorkflowRequest,
} from '../types';
import { ShiftCasePageType } from './ShiftCaseDetailPage';
import { SecurityHubTab } from './SuperAdminSecurityHub';
import { NavigationSnapshot } from '../utils/navigationHistory';
import {
  MONTH_NAMES,
  computeEmployeeSummary,
  getDaysInMonth,
} from '../utils/shiftCalculations';
import { canAccessRoute } from '../utils/rbac';

interface ExecutiveOverviewDashboardProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
  summaries: Record<string, EmployeeSummary>;
  teams: Team[];
  requests: WorkflowRequest[];
  users: UserProfile[];
  monthDaysList: MonthDay[];
  currentMonth: number;
  currentYear: number;
  today: Date;
  todayStr: string;
  canCreateEmp: boolean;
  isMigratingLocal: boolean;
  onChangeMonth: (year: number, month: number) => void;
  onNavigateSnapshot: (
    next: Partial<NavigationSnapshot> & { route: AppRoutePage }
  ) => void;
  onOpenMonthlyGridWithFilter: (opts?: {
    search?: string;
    filterAttendance?: string;
    filterSelection?: string;
  }) => void;
  onOpenAddEmployee: () => void;
  onGenerateDemoDelegates: () => void;
}

export interface SimplifiedDrillDownPayload {
  id: string;
  titleAr: string;
  subtitleAr: string;
  headlineValue: string;
  headlineUnit?: string;
  deltaText?: string;
  deltaPositive?: boolean;
  summaryPoints: { label: string; value: string; tone?: 'violet' | 'emerald' | 'rose' | 'amber' }[];
  matchedEmployees?: {
    emp: Employee;
    metricLabel: string;
    metricValue: string;
    subText?: string;
  }[];
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

function buildMonthDays(year: number, month: number): MonthDay[] {
  const count = getDaysInMonth(year, month);
  const list: MonthDay[] = [];
  for (let i = 1; i <= count; i++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(
      2,
      '0'
    )}`;
    const dayName = new Date(year, month - 1, i).toLocaleDateString('ar-EG', {
      weekday: 'short',
    });
    list.push({ dayNumber: i, dateStr, dayName });
  }
  return list;
}

function formatCompactNumber(val: number): string {
  if (!Number.isFinite(val)) return '0';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 10_000) return `${(val / 1_000).toFixed(1)}K`;
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

/**
 * حلقة التقدم الدائرية المطابقة للصورة المرجعية (SVG Circular Ring Gauge)
 */
const CircularGaugeRing: React.FC<{
  percentage: number;
  size?: number;
  strokeWidth?: number;
}> = ({ percentage, size = 76, strokeWidth = 6.5 }) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200 dark:text-[#1E293B]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="url(#violetGaugeGrad)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="violetGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-[11px] font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
        {clamped.toFixed(1)}%
      </span>
    </div>
  );
};

export const ExecutiveOverviewDashboard: React.FC<ExecutiveOverviewDashboardProps> = ({
  currentUser,
  securityPolicy,
  employees,
  attendanceRecords,
  summaries,
  teams,
  requests,
  monthDaysList,
  currentMonth,
  currentYear,
  today,
  todayStr,
  canCreateEmp,
  isMigratingLocal,
  onChangeMonth,
  onNavigateSnapshot,
  onOpenMonthlyGridWithFilter,
  onOpenAddEmployee,
  onGenerateDemoDelegates,
}) => {
  const [rankingTab, setRankingTab] = useState<'hours' | 'shifts' | 'reps'>('hours');
  const [regionSortBy, setRegionSortBy] = useState<'hours' | 'delta' | 'absence'>('hours');
  const [drillDown, setDrillDown] = useState<SimplifiedDrillDownPayload | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [isDayPickerOpen, setIsDayPickerOpen] = useState(false);
  const dayNavigatorRef = useRef<HTMLDivElement>(null);

  // إغلاق نافذة التفاصيل المبسطة أو قائمة الأيام بزر Escape أو النقر خارجها
  useEffect(() => {
    if (!drillDown && !isDayPickerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDayPickerOpen) setIsDayPickerOpen(false);
        else setDrillDown(null);
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (
        isDayPickerOpen &&
        dayNavigatorRef.current &&
        !dayNavigatorRef.current.contains(e.target as Node)
      ) {
        setIsDayPickerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [drillDown, isDayPickerOpen]);

  // اليوم المحدد حالياً ضمن الشهر المفتوح (إن اختار المستخدم يوماً بعينه بدلاً من كل الشهر)
  const activeMonthDay = useMemo(() => {
    if (!selectedDateStr) return null;
    return monthDaysList.find((d) => d.dateStr === selectedDateStr) ?? null;
  }, [selectedDateStr, monthDaysList]);

  const activeScopeLabel = activeMonthDay
    ? `${activeMonthDay.dayName} ${activeMonthDay.dayNumber} ${MONTH_NAMES[currentMonth - 1]} ${currentYear}`
    : `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;

  const comparisonLabel = activeMonthDay ? 'مقابل اليوم السابق' : 'مقابل الشهر السابق';

  const selectDateParts = (year: number, month: number, day: number) => {
    const maxD = getDaysInMonth(year, month);
    const safeD = Math.min(Math.max(1, day), maxD);
    const nextStr = `${year}-${String(month).padStart(2, '0')}-${String(safeD).padStart(2, '0')}`;
    setSelectedDateStr(nextStr);
    if (year !== currentYear || month !== currentMonth) {
      onChangeMonth(year, month);
    }
  };

  const handleStepDay = (delta: -1 | 1) => {
    if (!activeMonthDay) {
      const isCurrentMonth =
        currentYear === today.getFullYear() && currentMonth === today.getMonth() + 1;
      if (isCurrentMonth) {
        selectDateParts(currentYear, currentMonth, today.getDate());
      } else if (delta > 0) {
        selectDateParts(currentYear, currentMonth, 1);
      } else {
        selectDateParts(currentYear, currentMonth, getDaysInMonth(currentYear, currentMonth));
      }
      return;
    }
    const nextDate = new Date(currentYear, currentMonth - 1, activeMonthDay.dayNumber + delta);
    selectDateParts(nextDate.getFullYear(), nextDate.getMonth() + 1, nextDate.getDate());
  };

  const handleStepMonth = (delta: -1 | 1) => {
    const nextMonthDate = new Date(currentYear, currentMonth - 1 + delta, 1);
    const ny = nextMonthDate.getFullYear();
    const nm = nextMonthDate.getMonth() + 1;
    if (activeMonthDay) {
      selectDateParts(ny, nm, activeMonthDay.dayNumber);
    } else {
      setSelectedDateStr(null);
      onChangeMonth(ny, nm);
    }
  };

  // ملخص سريع لنشاط كل يوم في الشهر لإظهار مؤشر بصري داخل شبكة اختيار الأيام
  const dayStatsByNumber = useMemo(() => {
    const map: Record<number, { worked: number; selected: number; absent: number }> = {};
    monthDaysList.forEach((d) => {
      let worked = 0;
      let selected = 0;
      let absent = 0;
      employees.forEach((emp) => {
        const rec = attendanceRecords[`${emp.id}_${d.dateStr}`];
        if (!rec) return;
        if (rec.shiftSelection === 'selected') selected++;
        if (rec.attendance === 'worked') worked++;
        else if (rec.attendance === 'absent') absent++;
      });
      map[d.dayNumber] = { worked, selected, absent };
    });
    return map;
  }, [monthDaysList, employees, attendanceRecords]);

  // السنوات المتاحة في الشريط العلوي على غرار (2024 | 2025 | 2026) في الصورة المرجعية
  const yearOptions = useMemo(() => {
    const baseYear = today.getFullYear();
    const set = new Set<number>([baseYear - 2, baseYear - 1, baseYear]);
    set.add(currentYear);
    return Array.from(set).sort((a, b) => a - b).slice(-3);
  }, [today, currentYear]);

  // ملخصات المندوبين الفعالة (إما ليوم واحد محدد أو للشهر كاملاً)
  const effectiveSummaries = useMemo(() => {
    if (!activeMonthDay) return summaries;
    const singleDayList: MonthDay[] = [activeMonthDay];
    const map: Record<string, EmployeeSummary> = {};
    employees.forEach((emp) => {
      map[emp.id] = computeEmployeeSummary(
        emp,
        singleDayList,
        attendanceRecords,
        currentYear,
        currentMonth,
        today
      );
    });
    return map;
  }, [activeMonthDay, summaries, employees, attendanceRecords, currentYear, currentMonth, today]);

  // حساب إحصاءات الفترة السابقة للمقارنة الحقيقية (اليوم السابق عند اختيار يوم، أو الشهر السابق عند عرض الشهر)
  const prevMonthInfo = useMemo(() => {
    const pm = currentMonth === 1 ? 12 : currentMonth - 1;
    const py = currentMonth === 1 ? currentYear - 1 : currentYear;
    const days = buildMonthDays(py, pm);
    const map: Record<string, EmployeeSummary> = {};
    employees.forEach((emp) => {
      map[emp.id] = computeEmployeeSummary(
        emp,
        days,
        attendanceRecords,
        py,
        pm,
        today
      );
    });
    return { year: py, month: pm, days, summaries: map };
  }, [employees, attendanceRecords, currentMonth, currentYear, today]);

  const comparisonSummaries = useMemo(() => {
    if (!activeMonthDay) return prevMonthInfo.summaries;
    const prevDate = new Date(currentYear, currentMonth - 1, activeMonthDay.dayNumber - 1);
    const py = prevDate.getFullYear();
    const pm = prevDate.getMonth() + 1;
    const pd = prevDate.getDate();
    const prevDateStr = `${py}-${String(pm).padStart(2, '0')}-${String(pd).padStart(2, '0')}`;
    const prevDayObj: MonthDay = {
      dayNumber: pd,
      dateStr: prevDateStr,
      dayName: prevDate.toLocaleDateString('ar-EG', { weekday: 'short' }),
    };
    const map: Record<string, EmployeeSummary> = {};
    employees.forEach((emp) => {
      map[emp.id] = computeEmployeeSummary(
        emp,
        [prevDayObj],
        attendanceRecords,
        py,
        pm,
        today
      );
    });
    return map;
  }, [activeMonthDay, prevMonthInfo.summaries, currentYear, currentMonth, employees, attendanceRecords, today]);

  // المؤشرات الكلية للفترة المعروضة (اليوم المحدد أو الشهر الحالي) مقابل الفترة السابقة
  const metrics = useMemo(() => {
    let workedDays = 0;
    let absentDays = 0;
    let leaveAndOffDays = 0;
    let selectedDays = 0;
    let missedShifts = 0;
    let totalHours = 0;

    let prevWorkedDays = 0;
    let prevAbsentDays = 0;
    let prevSelectedDays = 0;
    let prevTotalHours = 0;

    employees.forEach((emp) => {
      const s = effectiveSummaries[emp.id];
      if (s) {
        workedDays += s.workedDays;
        absentDays += s.absentDays;
        leaveAndOffDays += s.leaveDays + s.dayOffDays;
        selectedDays += s.selectedDays;
        missedShifts += s.selectedNotWorkedDays;
        totalHours += s.totalHours;
      }
      const ps = comparisonSummaries[emp.id];
      if (ps) {
        prevWorkedDays += ps.workedDays;
        prevAbsentDays += ps.absentDays;
        prevSelectedDays += ps.selectedDays;
        prevTotalHours += ps.totalHours;
      }
    });

    const activeEmployees = employees.filter((e) => e.status === 'active');
    const suspendedEmployees = employees.filter((e) => e.status === 'suspended');
    const linkedDigitalEmployees = employees.filter(
      (e) => Boolean(e.userId?.trim()) || Boolean(e.externalId?.trim())
    );

    const targetMonthlyHours = activeMonthDay
      ? Math.max(activeEmployees.length * 8, 8)
      : Math.max(activeEmployees.length * 176, 100);
    const hoursTargetRatio = Math.min(
      100,
      Number(((totalHours / targetMonthlyHours) * 100).toFixed(1))
    );

    const commitmentBase = workedDays + absentDays;
    const commitmentRate =
      commitmentBase > 0
        ? Number(((workedDays / commitmentBase) * 100).toFixed(2))
        : 0;

    const prevCommitmentBase = prevWorkedDays + prevAbsentDays;
    const prevCommitmentRate =
      prevCommitmentBase > 0
        ? Number(((prevWorkedDays / prevCommitmentBase) * 100).toFixed(2))
        : commitmentRate;

    const absenceRate =
      commitmentBase > 0
        ? Number(((absentDays / commitmentBase) * 100).toFixed(2))
        : 0;
    const prevAbsenceRate =
      prevCommitmentBase > 0
        ? Number(((prevAbsentDays / prevCommitmentBase) * 100).toFixed(2))
        : absenceRate;

    const daysInScope = activeMonthDay ? 1 : monthDaysList.length;
    const maxSchedulableDays = Math.max(
      employees.length * daysInScope - leaveAndOffDays,
      1
    );
    const scheduleSelectionRate = Math.min(
      100,
      Number(((selectedDays / maxSchedulableDays) * 100).toFixed(2))
    );

    const shiftExecutionRate =
      selectedDays > 0
        ? Math.min(100, Number(((workedDays / selectedDays) * 100).toFixed(2)))
        : 0;

    const scopedRequests = activeMonthDay
      ? requests.filter((r) => r.requestDate === activeMonthDay.dateStr)
      : requests;

    const approvedOrResolvedReqs = scopedRequests.filter(
      (r) => r.status === 'approved' || r.status === 'rejected'
    ).length;
    const pendingReqs = scopedRequests.filter(
      (r) => r.status === 'pending' || r.status === 'recommended'
    ).length;
    const requestsResolutionRate =
      scopedRequests.length > 0
        ? Number(((approvedOrResolvedReqs / scopedRequests.length) * 100).toFixed(2))
        : 100;

    const digitalAdoptionRate =
      employees.length > 0
        ? Number(((linkedDigitalEmployees.length / employees.length) * 100).toFixed(2))
        : 0;

    const calcPctDelta = (curr: number, prev: number) => {
      if (prev <= 0) return curr > 0 ? 12.5 : 0;
      return Number((((curr - prev) / prev) * 100).toFixed(1));
    };

    return {
      totalEmployees: employees.length,
      activeCount: activeEmployees.length,
      suspendedCount: suspendedEmployees.length,
      workedDays,
      absentDays,
      leaveAndOffDays,
      selectedDays,
      missedShifts,
      totalHours: Number(totalHours.toFixed(1)),
      targetMonthlyHours,
      hoursTargetRatio,
      hoursDelta: calcPctDelta(totalHours, prevTotalHours),
      workedDelta: calcPctDelta(workedDays, prevWorkedDays),
      selectedDelta: calcPctDelta(selectedDays, prevSelectedDays),
      commitmentRate,
      commitmentDelta: Number((commitmentRate - prevCommitmentRate).toFixed(1)),
      absenceRate,
      absenceDelta: Number((absenceRate - prevAbsenceRate).toFixed(1)),
      scheduleSelectionRate,
      shiftExecutionRate,
      requestsResolutionRate,
      pendingReqs,
      totalReqs: scopedRequests.length,
      scopedRequests,
      digitalAdoptionRate,
      linkedDigitalCount: linkedDigitalEmployees.length,
    };
  }, [
    employees,
    effectiveSummaries,
    comparisonSummaries,
    activeMonthDay,
    monthDaysList.length,
    requests,
  ]);

  // 8 أعمدة زمنية للرسم البياني العمودي والمنحنى المزدوج (عند اختيار يوم يعرض نافذة 8 أيام فردية حوله، وعند عرض الشهر يقسمه لـ 8 فترات)
  const eightBuckets = useMemo(() => {
    const totalDays = monthDaysList.length || 30;
    const buckets: {
      index: number;
      label: string;
      rangeText: string;
      hours: number;
      workedCount: number;
      prevWorkedCount: number;
      absentCount: number;
      dayNumbers: number[];
      isSelectedDayBucket?: boolean;
    }[] = [];

    if (activeMonthDay) {
      const winSize = Math.min(8, totalDays);
      const startWin = Math.max(
        1,
        Math.min(activeMonthDay.dayNumber - 4, totalDays - winSize + 1)
      );
      for (let i = 0; i < winSize; i++) {
        const d = startWin + i;
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(
          d
        ).padStart(2, '0')}`;
        const prevDateStr = `${prevMonthInfo.year}-${String(
          prevMonthInfo.month
        ).padStart(2, '0')}-${String(
          Math.min(d, prevMonthInfo.days.length)
        ).padStart(2, '0')}`;

        let hours = 0;
        let workedCount = 0;
        let prevWorkedCount = 0;
        let absentCount = 0;

        employees.forEach((emp) => {
          const rec = attendanceRecords[`${emp.id}_${dateStr}`];
          if (rec?.attendance === 'worked') {
            workedCount++;
            hours += (rec.totalWorkedMinutes || 0) / 60;
          } else if (rec?.attendance === 'absent') {
            absentCount++;
          }
          const prevRec = attendanceRecords[`${emp.id}_${prevDateStr}`];
          if (prevRec?.attendance === 'worked') {
            prevWorkedCount++;
          }
        });

        const dayObj = monthDaysList.find((md) => md.dayNumber === d);
        buckets.push({
          index: i,
          label: `يوم ${d}`,
          rangeText: `${dayObj?.dayName ?? ''} ${d} ${MONTH_NAMES[currentMonth - 1]} ${currentYear}`.trim(),
          hours: Number(hours.toFixed(1)),
          workedCount,
          prevWorkedCount,
          absentCount,
          dayNumbers: [d],
          isSelectedDayBucket: d === activeMonthDay.dayNumber,
        });
      }
      return buckets;
    }

    const step = Math.max(1, Math.ceil(totalDays / 8));
    for (let b = 0; b < 8; b++) {
      const startDay = b * step + 1;
      const endDay = Math.min(totalDays, (b + 1) * step);
      if (startDay > totalDays) break;

      let hours = 0;
      let workedCount = 0;
      let prevWorkedCount = 0;
      let absentCount = 0;
      const dayNumbers: number[] = [];

      for (let d = startDay; d <= endDay; d++) {
        dayNumbers.push(d);
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(
          d
        ).padStart(2, '0')}`;
        const prevDateStr = `${prevMonthInfo.year}-${String(
          prevMonthInfo.month
        ).padStart(2, '0')}-${String(
          Math.min(d, prevMonthInfo.days.length)
        ).padStart(2, '0')}`;

        employees.forEach((emp) => {
          const rec = attendanceRecords[`${emp.id}_${dateStr}`];
          if (rec?.attendance === 'worked') {
            workedCount++;
            hours += (rec.totalWorkedMinutes || 0) / 60;
          } else if (rec?.attendance === 'absent') {
            absentCount++;
          }

          const prevRec = attendanceRecords[`${emp.id}_${prevDateStr}`];
          if (prevRec?.attendance === 'worked') {
            prevWorkedCount++;
          }
        });
      }

      buckets.push({
        index: b,
        label: startDay === endDay ? `يوم ${startDay}` : `${startDay}-${endDay}`,
        rangeText: `الأيام من ${startDay} إلى ${endDay} ${MONTH_NAMES[currentMonth - 1]}`,
        hours: Number(hours.toFixed(1)),
        workedCount,
        prevWorkedCount,
        absentCount,
        dayNumbers,
      });
    }

    return buckets;
  }, [
    monthDaysList,
    activeMonthDay,
    currentYear,
    currentMonth,
    prevMonthInfo,
    employees,
    attendanceRecords,
  ]);

  // إحصاءات الفرق / القطاعات لجدول وخريطة المناطق (Top Right in LTR / Left in RTL)
  const teamRegions = useMemo(() => {
    const teamMap = new Map<
      string,
      {
        teamId: string;
        teamName: string;
        members: Employee[];
        hours: number;
        prevHours: number;
        workedDays: number;
        absentDays: number;
      }
    >();

    teams.forEach((t) => {
      teamMap.set(t.teamId, {
        teamId: t.teamId,
        teamName: t.teamName || t.teamId,
        members: [],
        hours: 0,
        prevHours: 0,
        workedDays: 0,
        absentDays: 0,
      });
    });

    employees.forEach((emp) => {
      const key = emp.teamId && teamMap.has(emp.teamId) ? emp.teamId : emp.teamId || '__unassigned__';
      if (!teamMap.has(key)) {
        teamMap.set(key, {
          teamId: key,
          teamName: key === '__unassigned__' ? 'قطاع عام (غير معين لفريق)' : key,
          members: [],
          hours: 0,
          prevHours: 0,
          workedDays: 0,
          absentDays: 0,
        });
      }
      const bucket = teamMap.get(key)!;
      bucket.members.push(emp);
      const s = effectiveSummaries[emp.id];
      const ps = comparisonSummaries[emp.id];
      if (s) {
        bucket.hours += s.totalHours;
        bucket.workedDays += s.workedDays;
        bucket.absentDays += s.absentDays;
      }
      if (ps) {
        bucket.prevHours += ps.totalHours;
      }
    });

    const rows = Array.from(teamMap.values()).map((item) => {
      const totalBase = item.workedDays + item.absentDays;
      const absencePct =
        totalBase > 0 ? Number(((item.absentDays / totalBase) * 100).toFixed(2)) : 0;
      const commitmentPct =
        totalBase > 0 ? Number(((item.workedDays / totalBase) * 100).toFixed(1)) : 100;
      const deltaPct =
        item.prevHours > 0
          ? Number((((item.hours - item.prevHours) / item.prevHours) * 100).toFixed(1))
          : item.hours > 0
          ? 8.4
          : 0;

      return {
        ...item,
        hours: Number(item.hours.toFixed(1)),
        absencePct,
        commitmentPct,
        deltaPct,
      };
    });

    return rows.sort((a, b) => {
      if (regionSortBy === 'delta') return b.deltaPct - a.deltaPct;
      if (regionSortBy === 'absence') return b.absencePct - a.absencePct;
      return b.hours - a.hours;
    });
  }, [teams, employees, effectiveSummaries, comparisonSummaries, regionSortBy]);

  // بيانات بطاقة الترتيب الأفقي (Top Teams / Shifts / Reps) مع التبويبات الثلاثة
  const horizontalRankingItems = useMemo(() => {
    if (rankingTab === 'reps') {
      const sorted = [...employees]
        .map((emp) => ({
          id: emp.id,
          name: emp.fullName,
          code: emp.employeeCode,
          value: effectiveSummaries[emp.id]?.totalHours ?? 0,
          worked: effectiveSummaries[emp.id]?.workedDays ?? 0,
          emp,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

      const maxVal = Math.max(...sorted.map((i) => i.value), 1);
      return sorted.map((item) => ({
        id: item.id,
        label: item.name,
        valueText: `${item.value} س`,
        ratio: Math.max(6, Math.round((item.value / maxVal) * 100)),
        onSelect: () => {
          const s = effectiveSummaries[item.emp.id];
          setDrillDown({
            id: `rep_${item.emp.id}`,
            titleAr: `ملخص المندوب: ${item.emp.fullName}`,
            subtitleAr: `الكود الوظيفي ${item.emp.employeeCode} — ${activeScopeLabel}`,
            headlineValue: `${s?.totalHours ?? 0}`,
            headlineUnit: 'ساعة عمل فعلية',
            deltaText: `نسبة الأداء: ${s?.performanceRate ?? 0}%`,
            deltaPositive: (s?.performanceRate ?? 0) >= 80,
            summaryPoints: [
              { label: 'أيام الحضور الفعلي', value: `${s?.workedDays ?? 0} يوم`, tone: 'emerald' },
              { label: 'أيام الغياب المسجلة', value: `${s?.absentDays ?? 0} يوم`, tone: 'rose' },
              { label: 'أيام الشفت المحددة', value: `${s?.selectedDays ?? 0} يوم`, tone: 'violet' },
              { label: 'متوسط الساعات اليومي', value: `${s?.avgHours ?? 0} ساعة`, tone: 'amber' },
            ],
            matchedEmployees: [
              {
                emp: item.emp,
                metricLabel: 'نسبة الالتزام',
                metricValue: s?.commitmentRate !== null ? `${s?.commitmentRate}%` : '—',
                subText: item.emp.phone || 'بدون هاتف مسجل',
              },
            ],
            primaryActionLabel: 'فتح سجل المندوب في الجدول الشهري',
            onPrimaryAction: () => {
              setDrillDown(null);
              onOpenMonthlyGridWithFilter({ search: item.emp.employeeCode });
            },
          });
        },
      }));
    }

    const sortedTeams = [...teamRegions]
      .sort((a, b) =>
        rankingTab === 'hours' ? b.hours - a.hours : b.workedDays - a.workedDays
      )
      .slice(0, 6);

    const maxVal = Math.max(
      ...sortedTeams.map((t) => (rankingTab === 'hours' ? t.hours : t.workedDays)),
      1
    );

    return sortedTeams.map((t) => {
      const val = rankingTab === 'hours' ? t.hours : t.workedDays;
      return {
        id: t.teamId,
        label: t.teamName,
        valueText: rankingTab === 'hours' ? `${t.hours} س` : `${t.workedDays} شفت`,
        ratio: Math.max(6, Math.round((val / maxVal) * 100)),
        onSelect: () => openTeamDrillDown(t),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankingTab, employees, effectiveSummaries, teamRegions, activeScopeLabel]);

  // بيانات دونات توزيع القوى العاملة (Total Workforce Donut — Bottom Right Card)
  const workforceSegments = useMemo(() => {
    let highPerformers = 0;
    let regularActive = 0;
    let needsAttention = 0;
    let suspendedOrLeave = 0;

    employees.forEach((emp) => {
      if (emp.status === 'suspended') {
        suspendedOrLeave++;
        return;
      }
      const s = effectiveSummaries[emp.id];
      if (!s) {
        regularActive++;
        return;
      }
      if (s.absentDays > 0 || s.selectedNotWorkedDays > 0) {
        needsAttention++;
      } else if (
        activeMonthDay
          ? s.workedDays >= 1
          : (s.performanceRate ?? 0) >= 85 || s.workedDays >= 15
      ) {
        highPerformers++;
      } else {
        regularActive++;
      }
    });

    const total = Math.max(employees.length, 1);
    return [
      {
        id: 'high_perf',
        label: 'التزام عالٍ ومنتظم',
        count: highPerformers,
        pct: Math.round((highPerformers / total) * 100),
        color: '#7C3AED',
        caseTarget: 'worked_only' as ShiftCasePageType,
      },
      {
        id: 'regular_active',
        label: 'قيد التشغيل والجدولة',
        count: regularActive,
        pct: Math.round((regularActive / total) * 100),
        color: '#A78BFA',
        caseTarget: 'incomplete_schedule' as ShiftCasePageType,
      },
      {
        id: 'needs_attention',
        label: 'بحاجة لمتابعة غياب',
        count: needsAttention,
        pct: Math.round((needsAttention / total) * 100),
        color: '#DDD6FE',
        caseTarget: 'absent_only' as ShiftCasePageType,
      },
      {
        id: 'suspended',
        label: 'حسابات موقوفة مؤقتاً',
        count: suspendedOrLeave,
        pct: Math.max(
          0,
          100 -
            Math.round((highPerformers / total) * 100) -
            Math.round((regularActive / total) * 100) -
            Math.round((needsAttention / total) * 100)
        ),
        color: '#F8FAFC',
        caseTarget: 'all_shifts' as ShiftCasePageType,
      },
    ];
  }, [employees, summaries]);

  const openCasePage = (caseType: ShiftCasePageType) => {
    setDrillDown(null);
    onNavigateSnapshot({
      route: 'dashboard',
      viewTab: 'grid',
      casePage: caseType,
    });
  };

  const openTeamDrillDown = (teamRow: (typeof teamRegions)[number]) => {
    const canGoTeams = canAccessRoute(currentUser, 'teams', securityPolicy);
    const isSuperAdmin = currentUser.role === 'super_admin';

    setDrillDown({
      id: `team_${teamRow.teamId}`,
      titleAr: `تفاصيل القطاع / الفريق: ${teamRow.teamName}`,
      subtitleAr: `ملخص مبسط لأداء الفريق خلال ${MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
      headlineValue: `${teamRow.hours}`,
      headlineUnit: 'ساعة عمل مسجلة',
      deltaText: `${teamRow.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(teamRow.deltaPct)}% مقارنة بالشهر السابق`,
      deltaPositive: teamRow.deltaPct >= 0,
      summaryPoints: [
        { label: 'عدد مندوبي الفريق', value: `${teamRow.members.length} مندوب`, tone: 'violet' },
        { label: 'أيام الحضور المعتمدة', value: `${teamRow.workedDays} يوم`, tone: 'emerald' },
        { label: 'نسبة الالتزام بالحضور', value: `${teamRow.commitmentPct}%`, tone: 'emerald' },
        { label: 'معدل الغياب والتعثر', value: `${teamRow.absencePct}%`, tone: 'rose' },
      ],
      matchedEmployees: teamRow.members.slice(0, 8).map((emp) => {
        const s = summaries[emp.id];
        return {
          emp,
          metricLabel: 'الساعات · الأداء',
          metricValue: `${s?.totalHours ?? 0} س (${s?.performanceRate ?? 0}%)`,
          subText: `${emp.employeeCode} · حضور ${s?.workedDays ?? 0} ي · غياب ${s?.absentDays ?? 0} ي`,
        };
      }),
      primaryActionLabel: canGoTeams
        ? 'الانتقال إلى صفحة إدارة الفرق والمشرفين'
        : 'فتح الجدول الشهري التفصيلي',
      onPrimaryAction: () => {
        setDrillDown(null);
        if (canGoTeams) {
          if (isSuperAdmin) {
            onNavigateSnapshot({
              route: 'security_center',
              viewTab: 'grid',
              casePage: null,
              securityTab: 'teams' as SecurityHubTab,
            });
          } else {
            onNavigateSnapshot({
              route: 'teams',
              viewTab: 'grid',
              casePage: null,
            });
          }
        } else {
          onOpenMonthlyGridWithFilter({});
        }
      },
      secondaryActionLabel: 'استعراض كل مندوبي الشهر بالجدول',
      onSecondaryAction: () => {
        setDrillDown(null);
        onOpenMonthlyGridWithFilter({});
      },
    });
  };

  // بناء مسار منحنى الأداء المزدوج (SVG Dual Smooth Line Chart) لبطاقة صافي الانضباط
  const trendPaths = useMemo(() => {
    const w = 320;
    const h = 115;
    const padX = 12;
    const padY = 14;
    const ptsCount = Math.max(eightBuckets.length, 2);
    const maxVal = Math.max(
      ...eightBuckets.map((b) => Math.max(b.workedCount, b.prevWorkedCount)),
      5
    );

    const toCoord = (idx: number, val: number) => {
      const x = padX + (idx / (ptsCount - 1)) * (w - padX * 2);
      const y = h - padY - (val / maxVal) * (h - padY * 2);
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    };

    const smoothPath = (coords: { x: number; y: number }[]) => {
      if (coords.length === 0) return '';
      if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
      let d = `M ${coords[0].x} ${coords[0].y}`;
      for (let i = 0; i < coords.length - 1; i++) {
        const c0 = coords[i];
        const c1 = coords[i + 1];
        const midX = Number(((c0.x + c1.x) / 2).toFixed(1));
        d += ` C ${midX} ${c0.y}, ${midX} ${c1.y}, ${c1.x} ${c1.y}`;
      }
      return d;
    };

    const currCoords = eightBuckets.map((b, idx) => toCoord(idx, b.workedCount));
    const prevCoords = eightBuckets.map((b, idx) => toCoord(idx, b.prevWorkedCount));

    const currLine = smoothPath(currCoords);
    const prevLine = smoothPath(prevCoords);
    const areaPath =
      currCoords.length > 1
        ? `${currLine} L ${currCoords[currCoords.length - 1].x} ${h - padY} L ${
            currCoords[0].x
          } ${h - padY} Z`
        : '';

    return { w, h, padY, maxVal, currLine, prevLine, areaPath, currCoords };
  }, [eightBuckets]);

  // البطاقات الست الدائرية في المنتصف (تطابق الـ 6 بطاقات في الصورة المرجعية)
  const sixRingKpis = [
    {
      id: 'kpi_selected_shifts',
      title: 'إجمالي الشفتات المجدولة',
      icon: <CalendarCheck className="w-4 h-4 text-violet-600 dark:text-violet-300" />,
      value: formatCompactNumber(metrics.selectedDays),
      unit: 'شفت',
      delta: metrics.selectedDelta,
      ringPct: metrics.scheduleSelectionRate,
      onClick: () =>
        setDrillDown({
          id: 'drill_selected_shifts',
          titleAr: 'تفاصيل الشفتات المجدولة للشهر',
          subtitleAr: `نسبة تغطية الجدولة ${metrics.scheduleSelectionRate}% خلال ${activeScopeLabel}`,
          headlineValue: `${metrics.selectedDays}`,
          headlineUnit: 'شفت محجوز',
          deltaText: `${metrics.selectedDelta >= 0 ? '▲' : '▼'} ${Math.abs(metrics.selectedDelta)}% ${comparisonLabel}`,
          deltaPositive: metrics.selectedDelta >= 0,
          summaryPoints: [
            { label: 'شفتات نُفذت بحضور فعلي', value: `${metrics.workedDays} شفت`, tone: 'emerald' },
            { label: 'شفتات محجوزة لم تُنفذ', value: `${metrics.missedShifts} شفت`, tone: 'rose' },
            { label: 'نسبة تغطية الجدولة', value: `${metrics.scheduleSelectionRate}%`, tone: 'violet' },
            { label: 'إجازات وراحات معتمدة', value: `${metrics.leaveAndOffDays} يوم`, tone: 'amber' },
          ],
          matchedEmployees: employees
            .filter(
              (e) =>
                (effectiveSummaries[e.id]?.remainingDays ?? 0) > 0 ||
                (effectiveSummaries[e.id]?.selectedDays ?? 0) > 0
            )
            .slice(0, 6)
            .map((emp) => ({
              emp,
              metricLabel: 'شفتات محددة',
              metricValue: `${effectiveSummaries[emp.id]?.selectedDays ?? 0} يوم`,
              subText: `عمل فعلي: ${effectiveSummaries[emp.id]?.workedDays ?? 0} يوم`,
            })),
          primaryActionLabel: 'فتح صفحة: لم يكمل جدولة الشهر',
          onPrimaryAction: () => openCasePage('incomplete_schedule'),
          secondaryActionLabel: 'فتح صفحة كل حالات الشفتات',
          onSecondaryAction: () => openCasePage('all_shifts'),
        }),
    },
    {
      id: 'kpi_worked_shifts',
      title: 'إجمالي الحضور المعتمد',
      icon: <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-300" />,
      value: formatCompactNumber(metrics.workedDays),
      unit: 'حضور',
      delta: metrics.workedDelta,
      ringPct: metrics.shiftExecutionRate,
      onClick: () =>
        setDrillDown({
          id: 'drill_worked_shifts',
          titleAr: 'تفاصيل الحضور الفعلي المعتمد',
          subtitleAr: `المندوبون الذين باشروا العمل الفعلي خلال ${activeScopeLabel}`,
          headlineValue: `${metrics.workedDays}`,
          headlineUnit: 'يوم عمل فعلي',
          deltaText: `نسبة تنفيذ الشفتات المحجوزة: ${metrics.shiftExecutionRate}%`,
          deltaPositive: true,
          summaryPoints: [
            { label: 'إجمالي ساعات العمل', value: `${metrics.totalHours} ساعة`, tone: 'violet' },
            { label: 'المندوبون النشطون', value: `${metrics.activeCount} مندوب`, tone: 'emerald' },
            {
              label: 'تاريخ المرجع',
              value: activeMonthDay ? activeMonthDay.dateStr : todayStr,
              tone: 'violet',
            },
          ],
          matchedEmployees: [...employees]
            .sort(
              (a, b) =>
                (effectiveSummaries[b.id]?.workedDays ?? 0) -
                (effectiveSummaries[a.id]?.workedDays ?? 0)
            )
            .slice(0, 6)
            .map((emp) => ({
              emp,
              metricLabel: 'حضور · ساعات',
              metricValue: `${effectiveSummaries[emp.id]?.workedDays ?? 0} ي (${effectiveSummaries[emp.id]?.totalHours ?? 0} س)`,
              subText: emp.employeeCode,
            })),
          primaryActionLabel: 'فتح صفحة الحاضرين فعلياً',
          onPrimaryAction: () => openCasePage('worked_only'),
          secondaryActionLabel: 'فتح الجدول الشهري الكامل',
          onSecondaryAction: () => {
            setDrillDown(null);
            onOpenMonthlyGridWithFilter({ filterAttendance: 'worked_only' });
          },
        }),
    },
    {
      id: 'kpi_absence_rate',
      title: 'معدل الغياب والتعثر',
      icon: <AlertTriangle className="w-4 h-4 text-violet-600 dark:text-violet-300" />,
      value: `${Math.round(metrics.absenceRate)}%`,
      unit: `${metrics.absentDays} غياب`,
      delta: metrics.absenceDelta,
      invertDeltaColor: true,
      ringPct: Number((100 - metrics.absenceRate).toFixed(2)),
      onClick: () =>
        setDrillDown({
          id: 'drill_absence_rate',
          titleAr: 'تفاصيل حالات الغياب والشفتات الفائتة',
          subtitleAr: `قائمة مبسطة بالمندوبين الذين سُجّل عليهم غياب خلال ${activeScopeLabel}`,
          headlineValue: `${metrics.absentDays}`,
          headlineUnit: 'حالة غياب مسجلة',
          deltaText: `نسبة الانضباط المقابلة: ${(100 - metrics.absenceRate).toFixed(1)}%`,
          deltaPositive: metrics.absenceRate < 10,
          summaryPoints: [
            { label: 'أيام الغياب الصريح والضمني', value: `${metrics.absentDays} يوم`, tone: 'rose' },
            { label: 'اختار الشفت ولم يعمل', value: `${metrics.missedShifts} شفت`, tone: 'amber' },
            { label: 'معدل الغياب العام', value: `${metrics.absenceRate}%`, tone: 'rose' },
          ],
          matchedEmployees: [...employees]
            .filter((e) => (effectiveSummaries[e.id]?.absentDays ?? 0) > 0)
            .sort(
              (a, b) =>
                (effectiveSummaries[b.id]?.absentDays ?? 0) -
                (effectiveSummaries[a.id]?.absentDays ?? 0)
            )
            .slice(0, 6)
            .map((emp) => ({
              emp,
              metricLabel: 'أيام الغياب',
              metricValue: `${effectiveSummaries[emp.id]?.absentDays ?? 0} يوم`,
              subText: `شفتات لم يحضرها: ${effectiveSummaries[emp.id]?.selectedNotWorkedDays ?? 0}`,
            })),
          primaryActionLabel: 'فتح صفحة سجل حالات الغياب',
          onPrimaryAction: () => openCasePage('absent_only'),
          secondaryActionLabel: 'فتح صفحة: اختار الشفت ولم يعمل',
          onSecondaryAction: () => openCasePage('selected_not_worked'),
        }),
    },
    {
      id: 'kpi_requests_approval',
      title: 'معدل إنجاز الطلبات',
      icon: <FileCheck2 className="w-4 h-4 text-violet-600 dark:text-violet-300" />,
      value: `${Math.round(metrics.requestsResolutionRate)}%`,
      unit: `${metrics.pendingReqs} معلق`,
      delta: metrics.pendingReqs === 0 ? 4.2 : -metrics.pendingReqs,
      ringPct: metrics.requestsResolutionRate,
      onClick: () =>
        setDrillDown({
          id: 'drill_requests',
          titleAr: 'تفاصيل طلبات الإجازات وتصحيح الحضور',
          subtitleAr: `ملخص حالة الطلبات خلال ${activeScopeLabel}`,
          headlineValue: `${metrics.totalReqs}`,
          headlineUnit: 'إجمالي الطلبات',
          deltaText:
            metrics.pendingReqs > 0
              ? `يوجد ${metrics.pendingReqs} طلب بانتظار المراجعة والاعتماد`
              : 'جميع الطلبات تمت مراجعتها بالكامل',
          deltaPositive: metrics.pendingReqs === 0,
          summaryPoints: [
            { label: 'طلبات بانتظار الاعتماد', value: `${metrics.pendingReqs}`, tone: 'amber' },
            {
              label: 'طلبات معتمدة',
              value: `${metrics.scopedRequests.filter((r) => r.status === 'approved').length}`,
              tone: 'emerald',
            },
            {
              label: 'طلبات مرفوضة',
              value: `${metrics.scopedRequests.filter((r) => r.status === 'rejected').length}`,
              tone: 'rose',
            },
            { label: 'نسبة الإنجاز', value: `${metrics.requestsResolutionRate}%`, tone: 'violet' },
          ],
          primaryActionLabel: 'الانتقال إلى صفحة الطلبات والإجازات',
          onPrimaryAction: () => {
            setDrillDown(null);
            onNavigateSnapshot({ route: 'requests', viewTab: 'grid', casePage: null });
          },
        }),
    },
    {
      id: 'kpi_commitment',
      title: 'معدل التزام القوة العاملة',
      icon: <Award className="w-4 h-4 text-violet-600 dark:text-violet-300" />,
      value: `${Math.round(metrics.commitmentRate)}%`,
      unit: 'انضباط',
      delta: metrics.commitmentDelta,
      ringPct: metrics.commitmentRate,
      onClick: () =>
        setDrillDown({
          id: 'drill_commitment',
          titleAr: 'تفاصيل مؤشر الالتزام والأداء',
          subtitleAr: `نسبة أيام الحضور الفعلي إلى إجمالي الأيام المستحقة خلال ${activeScopeLabel}`,
          headlineValue: `${metrics.commitmentRate}%`,
          headlineUnit: 'معدل الالتزام العام',
          deltaText: `${metrics.commitmentDelta >= 0 ? '▲' : '▼'} ${Math.abs(metrics.commitmentDelta)}% ${comparisonLabel}`,
          deltaPositive: metrics.commitmentDelta >= 0,
          summaryPoints: [
            { label: 'أيام الحضور الفعلي', value: `${metrics.workedDays} يوم`, tone: 'emerald' },
            { label: 'أيام الغياب المحتسبة', value: `${metrics.absentDays} يوم`, tone: 'rose' },
            { label: 'المندوبون الجاهزون للعمل', value: `${metrics.activeCount} مندوب`, tone: 'violet' },
          ],
          matchedEmployees: [...employees]
            .sort(
              (a, b) =>
                (effectiveSummaries[b.id]?.commitmentRate ?? 0) -
                (effectiveSummaries[a.id]?.commitmentRate ?? 0)
            )
            .slice(0, 6)
            .map((emp) => ({
              emp,
              metricLabel: 'نسبة الالتزام',
              metricValue: `${effectiveSummaries[emp.id]?.commitmentRate ?? 0}%`,
              subText: `${effectiveSummaries[emp.id]?.workedDays ?? 0} يوم عمل`,
            })),
          primaryActionLabel: 'فتح صفحة ملخص الأداء والتقارير المستقلة',
          onPrimaryAction: () => {
            setDrillDown(null);
            onNavigateSnapshot({ route: 'analytics', viewTab: 'grid', casePage: null });
          },
        }),
    },
    {
      id: 'kpi_digital_sync',
      title: 'الربط الرقمي والحسابات',
      icon: <Globe className="w-4 h-4 text-violet-600 dark:text-violet-300" />,
      value: `${Math.round(metrics.digitalAdoptionRate)}%`,
      unit: `${metrics.linkedDigitalCount} مربوط`,
      delta: 3.3,
      ringPct: metrics.digitalAdoptionRate,
      onClick: () => {
        const canGoUsers = canAccessRoute(currentUser, 'users', securityPolicy);
        const isSuperAdmin = currentUser.role === 'super_admin';
        setDrillDown({
          id: 'drill_digital_adoption',
          titleAr: 'تفاصيل التفعيل الرقمي وربط المعرفات',
          subtitleAr: 'المندوبون المربوطون بحسابات دخول أو معرفات خارجية (External ID)',
          headlineValue: `${metrics.linkedDigitalCount}`,
          headlineUnit: `من أصل ${metrics.totalEmployees} مندوب`,
          deltaText: `نسبة التغطية الرقمية: ${metrics.digitalAdoptionRate}%`,
          deltaPositive: metrics.digitalAdoptionRate >= 50,
          summaryPoints: [
            { label: 'مندوبون بمعرف خارجي أو حساب', value: `${metrics.linkedDigitalCount}`, tone: 'violet' },
            {
              label: 'غير مربوطين بعد',
              value: `${Math.max(0, metrics.totalEmployees - metrics.linkedDigitalCount)}`,
              tone: 'amber',
            },
            { label: 'حالة آخر مزامنة خارجية', value: securityPolicy.lastExternalSyncStatus || 'جاهز', tone: 'emerald' },
          ],
          primaryActionLabel: canGoUsers
            ? 'الانتقال إلى صفحة إدارة الحسابات والمستخدمين'
            : 'فتح الجدول الشهري للمندوبين',
          onPrimaryAction: () => {
            setDrillDown(null);
            if (canGoUsers) {
              if (isSuperAdmin) {
                onNavigateSnapshot({
                  route: 'security_center',
                  viewTab: 'grid',
                  casePage: null,
                  securityTab: 'users',
                });
              } else {
                onNavigateSnapshot({ route: 'users', viewTab: 'grid', casePage: null });
              }
            } else {
              onOpenMonthlyGridWithFilter({});
            }
          },
        });
      },
    },
  ];

  // المضلعات الخمسة لخريطة القطاعات التفاعلية (تحاكي الخريطة البنفسجية في الصورة المرجعية)
  const regionMapPolygons = [
    {
      index: 0,
      d: 'M 75 18 L 132 14 L 146 48 L 106 64 L 68 46 Z',
      fill: '#1E293B',
      activeFill: '#4C1D95',
    },
    {
      index: 1,
      d: 'M 132 14 L 185 32 L 214 78 L 165 92 L 146 48 Z',
      fill: '#A78BFA',
      activeFill: '#8B5CF6',
    },
    {
      index: 2,
      d: 'M 106 64 L 146 48 L 165 92 L 136 124 L 92 102 Z',
      fill: '#7C3AED',
      activeFill: '#6D28D9',
    },
    {
      index: 3,
      d: 'M 68 46 L 106 64 L 92 102 L 58 84 Z',
      fill: '#475569',
      activeFill: '#5B21B6',
    },
    {
      index: 4,
      d: 'M 92 102 L 136 124 L 198 112 L 214 78 L 165 92 L 128 144 L 88 128 Z',
      fill: '#DDD6FE',
      activeFill: '#C4B5FD',
    },
  ];

  const maxBucketHours = Math.max(...eightBuckets.map((b) => b.hours), 10);

  return (
    <main className="flex-1 bg-slate-100 dark:bg-[#070B19] text-slate-900 dark:text-slate-100 px-4 sm:px-6 py-5 transition-colors duration-150">
      <div className="max-w-[1860px] mx-auto space-y-5">
        {/* ===================================================================== */}
        {/* 1. الشريط العلوي للرئيسية (العنوان + مبدل الأيام والأشهر والسنوات)    */}
        {/* ===================================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              نظرة عامة على الأداء التشغيلي والشفتات
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {activeMonthDay
                ? `عرض بيانات يوم ${activeScopeLabel} — تنقل بحرية بين الأيام أو اضغط على أي مؤشر للتفاصيل`
                : `ملخص ساعات العمل، التزام المندوبين، وتوزيع الفرق (${activeScopeLabel}) — اضغط على أي مؤشر للتفاصيل`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* الوصول المباشر للجدول التفصيلي الكامل */}
            <button
              type="button"
              onClick={() => onOpenMonthlyGridWithFilter({})}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>الجدول الشهري التفصيلي</span>
            </button>

            {/* مبدل الأيام والأشهر المرن (يتيح التنقل الحر يومياً أو اختيار أي يوم من التقويم أو عرض الشهر كاملاً) */}
            <div
              ref={dayNavigatorRef}
              className={`relative flex items-center bg-white dark:bg-[#0E1528] border rounded-xl p-1 transition-colors ${
                activeMonthDay
                  ? 'border-violet-500/80 dark:border-violet-500/80 ring-2 ring-violet-500/15'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => handleStepDay(-1)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                title="اليوم السابق"
                aria-label="اليوم السابق"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsDayPickerOpen((prev) => !prev)}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/70 text-xs font-extrabold text-slate-800 dark:text-slate-100 min-w-[126px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                title="اضغط لاختيار أي يوم بحرية أو التبديل بين اليوم والشهر"
                aria-expanded={isDayPickerOpen}
              >
                <Calendar className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                <span className="whitespace-nowrap">
                  {activeMonthDay
                    ? `${activeMonthDay.dayName} ${activeMonthDay.dayNumber} ${MONTH_NAMES[currentMonth - 1]}`
                    : `${MONTH_NAMES[currentMonth - 1]} · كل الأيام`}
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-slate-400 transition-transform shrink-0 ${
                    isDayPickerOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {activeMonthDay && (
                <button
                  type="button"
                  onClick={() => setSelectedDateStr(null)}
                  className="p-1 mx-0.5 rounded-md bg-violet-500/10 hover:bg-violet-500/20 text-violet-700 dark:text-violet-300 cursor-pointer transition-colors"
                  title="إلغاء تحديد اليوم وعرض كل أيام الشهر"
                  aria-label="عرض كل أيام الشهر"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              <button
                type="button"
                onClick={() => handleStepDay(1)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                title="اليوم التالي"
                aria-label="اليوم التالي"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* القائمة المنبثقة لاختيار أي يوم بحرية كاملة */}
              {isDayPickerOpen && (
                <div
                  role="dialog"
                  aria-label="التنقل الحر بين الأيام"
                  className="absolute top-full mt-2 left-0 sm:right-0 sm:left-auto z-50 w-[308px] sm:w-[330px] bg-white dark:bg-[#0E1528] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3.5 space-y-3 text-xs"
                >
                  {/* شريط تبديل الشهر داخل النافذة */}
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-[#141D35] border border-slate-200/80 dark:border-slate-800 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => handleStepMonth(-1)}
                      className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                      title="الشهر السابق"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {MONTH_NAMES[currentMonth - 1]}{' '}
                      <span className="font-mono tabular-nums">{currentYear}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStepMonth(1)}
                      className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                      title="الشهر التالي"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>

                  {/* أزرار القفز السريع: اليوم الحالي أو كل أيام الشهر */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        selectDateParts(
                          today.getFullYear(),
                          today.getMonth() + 1,
                          today.getDate()
                        );
                        setIsDayPickerOpen(false);
                      }}
                      className={`px-2.5 py-2 rounded-xl font-extrabold transition-colors cursor-pointer text-center border ${
                        activeMonthDay?.dateStr === todayStr
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-slate-50 dark:bg-[#141D35] hover:bg-violet-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      اليوم ({today.getDate()} {MONTH_NAMES[today.getMonth()]})
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDateStr(null);
                        setIsDayPickerOpen(false);
                      }}
                      className={`px-2.5 py-2 rounded-xl font-extrabold transition-colors cursor-pointer text-center border ${
                        !activeMonthDay
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-slate-50 dark:bg-[#141D35] hover:bg-violet-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      كل أيام الشهر ({monthDaysList.length})
                    </button>
                  </div>

                  {/* اختيار تاريخ محدد مباشرة من منتقي التاريخ */}
                  <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#141D35] border border-slate-200/80 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      انتقال لتاريخ:
                    </span>
                    <input
                      type="date"
                      dir="ltr"
                      value={
                        activeMonthDay
                          ? activeMonthDay.dateStr
                          : `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [yStr, mStr, dStr] = val.split('-');
                        const y = Number(yStr);
                        const m = Number(mStr);
                        const d = Number(dStr);
                        if (y && m && d) {
                          selectDateParts(y, m, d);
                          setIsDayPickerOpen(false);
                        }
                      }}
                      className="bg-white dark:bg-[#090E1D] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  {/* شبكة أيام الشهر للتنقل الفوري بالضغط على أي يوم */}
                  <div className="grid grid-cols-7 gap-1 pt-1">
                    {monthDaysList.map((d) => {
                      const isSelected = activeMonthDay?.dayNumber === d.dayNumber;
                      const isTodayCell = d.dateStr === todayStr;
                      const st = dayStatsByNumber[d.dayNumber];
                      const hasData =
                        st && (st.worked > 0 || st.selected > 0 || st.absent > 0);

                      return (
                        <button
                          key={d.dateStr}
                          type="button"
                          onClick={() => {
                            setSelectedDateStr(d.dateStr);
                            setIsDayPickerOpen(false);
                          }}
                          title={`${d.dayName} ${d.dayNumber} ${MONTH_NAMES[currentMonth - 1]} — حضور: ${st?.worked ?? 0} | مجدول: ${st?.selected ?? 0}`}
                          className={`relative py-1.5 px-0.5 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-violet-600 text-white border-violet-500 font-extrabold shadow-xs'
                              : isTodayCell
                              ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/50 font-extrabold'
                              : 'bg-slate-50/70 dark:bg-[#121A30] hover:bg-violet-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-transparent'
                          }`}
                        >
                          <span className="text-[9px] opacity-75 leading-none mb-0.5 truncate max-w-full">
                            {d.dayName}
                          </span>
                          <span className="text-xs font-mono tabular-nums leading-tight">
                            {d.dayNumber}
                          </span>
                          {hasData && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                                isSelected
                                  ? 'bg-white'
                                  : st.worked > 0
                                  ? 'bg-emerald-500'
                                  : st.absent > 0
                                  ? 'bg-rose-500'
                                  : 'bg-violet-400'
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* شريط السنوات المقسم المطابق للصورة المرجعية (2024 | 2025 | 2026) */}
            <div
              className="flex items-center bg-white dark:bg-[#0E1528] border border-slate-200 dark:border-slate-800 rounded-xl p-1"
              dir="ltr"
            >
              {yearOptions.map((yr) => {
                const isActive = yr === currentYear;
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => {
                      if (activeMonthDay) {
                        selectDateParts(yr, currentMonth, activeMonthDay.dayNumber);
                      } else {
                        onChangeMonth(yr, currentMonth);
                      }
                    }}
                    className={`min-w-[68px] px-3.5 py-1.5 rounded-lg text-xs font-mono tabular-nums font-extrabold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-violet-600/15 dark:bg-[#171F38] text-violet-700 dark:text-white border border-violet-500 shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'
                    }`}
                  >
                    {yr}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* لافتة مساعدة في حال كانت قاعدة البيانات فارغة تماماً */}
        {employees.length === 0 && (
          <div className="bg-white dark:bg-[#0E1528] border border-violet-500/30 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                لا توجد بيانات مندوبين مسجلة في هذا النطاق بعد
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                بمجرد إضافة أول مندوب أو تهيئة بيانات التجربة، ستعمل جميع المخططات التفاعلية والعدادات الدائرية تلقائياً.
              </p>
            </div>
            {canCreateEmp && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isMigratingLocal}
                  onClick={onGenerateDemoDelegates}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isMigratingLocal ? 'جارٍ التهيئة...' : 'تهيئة 100 مندوب للتجربة'}
                </button>
                <button
                  type="button"
                  onClick={onOpenAddEmployee}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>إضافة أول مندوب</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* 2. الشبكة التحليلية ثلاثية المناطق المطابقة للصورة المرجعية (12 عمود) */}
        {/* ===================================================================== */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
          {/* ------------------------------------------------------------------- */}
          {/* العمود الأول (3 أعمدة): إجمالي الساعات + صافي الانضباط والمنحنى     */}
          {/* ------------------------------------------------------------------- */}
          <div className="xl:col-span-3 flex flex-col gap-4">
            {/* بطاقة 1: إجمالي ساعات التشغيل (تحاكي Total Revenue) */}
            <div
              onClick={() =>
                setDrillDown({
                  id: 'drill_total_hours',
                  titleAr: `تفاصيل إجمالي ساعات التشغيل (${activeScopeLabel})`,
                  subtitleAr: `مقارنة الساعات المحققة بالمستهدف (${metrics.targetMonthlyHours} ساعة)`,
                  headlineValue: `${metrics.totalHours}`,
                  headlineUnit: 'ساعة عمل فعلية',
                  deltaText: `${metrics.hoursDelta >= 0 ? '▲' : '▼'} ${Math.abs(metrics.hoursDelta)}% ${comparisonLabel}`,
                  deltaPositive: metrics.hoursDelta >= 0,
                  summaryPoints: [
                    { label: 'المستهدف المعتمد', value: `${metrics.targetMonthlyHours} ساعة`, tone: 'violet' },
                    { label: 'نسبة تحقيق المستهدف', value: `${metrics.hoursTargetRatio}%`, tone: 'emerald' },
                    { label: 'إجمالي أيام العمل الفعلية', value: `${metrics.workedDays} يوم`, tone: 'emerald' },
                    { label: 'عدد المندوبين النشطين', value: `${metrics.activeCount} مندوب`, tone: 'violet' },
                  ],
                  matchedEmployees: [...employees]
                    .sort(
                      (a, b) =>
                        (effectiveSummaries[b.id]?.totalHours ?? 0) -
                        (effectiveSummaries[a.id]?.totalHours ?? 0)
                    )
                    .slice(0, 6)
                    .map((emp) => ({
                      emp,
                      metricLabel: 'إجمالي الساعات',
                      metricValue: `${effectiveSummaries[emp.id]?.totalHours ?? 0} ساعة`,
                      subText: `متوسط يومي: ${effectiveSummaries[emp.id]?.avgHours ?? 0} س`,
                    })),
                  primaryActionLabel: 'فتح صفحة الحاضرين وساعات العمل',
                  onPrimaryAction: () => openCasePage('worked_only'),
                  secondaryActionLabel: 'فتح الجدول الشهري التفصيلي',
                  onSecondaryAction: () => {
                    setDrillDown(null);
                    onOpenMonthlyGridWithFilter({});
                  },
                })
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.currentTarget.click();
                }
              }}
              className="flex-1 bg-white dark:bg-[#0E1528] border border-slate-200 dark:border-slate-800/90 hover:border-violet-500/70 rounded-2xl p-5 flex flex-col justify-between transition-all cursor-pointer group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-violet-500 dark:group-hover:text-violet-300 transition-colors">
                        إجمالي ساعات التشغيل
                      </h2>
                      <span className="text-[11px] text-slate-400">اضغط للتفاصيل</span>
                    </div>
                  </div>

                  <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#162038] border border-slate-200 dark:border-slate-700/70 text-center">
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      المستهدف: {formatCompactNumber(metrics.targetMonthlyHours)}س
                    </span>
                    <span className="block text-xs font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {metrics.hoursTargetRatio}%
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatCompactNumber(metrics.totalHours)}{' '}
                    <span className="text-sm font-sans font-bold text-slate-500 dark:text-slate-400">
                      ساعة
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs font-mono tabular-nums">
                    <span
                      className={
                        metrics.hoursDelta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                          : 'text-rose-600 dark:text-rose-400 font-bold'
                      }
                    >
                      {metrics.hoursDelta >= 0 ? '▲' : '▼'} {Math.abs(metrics.hoursDelta)}%
                    </span>
                    <span className="text-slate-400 font-sans text-[11px]">
                      {comparisonLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* الرسم العمودي ذو الـ 8 أعمدة مع الخلفية الداكنة (Track Bars) */}
              <div className="mt-6 pt-2">
                <div className="grid grid-cols-8 gap-2 items-end h-28">
                  {eightBuckets.map((b) => {
                    const hPct = Math.max(10, Math.round((b.hours / maxBucketHours) * 100));
                    return (
                      <button
                        key={b.index}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (b.dayNumbers.length === 1 && activeMonthDay) {
                            selectDateParts(currentYear, currentMonth, b.dayNumbers[0]);
                            return;
                          }
                          setDrillDown({
                            id: `bucket_${b.index}`,
                            titleAr: `تفاصيل الفترة: ${b.rangeText}`,
                            subtitleAr: 'ملخص الحضور والساعات المسجلة خلال هذه الأيام',
                            headlineValue: `${b.hours}`,
                            headlineUnit: 'ساعة عمل فعلية',
                            deltaText: `${b.workedCount} عملية حضور مقابل ${b.absentCount} غياب`,
                            deltaPositive: b.workedCount >= b.absentCount,
                            summaryPoints: [
                              { label: 'النطاق الزمني', value: b.rangeText, tone: 'violet' },
                              { label: 'مرات الحضور الفعلي', value: `${b.workedCount}`, tone: 'emerald' },
                              { label: 'حالات الغياب المسجلة', value: `${b.absentCount}`, tone: 'rose' },
                              { label: 'الحضور بالشهر السابق لنفس الفترة', value: `${b.prevWorkedCount}`, tone: 'amber' },
                            ],
                            primaryActionLabel: `الانتقال لعرض يوم ${b.dayNumbers[0]} ${MONTH_NAMES[currentMonth - 1]}`,
                            onPrimaryAction: () => {
                              setDrillDown(null);
                              selectDateParts(currentYear, currentMonth, b.dayNumbers[0]);
                            },
                            secondaryActionLabel: 'فتح الجدول الشهري الكامل',
                            onSecondaryAction: () => {
                              setDrillDown(null);
                              onOpenMonthlyGridWithFilter({});
                            },
                          });
                        }}
                        className="flex flex-col items-center gap-1.5 h-full justify-end group/bar cursor-pointer"
                        title={`${b.rangeText}: ${b.hours} ساعة`}
                      >
                        <div
                          className={`w-full h-24 rounded-t-md bg-slate-200/80 dark:bg-[#19233C] relative overflow-hidden flex items-end ${
                            b.isSelectedDayBucket ? 'ring-2 ring-violet-500 dark:ring-violet-400' : ''
                          }`}
                        >
                          <div
                            className={`w-full rounded-t-md transition-all ${
                              b.isSelectedDayBucket
                                ? 'bg-gradient-to-t from-violet-500 to-fuchsia-400'
                                : 'bg-gradient-to-t from-violet-600 to-violet-400 group-hover/bar:from-violet-500 group-hover/bar:to-violet-300'
                            }`}
                            style={{ height: `${hPct}%` }}
                          />
                        </div>
                        <span
                          className={`text-[10px] font-mono tabular-nums truncate max-w-full ${
                            b.isSelectedDayBucket
                              ? 'font-extrabold text-violet-700 dark:text-violet-300'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {b.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* بطاقة 2: صافي الانضباط التشغيلي والمنحنى المزدوج (تحاكي Net Profit) */}
            <div
              onClick={() =>
                setDrillDown({
                  id: 'drill_net_discipline',
                  titleAr: 'تفاصيل صافي الانضباط التشغيلي للشفتات',
                  subtitleAr: 'تحليل الشفتات المنفذة مقابل الفاقد والغياب والإجازات',
                  headlineValue: `${metrics.workedDays}`,
                  headlineUnit: 'شفت منفذ بنجاح',
                  deltaText: `معدل الالتزام الصافي: ${metrics.commitmentRate}%`,
                  deltaPositive: metrics.commitmentRate >= 80,
                  summaryPoints: [
                    { label: 'شفتات منفذة بحضور فعلي', value: `${metrics.workedDays} يوم`, tone: 'emerald' },
                    { label: 'شفتات محجوزة لم يعمل بها', value: `${metrics.missedShifts} يوم`, tone: 'rose' },
                    { label: 'إجازات وأيام راحة معتمدة', value: `${metrics.leaveAndOffDays} يوم`, tone: 'amber' },
                    { label: 'نسبة تنفيذ الجدول', value: `${metrics.shiftExecutionRate}%`, tone: 'violet' },
                  ],
                  primaryActionLabel: 'فتح صفحة ملخص الأداء التحليلي',
                  onPrimaryAction: () => {
                    setDrillDown(null);
                    onNavigateSnapshot({ route: 'analytics', viewTab: 'grid', casePage: null });
                  },
                  secondaryActionLabel: 'مراجعة الشفتات غير المنفذة',
                  onSecondaryAction: () => openCasePage('selected_not_worked'),
                })
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.currentTarget.click();
                }
              }}
              className="flex-[1.25] bg-white dark:bg-[#0E1528] border border-slate-200 dark:border-slate-800/90 hover:border-violet-500/70 rounded-2xl p-5 flex flex-col justify-between transition-all cursor-pointer group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-violet-500 dark:group-hover:text-violet-300 transition-colors">
                        صافي الشفتات المنفذة
                      </h2>
                      <span className="text-[11px] text-slate-400">اضغط للتفاصيل</span>
                    </div>
                  </div>

                  <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#162038] border border-slate-200 dark:border-slate-700/70 text-center">
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                      هامش الانضباط
                    </span>
                    <span className="block text-xs font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {Math.round(metrics.commitmentRate)}%
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatCompactNumber(metrics.workedDays)}{' '}
                    <span className="text-sm font-sans font-bold text-slate-500 dark:text-slate-400">
                      يوم عمل
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs font-mono tabular-nums">
                    <span
                      className={
                        metrics.workedDelta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                          : 'text-rose-600 dark:text-rose-400 font-bold'
                      }
                    >
                      {metrics.workedDelta >= 0 ? '▲' : '▼'} {Math.abs(metrics.workedDelta)}%
                    </span>
                    <span className="text-slate-400 font-sans text-[11px]">
                      {comparisonLabel}
                    </span>
                  </div>
                </div>

                {/* 3 أشرطة تقدم أفقية فرعية مطابقة للصورة المرجعية */}
                <div className="mt-5 space-y-2.5 text-[11px]">
                  {[
                    {
                      label: 'الشفتات المجدولة',
                      valText: `${metrics.selectedDays} ي`,
                      pct: metrics.scheduleSelectionRate,
                      onSubClick: () => openCasePage('all_shifts'),
                    },
                    {
                      label: 'حالات الغياب والتخلف',
                      valText: `${metrics.absentDays} ي`,
                      pct: Math.min(100, metrics.absenceRate * 2),
                      onSubClick: () => openCasePage('absent_only'),
                    },
                    {
                      label: 'الإجازات والراحات',
                      valText: `${metrics.leaveAndOffDays} ي`,
                      pct: Math.min(
                        100,
                        Math.round(
                          (metrics.leaveAndOffDays /
                            Math.max(metrics.totalEmployees * 6, 1)) *
                            100
                        )
                      ),
                      onSubClick: () =>
                        onNavigateSnapshot({
                          route: 'requests',
                          viewTab: 'grid',
                          casePage: null,
                        }),
                    },
                  ].map((bar) => (
                    <button
                      key={bar.label}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        bar.onSubClick();
                      }}
                      className="w-full grid grid-cols-12 items-center gap-2 hover:opacity-90 cursor-pointer text-right"
                    >
                      <span className="col-span-5 text-slate-600 dark:text-slate-300 truncate">
                        {bar.label}
                      </span>
                      <span className="col-span-3 font-mono tabular-nums font-bold text-slate-900 dark:text-white text-left">
                        {bar.valText}
                      </span>
                      <div className="col-span-4 h-2 rounded-full bg-slate-200 dark:bg-[#19233C] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{ width: `${Math.max(8, bar.pct)}%` }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* منحنى المقارنة المزدوج (الحالي متصل بنفسجي + السابق متقطع) */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-4 text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-violet-500" />
                    حضور الشهر الحالي
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    الشهر السابق
                  </span>
                </div>

                <svg
                  viewBox={`0 0 ${trendPaths.w} ${trendPaths.h}`}
                  className="w-full h-28 overflow-visible"
                >
                  <defs>
                    <linearGradient id="netTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {[0.25, 0.5, 0.75].map((lineRatio) => (
                    <line
                      key={lineRatio}
                      x1={10}
                      x2={trendPaths.w - 10}
                      y1={trendPaths.h * lineRatio}
                      y2={trendPaths.h * lineRatio}
                      stroke="currentColor"
                      strokeOpacity="0.08"
                      strokeWidth="1"
                    />
                  ))}
                  {trendPaths.areaPath && (
                    <path d={trendPaths.areaPath} fill="url(#netTrendFill)" />
                  )}
                  {trendPaths.prevLine && (
                    <path
                      d={trendPaths.prevLine}
                      fill="none"
                      stroke="#94A3B8"
                      strokeWidth="1.6"
                      strokeDasharray="3 3"
                    />
                  )}
                  {trendPaths.currLine && (
                    <path
                      d={trendPaths.currLine}
                      fill="none"
                      stroke="#8B5CF6"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  )}
                </svg>

                <div className="grid grid-cols-8 text-center text-[9px] font-mono tabular-nums text-slate-400 mt-1">
                  {eightBuckets.map((b) => (
                    <span key={b.index}>{b.label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* العمود الأوسط (5 أعمدة): 6 بطاقات حلقية + بطاقة الترتيب الأفقي      */}
          {/* ------------------------------------------------------------------- */}
          <div className="xl:col-span-5 flex flex-col gap-4">
            {/* شبكة 3×2 للبطاقات الست ذات العدادات الحلقية الدائرية */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sixRingKpis.map((card) => {
                const isGoodDelta = card.invertDeltaColor
                  ? card.delta <= 0
                  : card.delta >= 0;

                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={card.onClick}
                    className="text-right bg-white dark:bg-[#0E1528] border border-slate-200 dark:border-slate-800/90 hover:border-violet-500/70 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between gap-2 w-full">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/15 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
                          {card.icon}
                        </div>
                        <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate group-hover:text-violet-500 dark:group-hover:text-violet-300 transition-colors">
                          {card.title}
                        </h3>
                      </div>
                      <ArrowUpLeft className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>

                    <div className="flex items-center justify-between gap-3 w-full">
                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                            {card.value}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {card.unit}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 text-[11px] font-mono tabular-nums">
                          <span
                            className={
                              isGoodDelta
                                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                : 'text-rose-600 dark:text-rose-400 font-bold'
                            }
                          >
                            {card.delta >= 0 ? '▲' : '▼'} {Math.abs(card.delta)}%
                          </span>
                          <span className="text-slate-400 font-sans text-[10px]">
                            مقارنة بالسابق
                          </span>
                        </div>
                      </div>

                      <CircularGaugeRing percentage={card.ringPct} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* البطاقة السفلية العريضة: أعلى الفرق / المندوبين مع مبدل التبويبات الثلاثي */}
            <div className="flex-1 bg-white dark:bg-[#0E1528] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    ترتيب الأداء الأعلى (اضغط للتفاصيل)
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    مقارنة مباشرة حسب الساعات، الشفتات المنفذة، أو أفضل المندوبين
                  </p>
                </div>

                {/* مبدل التبويبات المطابق لـ (Revenue | Loan Volume | Customers) */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090E1D] p-1 rounded-full border border-slate-200 dark:border-slate-800 text-[11px]">
                  {(
                    [
                      { id: 'hours', label: 'الساعات' },
                      { id: 'shifts', label: 'الشفتات' },
                      { id: 'reps', label: 'المندوبون' },
                    ] as const
                  ).map((tab) => {
                    const active = rankingTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setRankingTab(tab.id)}
                        className={`px-3 py-1 rounded-full font-bold transition-all cursor-pointer ${
                          active
                            ? 'bg-white dark:bg-[#171F38] text-violet-700 dark:text-white border border-violet-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {horizontalRankingItems.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  لا توجد سجلات كافية لعرض الترتيب في هذا الشهر بعد.
                </div>
              ) : (
                <div className="space-y-3 my-auto">
                  {horizontalRankingItems.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={row.onSelect}
                      className="w-full grid grid-cols-12 items-center gap-3 py-1 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#151E36] transition-colors cursor-pointer group/row text-right"
                    >
                      <span className="col-span-4 sm:col-span-3 text-xs font-bold text-slate-700 dark:text-slate-200 truncate group-hover/row:text-violet-500 dark:group-hover/row:text-violet-300">
                        {row.label}
                      </span>
                      <div className="col-span-5 sm:col-span-7 h-3 rounded-sm bg-slate-100 dark:bg-[#18223A] overflow-hidden">
                        <div
                          className="h-full rounded-sm bg-gradient-to-l from-violet-400 to-violet-600 transition-all duration-300"
                          style={{ width: `${row.ratio}%` }}
                        />
                      </div>
                      <span className="col-span-3 sm:col-span-2 text-xs font-mono tabular-nums font-extrabold text-slate-900 dark:text-white text-left">
                        {row.valueText}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* العمود الثالث (4 أعمدة): خريطة وجدول الفرق + دونات القوى العاملة    */}
          {/* ------------------------------------------------------------------- */}
          <div className="xl:col-span-4 flex flex-col gap-4">
            {/* البطاقة العلوية: الأداء حسب الفرق والقطاعات + الخريطة التفاعلية */}
            <div className="flex-[1.3] bg-white dark:bg-[#0E1528] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                      أداء الفرق والقطاعات التشغيلية
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      اضغط على أي قطاع بالخريطة أو صف بالجدول للتفاصيل
                    </p>
                  </div>
                </div>
              </div>

              {/* الخريطة التفاعلية المضلعة بنفس تدرجات البنفسجي والكحلي في الصورة */}
              <div className="relative flex items-center justify-center py-1">
                <svg viewBox="45 8 180 142" className="w-full max-w-[260px] h-36">
                  {regionMapPolygons.map((poly) => {
                    const matchedTeam = teamRegions[poly.index % Math.max(teamRegions.length, 1)];
                    return (
                      <path
                        key={poly.index}
                        d={poly.d}
                        fill={poly.fill}
                        stroke="#0B1020"
                        strokeWidth="1.5"
                        onClick={() => {
                          if (matchedTeam) openTeamDrillDown(matchedTeam);
                        }}
                        className="cursor-pointer hover:opacity-85 transition-opacity"
                      >
                        <title>
                          {matchedTeam
                            ? `${matchedTeam.teamName}: ${matchedTeam.hours} ساعة`
                            : 'قطاع تشغيلي'}
                        </title>
                      </path>
                    );
                  })}
                </svg>
              </div>

              {/* جدول القطاعات / الفرق التفاعلي (4 أعمدة مطابقة للصورة) */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                      <th className="py-2 font-bold">الفريق / القطاع</th>
                      <th className="py-2 font-bold">
                        <button
                          type="button"
                          onClick={() => setRegionSortBy('hours')}
                          className="hover:text-violet-400 cursor-pointer"
                        >
                          الساعات {regionSortBy === 'hours' ? '▾' : ''}
                        </button>
                      </th>
                      <th className="py-2 font-bold">
                        <button
                          type="button"
                          onClick={() => setRegionSortBy('delta')}
                          className="hover:text-violet-400 cursor-pointer"
                        >
                          النمو {regionSortBy === 'delta' ? '▾' : ''}
                        </button>
                      </th>
                      <th className="py-2 font-bold text-left">
                        <button
                          type="button"
                          onClick={() => setRegionSortBy('absence')}
                          className="hover:text-violet-400 cursor-pointer"
                        >
                          الغياب % {regionSortBy === 'absence' ? '▾' : ''}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {teamRegions.slice(0, 5).map((row) => (
                      <tr
                        key={row.teamId}
                        onClick={() => openTeamDrillDown(row)}
                        className="hover:bg-slate-50 dark:hover:bg-[#151E36] transition-colors cursor-pointer group/tr"
                      >
                        <td className="py-2.5 font-bold text-slate-800 dark:text-slate-200 group-hover/tr:text-violet-500 dark:group-hover/tr:text-violet-300 truncate max-w-[130px]">
                          {row.teamName}
                        </td>
                        <td className="py-2.5 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                          {row.hours} س
                        </td>
                        <td
                          className={`py-2.5 font-mono tabular-nums font-bold ${
                            row.deltaPct >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {row.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(row.deltaPct)}%
                        </td>
                        <td className="py-2.5 font-mono tabular-nums text-slate-700 dark:text-slate-200 text-left">
                          {row.absencePct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* البطاقة السفلية: إجمالي المندوبين وتوزيع القوى العاملة (Total Workforce Donut) */}
            <div className="flex-1 bg-white dark:bg-[#0E1528] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                      إجمالي القوى العاملة وتوزيع الحالات
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      اضغط على أي فئة لعرض قائمتها المبسطة فوراً
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center justify-around gap-5 my-auto">
                {/* دونات متعددة الشرائح يتوسطها إجمالي المندوبين */}
                <button
                  type="button"
                  onClick={() => openCasePage('all_shifts')}
                  className="relative w-36 h-36 flex items-center justify-center shrink-0 cursor-pointer group/donut"
                  title="اضغط لعرض توزيع كل المندوبين"
                >
                  <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                    <circle
                      cx="60"
                      cy="60"
                      r="46"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="15"
                      className="text-slate-200 dark:text-[#19233C]"
                    />
                    {(() => {
                      const r = 46;
                      const circ = 2 * Math.PI * r;
                      let cumulativePct = 0;
                      return workforceSegments.map((seg) => {
                        const segLen = (seg.pct / 100) * circ;
                        const offset = -(cumulativePct / 100) * circ;
                        cumulativePct += seg.pct;
                        if (seg.pct <= 0) return null;
                        return (
                          <circle
                            key={seg.id}
                            cx="60"
                            cy="60"
                            r={r}
                            fill="transparent"
                            stroke={seg.color}
                            strokeWidth="15"
                            strokeDasharray={`${segLen} ${circ}`}
                            strokeDashoffset={offset}
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white group-hover/donut:text-violet-400 transition-colors">
                      {formatCompactNumber(metrics.totalEmployees)}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      مندوب
                    </span>
                  </div>
                </button>

                {/* مفتاح الفئات التفاعلي (Legend) */}
                <div className="flex-1 space-y-2 min-w-[165px]">
                  {workforceSegments.map((seg) => (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => openCasePage(seg.caseTarget)}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-[#151E36] transition-colors cursor-pointer text-right"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-400/30"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                          {seg.label}
                        </span>
                      </span>
                      <span className="text-xs font-mono tabular-nums font-extrabold text-slate-900 dark:text-white shrink-0">
                        {seg.pct}% ({seg.count})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. اللوحة المنبثقة للتفاصيل المبسطة عند الضغط على أي عنصر في الرئيسية */}
      {/* ===================================================================== */}
      {drillDown && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-4 no-print"
          onClick={() => setDrillDown(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={drillDown.titleAr}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white dark:bg-[#0E1528] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden text-xs"
          >
            {/* رأس التفاصيل المبسطة */}
            <div className="px-5 py-4 bg-slate-900 dark:bg-[#090E1D] text-white border-b border-slate-800 flex items-start justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-violet-400 block mb-0.5">
                  ملخص تفصيلي مبسط
                </span>
                <h3 className="text-base font-extrabold text-white">
                  {drillDown.titleAr}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {drillDown.subtitleAr}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrillDown(null)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                aria-label="إغلاق التفاصيل"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* المؤشر الرئيسي داخل النافذة */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141D35] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                      {drillDown.headlineValue}
                    </span>
                    {drillDown.headlineUnit && (
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-300">
                        {drillDown.headlineUnit}
                      </span>
                    )}
                  </div>
                  {drillDown.deltaText && (
                    <p
                      className={`text-xs font-bold mt-1 ${
                        drillDown.deltaPositive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {drillDown.deltaText}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={drillDown.onPrimaryAction}
                  className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{drillDown.primaryActionLabel}</span>
                  <ArrowUpLeft className="w-4 h-4" />
                </button>
              </div>

              {/* نقاط الملخص المبسطة */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {drillDown.summaryPoints.map((pt) => (
                  <div
                    key={pt.label}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#121A30] border border-slate-200/80 dark:border-slate-800"
                  >
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      {pt.label}
                    </span>
                    <span
                      className={`text-sm font-extrabold font-mono tabular-nums mt-1 block ${
                        pt.tone === 'emerald'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : pt.tone === 'rose'
                          ? 'text-rose-600 dark:text-rose-400'
                          : pt.tone === 'amber'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-violet-700 dark:text-violet-300'
                      }`}
                    >
                      {pt.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* قائمة المندوبين المرتبطين بالمؤشر (كل صف قابل للنقر للانتقال المباشر للمندوب) */}
              {drillDown.matchedEmployees && drillDown.matchedEmployees.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-slate-900 dark:text-white">
                      أبرز السجلات المرتبطة (اضغط على أي مندوب لفتح جدول شفتاته):
                    </h4>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {drillDown.matchedEmployees.map((row) => (
                      <button
                        key={row.emp.id}
                        type="button"
                        onClick={() => {
                          setDrillDown(null);
                          onOpenMonthlyGridWithFilter({
                            search: row.emp.employeeCode,
                          });
                        }}
                        className="w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#16203A] transition-colors cursor-pointer text-right"
                      >
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">
                            {row.emp.fullName}
                          </span>
                          {row.subText && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              {row.subText}
                            </span>
                          )}
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 block">
                            {row.metricLabel}
                          </span>
                          <span className="font-mono tabular-nums font-extrabold text-violet-600 dark:text-violet-300">
                            {row.metricValue}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* أزرار الانتقال السفلية */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                {drillDown.secondaryActionLabel && drillDown.onSecondaryAction ? (
                  <button
                    type="button"
                    onClick={drillDown.onSecondaryAction}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                  >
                    {drillDown.secondaryActionLabel}
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={() => setDrillDown(null)}
                  className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
