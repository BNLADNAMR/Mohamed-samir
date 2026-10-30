import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  ChevronRight,
  ChevronLeft,
  UserPlus,
  Download,
  Printer,
  RefreshCw,
  BarChart3,
  Users,
  Edit3,
  Trash2,
  Sun,
  Moon,
} from 'lucide-react';
import {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  EmployeeSummary,
  MonthDay,
  ShiftSelectionStatus,
  ToastNotification,
} from './types';
import {
  MONTH_NAMES,
  calculateShiftMinutes,
  computeEmployeeSummary,
  escapeCsvCell,
  getDayTemporalState,
  getDaysInMonth,
  safeLoadFromStorage,
  safeSaveToStorage,
} from './utils/shiftCalculations';
import { CellEditorModal } from './components/CellEditorModal';
import { EmployeeModal } from './components/EmployeeModal';
import { ImportSyncModal } from './components/ImportSyncModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import {
  ShiftCaseDetailPage,
  ShiftCasePageType,
} from './components/ShiftCaseDetailPage';

export default function App() {
  // إدارة الوضع الداكن مع التفضيل المحفوظ أو إعداد النظام
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = safeLoadFromStorage<'dark' | 'light' | null>(
      'shift_tracker_theme',
      null
    );
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      safeSaveToStorage('shift_tracker_theme', 'dark');
    } else {
      root.classList.remove('dark');
      safeSaveToStorage('shift_tracker_theme', 'light');
    }
  }, [isDarkMode]);

  // تحديث تاريخ اليوم تلقائياً لضمان دقة الحسابات حتى لو بقيت الصفحة مفتوحة بعد منتصف الليل
  const [today, setToday] = useState<Date>(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setToday((prev) =>
        prev.getDate() !== now.getDate() || prev.getMonth() !== now.getMonth()
          ? now
          : prev
      );
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const todayStr = useMemo(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(today.getDate()).padStart(2, '0')}`;
  }, [today]);

  const [currentYear, setCurrentYear] = useState<number>(() => today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(
    () => today.getMonth() + 1
  );

  const [employees, setEmployees] = useState<Employee[]>(() =>
    safeLoadFromStorage<Employee[]>('shift_tracker_employees', [])
  );

  const [attendanceRecords, setAttendanceRecords] = useState<
    Record<string, AttendanceRecord>
  >(() =>
    safeLoadFromStorage<Record<string, AttendanceRecord>>(
      'shift_tracker_attendance',
      {}
    )
  );

  // الفلاتر والبحث والترتيب
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSelection, setFilterSelection] = useState('all');
  const [filterAttendance, setFilterAttendance] = useState('all');
  const [sortBy, setSortBy] = useState('code');
  const [activeViewTab, setActiveViewTab] = useState<'grid' | 'analytics'>('grid');
  const [activeCasePage, setActiveCasePage] = useState<ShiftCasePageType | null>(
    null
  );

  // النوافذ المنبثقة
  const [editingCell, setEditingCell] = useState<{
    employee: Employee;
    date: string;
    record?: AttendanceRecord;
  } | null>(null);

  const [employeeModalState, setEmployeeModalState] = useState<{
    open: boolean;
    editingEmployee: Employee | null;
  }>({ open: false, editingEmployee: null });

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() =>
    new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  );
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastNotification['type'] = 'success') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    },
    []
  );

  useEffect(() => {
    safeSaveToStorage('shift_tracker_employees', employees);
  }, [employees]);

  useEffect(() => {
    safeSaveToStorage('shift_tracker_attendance', attendanceRecords);
  }, [attendanceRecords]);

  const daysInMonth = useMemo(() => {
    return getDaysInMonth(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const monthDaysList = useMemo<MonthDay[]>(() => {
    const days: MonthDay[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(
        2,
        '0'
      )}-${String(i).padStart(2, '0')}`;
      const dateObj = new Date(currentYear, currentMonth - 1, i);
      const dayName = dateObj.toLocaleDateString('ar-EG', { weekday: 'short' });
      days.push({ dayNumber: i, dateStr, dayName });
    }
    return days;
  }, [currentYear, currentMonth, daysInMonth]);

  const isCurrentMonthView =
    today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth;

  const generateInitial100Delegates = () => {
    const firstNames = [
      'أحمد',
      'محمد',
      'محمود',
      'علي',
      'عمر',
      'خالد',
      'إبراهيم',
      'حسن',
      'يوسف',
      'طارق',
      'مصطفى',
      'ياسر',
      'كريم',
      'هشام',
      'سامح',
    ];
    const lastNames = [
      'السيد',
      'عبدالله',
      'الشريف',
      'إسماعيل',
      'النجار',
      'منصور',
      'راضي',
      'فاروق',
      'عثمان',
      'سالم',
      'الجمال',
      'حمدي',
      'غانم',
    ];

    const newEmps: Employee[] = [];
    const newAttendance: Record<string, AttendanceRecord> = {
      ...attendanceRecords,
    };

    const maxElapsedSeedDay = isCurrentMonthView
      ? Math.min(today.getDate(), daysInMonth)
      : Math.min(12, daysInMonth);

    for (let i = 1; i <= 100; i++) {
      const empCode = `EMP${String(i).padStart(3, '0')}`;
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[(i * 3) % lastNames.length];
      newEmps.push({
        id: empCode,
        employeeCode: empCode,
        fullName: `${fn} ${ln}`,
        phone: `010${String(10000000 + ((i * 7919) % 89999999)).padStart(8, '0')}`,
        hireDate: '2025-01-01',
        status: i % 18 === 0 ? 'suspended' : 'active',
        externalId: `EXT_${1000 + i}`,
        notes: 'قوة أساسية معتمدة',
      });

      for (let d = 1; d <= Math.min(daysInMonth, maxElapsedSeedDay + 2); d++) {
        const dateStr = `${currentYear}-${String(currentMonth).padStart(
          2,
          '0'
        )}-${String(d).padStart(2, '0')}`;
        const key = `${empCode}_${dateStr}`;
        const { isFutureDay, isToday } = getDayTemporalState(
          currentYear,
          currentMonth,
          d,
          today
        );

        let shift: ShiftSelectionStatus = 'selected';
        let att: AttendanceStatus = 'worked';
        const start = '09:00';
        const end = '17:00';
        const brk = 30;

        if (isFutureDay) {
          shift = i % 3 === 0 ? 'undecided' : 'selected';
          att = 'pending';
        } else if (isToday) {
          shift = i % 5 === 0 ? 'not_selected' : 'selected';
          att = shift === 'selected' ? (i % 3 === 0 ? 'pending' : 'worked') : 'pending';
        } else {
          if (d === 3 && i % 4 === 0) att = 'absent';
          else if (d === 5 && i % 5 === 0) {
            shift = 'exempt';
            att = 'leave';
          } else if (d === 7 && i % 6 === 0) {
            shift = 'exempt';
            att = 'day_off';
          }
        }

        const totalMins =
          att === 'worked' ? calculateShiftMinutes(start, end, brk) : 0;
        newAttendance[key] = {
          id: `rec_${key}`,
          employeeId: empCode,
          date: dateStr,
          shiftSelection: shift,
          attendance: att,
          startTime: start,
          endTime: end,
          breakMinutes: brk,
          totalWorkedMinutes: totalMins,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    setEmployees(newEmps);
    setAttendanceRecords(newAttendance);
    setLastSyncTime(
      new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    );
    showToast('تمت تهيئة 100 مندوب مع سجلات الشفتات بنجاح.');
  };

  const summaries = useMemo<Record<string, EmployeeSummary>>(() => {
    const map: Record<string, EmployeeSummary> = {};
    employees.forEach((emp) => {
      map[emp.id] = computeEmployeeSummary(
        emp,
        monthDaysList,
        attendanceRecords,
        currentYear,
        currentMonth,
        today
      );
    });
    return map;
  }, [employees, monthDaysList, attendanceRecords, currentYear, currentMonth, today]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees
      .filter((emp) => {
        const matchQuery =
          !q ||
          emp.fullName.toLowerCase().includes(q) ||
          emp.employeeCode.toLowerCase().includes(q) ||
          emp.phone.includes(q);
        if (!matchQuery) return false;

        const summary = summaries[emp.id];
        if (!summary) return true;

        if (
          filterSelection === 'selected_not_worked' &&
          summary.selectedNotWorkedDays === 0
        ) {
          return false;
        }
        if (
          filterSelection === 'not_selected' &&
          summary.selectedDays >= daysInMonth - (summary.leaveDays + summary.dayOffDays)
        ) {
          return false;
        }
        if (filterAttendance === 'worked_only' && summary.workedDays === 0) {
          return false;
        }
        if (filterAttendance === 'absent_only' && summary.absentDays === 0) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.fullName.localeCompare(b.fullName, 'ar');
        if (sortBy === 'workedDays') {
          return (summaries[b.id]?.workedDays ?? 0) - (summaries[a.id]?.workedDays ?? 0);
        }
        if (sortBy === 'hours') {
          return (summaries[b.id]?.totalHours ?? 0) - (summaries[a.id]?.totalHours ?? 0);
        }
        if (sortBy === 'performance') {
          const pA = summaries[a.id]?.performanceRate ?? -1;
          const pB = summaries[b.id]?.performanceRate ?? -1;
          return pB - pA;
        }
        return a.employeeCode.localeCompare(b.employeeCode, undefined, {
          numeric: true,
        });
      });
  }, [
    employees,
    searchQuery,
    filterSelection,
    filterAttendance,
    sortBy,
    summaries,
    daysInMonth,
  ]);

  const topStats = useMemo(() => {
    const totalHeadcount = employees.length;
    const activeCount = employees.filter((e) => e.status === 'active').length;

    const targetRefDateStr = isCurrentMonthView
      ? todayStr
      : `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;

    let workedRefDay = 0;
    let selectedRefDay = 0;
    let notSelectedRefDay = 0;
    let totalMonthlyHours = 0;

    employees.forEach((emp) => {
      const refKey = `${emp.id}_${targetRefDateStr}`;
      const refRec = attendanceRecords[refKey];
      if (refRec?.attendance === 'worked') workedRefDay++;
      if (refRec?.shiftSelection === 'selected') selectedRefDay++;
      else if (refRec?.shiftSelection !== 'exempt') notSelectedRefDay++;

      const summary = summaries[emp.id];
      if (summary) totalMonthlyHours += summary.totalHours;
    });

    return {
      totalHeadcount,
      activeCount,
      workedToday: workedRefDay,
      selectedToday: selectedRefDay,
      notSelectedToday: notSelectedRefDay,
      totalMonthlyHours: Number(totalMonthlyHours.toFixed(1)),
      refLabel: isCurrentMonthView ? 'اليوم' : `1 ${MONTH_NAMES[currentMonth - 1]}`,
    };
  }, [
    employees,
    attendanceRecords,
    todayStr,
    summaries,
    isCurrentMonthView,
    currentYear,
    currentMonth,
  ]);

  // تمثيل الخلية البصري مع تباين مخصص للوضعين الفاتح والداكن
  const getCellPresentation = (empId: string, dateStr: string, dayNumber: number) => {
    const key = `${empId}_${dateStr}`;
    const record = attendanceRecords[key];
    const { isPastDay, isFutureDay } = getDayTemporalState(
      currentYear,
      currentMonth,
      dayNumber,
      today
    );

    if (isFutureDay) {
      if (record?.attendance === 'leave') {
        return {
          bg: 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200',
          symbol: 'إج',
          title: 'إجازة مجدولة',
        };
      }
      if (record?.attendance === 'day_off') {
        return {
          bg: 'bg-stone-200 dark:bg-slate-800 hover:bg-stone-300 dark:hover:bg-slate-700 border-stone-300 dark:border-slate-700 text-stone-800 dark:text-slate-200',
          symbol: 'را',
          title: 'راحة مجدولة',
        };
      }
      if (record?.shiftSelection === 'selected') {
        return {
          bg: 'bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 font-bold',
          symbol: 'مجدول',
          title: 'شفت محدد مسبقاً',
        };
      }
      return {
        bg: 'bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800/80 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600',
        symbol: '—',
        title: 'يوم مستقبلي',
      };
    }

    if (record?.attendance === 'leave') {
      return {
        bg: 'bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 border-slate-400 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-bold',
        symbol: 'إج',
        title: 'إجازة معتمدة',
      };
    }
    if (record?.attendance === 'day_off') {
      return {
        bg: 'bg-stone-200 dark:bg-slate-700/80 hover:bg-stone-300 dark:hover:bg-slate-600 border-stone-300 dark:border-slate-600 text-stone-800 dark:text-slate-200 font-bold',
        symbol: 'را',
        title: 'يوم راحة',
      };
    }
    if (record?.attendance === 'worked') {
      return {
        bg: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-700 dark:border-emerald-500 text-white font-bold',
        symbol: '✓',
        title: `حاضر (${Number(((record.totalWorkedMinutes || 0) / 60).toFixed(1))} س)`,
      };
    }

    if (
      record?.attendance === 'absent' ||
      (isPastDay &&
        record?.shiftSelection === 'selected' &&
        (!record?.attendance || record.attendance === 'pending'))
    ) {
      return {
        bg: 'bg-rose-600 hover:bg-rose-500 border-rose-700 dark:border-rose-500 text-white font-bold',
        symbol: '✕',
        title: 'غياب',
      };
    }

    if (
      record?.shiftSelection === 'selected' &&
      (!record?.attendance || record.attendance === 'pending')
    ) {
      return {
        bg: 'bg-sky-600 hover:bg-sky-500 border-sky-700 dark:border-sky-500 text-white font-bold',
        symbol: 'انتظار',
        title: 'اختار الشفت وبانتظار الاعتماد',
      };
    }

    return {
      bg: 'bg-amber-300 dark:bg-amber-500/90 hover:bg-amber-400 dark:hover:bg-amber-400 border-amber-400 dark:border-amber-500 text-amber-950 font-bold',
      symbol: '؟',
      title: 'لم يحدد الشفت',
    };
  };

  const handleSaveCell = (formData: {
    employeeId: string;
    date: string;
    shiftSelection: ShiftSelectionStatus;
    attendance: AttendanceStatus;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    supervisorNotes: string;
  }) => {
    const key = `${formData.employeeId}_${formData.date}`;
    const totalWorkedMinutes =
      formData.attendance === 'worked'
        ? calculateShiftMinutes(
            formData.startTime,
            formData.endTime,
            formData.breakMinutes
          )
        : 0;

    setAttendanceRecords((prev) => ({
      ...prev,
      [key]: {
        id: `rec_${key}`,
        employeeId: formData.employeeId,
        date: formData.date,
        shiftSelection: formData.shiftSelection,
        attendance: formData.attendance,
        startTime: formData.startTime,
        endTime: formData.endTime,
        breakMinutes: formData.breakMinutes,
        totalWorkedMinutes,
        supervisorNotes: formData.supervisorNotes,
        updatedAt: new Date().toISOString(),
      },
    }));
    setEditingCell(null);
    showToast('تم حفظ سجل اليوم وتحديث مؤشرات الأداء.');
  };

  const handleDeleteCellRecord = (empId: string, date: string) => {
    const key = `${empId}_${date}`;
    setAttendanceRecords((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setEditingCell(null);
    showToast('تم مسح سجل اليوم.', 'info');
  };

  const handleSaveEmployee = (emp: Employee, isEdit: boolean) => {
    if (isEdit) {
      setEmployees((prev) => prev.map((item) => (item.id === emp.id ? emp : item)));
      showToast(`تم تحديث بيانات المندوب "${emp.fullName}".`);
    } else {
      setEmployees((prev) => [...prev, emp]);
      showToast(`تمت إضافة المندوب "${emp.fullName}" بنجاح.`);
    }
    setEmployeeModalState({ open: false, editingEmployee: null });
  };

  const handleDeleteEmployee = (empId: string) => {
    const target = employees.find((e) => e.id === empId);
    setEmployees((prev) => prev.filter((e) => e.id !== empId));
    setAttendanceRecords((prev) => {
      const next: Record<string, AttendanceRecord> = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (v.employeeId !== empId) next[k] = v;
      });
      return next;
    });
    setEmployeeModalState({ open: false, editingEmployee: null });
    showToast(`تم حذف المندوب "${target?.fullName || ''}" وجميع سجلاته.`, 'info');
  };

  const handleToggleEmployeeStatus = (empId: string) => {
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === empId
          ? { ...emp, status: emp.status === 'active' ? 'suspended' : 'active' }
          : emp
      )
    );
  };

  const handleExportCSV = () => {
    let csvContent = '\uFEFF';
    const headers = ['رقم المندوب', 'اسم المندوب', 'الهاتف', 'الحالة'];
    monthDaysList.forEach((d) => headers.push(`يوم ${d.dayNumber}`));
    headers.push(
      'أيام العمل',
      'أيام الغياب',
      'أيام الإجازة والراحة',
      'أيام اختيار الشفت',
      'ساعات العمل',
      'متوسط الساعات',
      'نسبة الالتزام',
      'نسبة الأداء'
    );
    csvContent += headers.map(escapeCsvCell).join(',') + '\r\n';

    filteredEmployees.forEach((emp) => {
      const sum = summaries[emp.id];
      const row: (string | number)[] = [
        emp.employeeCode,
        emp.fullName,
        emp.phone || '—',
        emp.status === 'active' ? 'نشط' : 'موقوف',
      ];

      monthDaysList.forEach((d) => {
        const visual = getCellPresentation(emp.id, d.dateStr, d.dayNumber);
        row.push(visual.title);
      });

      row.push(
        sum?.workedDays ?? 0,
        sum?.absentDays ?? 0,
        (sum?.leaveDays ?? 0) + (sum?.dayOffDays ?? 0),
        sum?.selectedDays ?? 0,
        sum?.totalHours ?? 0,
        sum?.avgHours ?? 0,
        sum?.commitmentRate !== null && sum?.commitmentRate !== undefined
          ? `${sum.commitmentRate}%`
          : 'غير متاح',
        sum?.performanceRate !== null && sum?.performanceRate !== undefined
          ? `${sum.performanceRate}%`
          : 'غير متاح'
      );

      csvContent += row.map(escapeCsvCell).join(',') + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `تقرير_الشفتات_${MONTH_NAMES[currentMonth - 1]}_${currentYear}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('تم تصدير تقرير Excel / CSV بنجاح.');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      {/* إشعارات فورية */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 no-print">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`px-4 py-2.5 rounded-lg shadow-lg border text-xs font-bold transition-all ${
                t.type === 'error'
                  ? 'bg-rose-900 text-white border-rose-800'
                  : t.type === 'info'
                  ? 'bg-slate-900 dark:bg-slate-800 text-white border-slate-700'
                  : 'bg-emerald-900 text-white border-emerald-800'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* الهيدر العلوي وفق عقد الـ 3 مناطق */}
      <header className="bg-slate-900 dark:bg-slate-950 text-white border-b border-slate-800 px-6 py-3.5 no-print">
        <div className="max-w-[1900px] mx-auto flex items-center justify-between gap-8">
          {/* المنطقة 1: اسم النظام */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveCasePage(null);
              setActiveViewTab('grid');
            }}
            className="text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            نظام متابعة الشفتات
          </a>

          {/* المنطقة 2: روابط التنقل */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <button
              type="button"
              onClick={() => {
                setActiveCasePage(null);
                setActiveViewTab('grid');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeViewTab === 'grid' && !activeCasePage
                  ? 'text-white border-b-2 border-indigo-400 font-bold'
                  : ''
              }`}
            >
              الجدول الشهري
            </button>
            <button
              type="button"
              onClick={() => setActiveViewTab('analytics')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeViewTab === 'analytics'
                  ? 'text-white border-b-2 border-indigo-400 font-bold'
                  : ''
              }`}
            >
              تحليلات الأداء
            </button>
            <button
              type="button"
              onClick={() => setIsSyncModalOpen(true)}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              المزامنة والنسخ الاحتياطي
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              تصدير CSV
            </button>
          </nav>

          {/* المنطقة 3: الإجراء الرئيسي */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() =>
                setEmployeeModalState({ open: true, editingEmployee: null })
              }
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              إضافة مندوب
            </button>
          </div>
        </div>
      </header>

      {/* شريط التحكم في الشهر، مفتاح الوضع الداكن، والمؤشرات الرقمية */}
      <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 transition-colors duration-150">
        <div className="max-w-[1900px] mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    if (currentMonth === 1) {
                      setCurrentMonth(12);
                      setCurrentYear((y) => y - 1);
                    } else {
                      setCurrentMonth((m) => m - 1);
                    }
                  }}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-700 dark:text-slate-200 transition-colors"
                  title="الشهر السابق"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="px-4 py-1 font-extrabold text-sm text-slate-900 dark:text-slate-100 min-w-[130px] text-center whitespace-nowrap">
                  {MONTH_NAMES[currentMonth - 1]}{' '}
                  <span className="font-mono tabular-nums">{currentYear}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (currentMonth === 12) {
                      setCurrentMonth(1);
                      setCurrentYear((y) => y + 1);
                    } else {
                      setCurrentMonth((m) => m + 1);
                    }
                  }}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-700 dark:text-slate-200 transition-colors"
                  title="الشهر التالي"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {!isCurrentMonthView && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentYear(today.getFullYear());
                    setCurrentMonth(today.getMonth() + 1);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 rounded-lg transition-colors whitespace-nowrap"
                >
                  العودة للشهر الحالي
                </button>
              )}

              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>تاريخ اليوم:</span>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 font-medium">
                  {todayStr}
                </span>
                <span aria-hidden="true">·</span>
                <span>آخر تحديث:</span>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 font-medium">
                  {lastSyncTime}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 no-print">
              {/* زر التبديل بين الوضع الفاتح والوضع الداكن */}
              <button
                type="button"
                onClick={() => setIsDarkMode((prev) => !prev)}
                className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                title={isDarkMode ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
                aria-label={isDarkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
              >
                {isDarkMode ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    الوضع الفاتح
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-indigo-600" />
                    الوضع الداكن
                  </>
                )}
              </button>

              {employees.length === 0 ? (
                <button
                  type="button"
                  onClick={generateInitial100Delegates}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Users className="w-3.5 h-3.5" />
                  تهيئة 100 مندوب للتجربة
                </button>
              ) : confirmClearAll ? (
                <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 px-2.5 py-1 rounded-lg">
                  <span className="text-xs text-rose-800 dark:text-rose-300 font-bold">
                    مسح الكل؟
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEmployees([]);
                      setAttendanceRecords({});
                      setConfirmClearAll(false);
                      showToast('تم تفريغ جميع البيانات بنجاح.', 'info');
                    }}
                    className="px-2 py-1 bg-rose-600 text-white text-xs font-bold rounded hover:bg-rose-700"
                  >
                    نعم
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="px-2 py-1 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="border border-slate-300 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-700 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-900 text-slate-600 dark:text-slate-300 text-xs font-medium px-3 py-2 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  إعادة ضبط
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveViewTab('analytics')}
                className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <BarChart3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                ملخص الأداء
              </button>

              <button
                type="button"
                onClick={() => setIsSyncModalOpen(true)}
                className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                مزامنة / JSON
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                تصدير Excel
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                طباعة
              </button>
            </div>
          </div>

          {/* المؤشرات الرئيسية */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                القوة الأساسية
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
                  {topStats.totalHeadcount}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  مندوب
                </span>
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                المندوبون النشطون
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                  {topStats.activeCount}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  جاهز للعمل
                </span>
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                اختاروا شفت ({topStats.refLabel})
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-extrabold text-sky-700 dark:text-sky-400 font-mono tabular-nums">
                  {topStats.selectedToday}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  شفت مؤكد
                </span>
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                لم يختاروا شفت ({topStats.refLabel})
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 font-mono tabular-nums">
                  {topStats.notSelectedToday}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  للمتابعة
                </span>
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                حضروا فعلياً ({topStats.refLabel})
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                  {topStats.workedToday}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  حضور معتمد
                </span>
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                إجمالي ساعات الشهر
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-400 font-mono tabular-nums">
                  {topStats.totalMonthlyHours}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  ساعة فعلية
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* شريط الفلاتر والبحث ودليل الحالات */}
      <section className="bg-slate-100/80 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 px-6 py-3 no-print transition-colors duration-150">
        <div className="max-w-[1900px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، الكود، أو الهاتف..."
                className="w-60 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg pr-8 pl-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>

            {/* أزرار وظائف حالات الشفت — كل زر ينقل إلى صفحة مخصصة بكامل التفاصيل بشكل مبسط */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveCasePage('all_shifts')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeCasePage === 'all_shifts'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                كل حالات الشفت
              </button>
              <button
                type="button"
                onClick={() => setActiveCasePage('selected_not_worked')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeCasePage === 'selected_not_worked'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                اختار الشفت ولم يعمل
              </button>
              <button
                type="button"
                onClick={() => setActiveCasePage('incomplete_schedule')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeCasePage === 'incomplete_schedule'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                لم يكمل جدولة الشهر
              </button>
            </div>

            <select
              value={filterAttendance}
              onChange={(e) => setFilterAttendance(e.target.value)}
              className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="all">كل حالات الحضور</option>
              <option value="worked_only">الحاضرون فقط</option>
              <option value="absent_only">الذين لديهم غياب</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="code">ترتيب حسب الرقم الوظيفي</option>
              <option value="name">ترتيب أبجدي بالاسم</option>
              <option value="workedDays">الأكثر أيام عمل</option>
              <option value="hours">الأعلى ساعات عمل</option>
              <option value="performance">الأعلى نسبة أداء</option>
            </select>

            {(searchQuery ||
              filterSelection !== 'all' ||
              filterAttendance !== 'all' ||
              activeCasePage !== null) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterSelection('all');
                  setFilterAttendance('all');
                  setActiveCasePage(null);
                }}
                className="text-xs text-indigo-700 dark:text-indigo-400 hover:underline font-bold px-2 py-1 whitespace-nowrap"
              >
                {activeCasePage
                  ? 'العودة للجدول الشهري'
                  : `إلغاء الفلاتر (${filteredEmployees.length})`}
              </button>
            )}
          </div>

          {/* دليل الألوان والرموز */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
            <span className="font-bold text-slate-800 dark:text-slate-100">
              دليل الحالات:
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 bg-emerald-600 text-white rounded text-[10px] font-bold flex items-center justify-center">
                ✓
              </span>
              حاضر
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 bg-rose-600 text-white rounded text-[10px] font-bold flex items-center justify-center">
                ✕
              </span>
              غياب
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="px-1 h-4 bg-sky-600 text-white rounded text-[9px] font-bold flex items-center justify-center">
                انتظار
              </span>
              بانتظار الاعتماد
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 bg-amber-300 dark:bg-amber-500 text-amber-950 rounded text-[10px] font-bold flex items-center justify-center">
                ؟
              </span>
              لم يحدد
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded text-[9px] font-bold flex items-center justify-center">
                إج
              </span>
              إجازة / راحة
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="px-1 h-4 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 rounded text-[9px] font-bold flex items-center justify-center">
                مجدول
              </span>
              مجدول مستقبلاً
            </span>
          </div>
        </div>
      </section>

      {/* عرض الصفحة التفصيلية المبسطة عند اختيار أحد أزرار الوظائف، أو عرض الجدول الشهري الرئيسي */}
      {activeCasePage ? (
        <ShiftCaseDetailPage
          pageType={activeCasePage}
          employees={employees}
          summaries={summaries}
          attendanceRecords={attendanceRecords}
          monthDaysList={monthDaysList}
          currentMonth={currentMonth}
          currentYear={currentYear}
          today={today}
          onBackToGrid={() => setActiveCasePage(null)}
          onSwitchPage={(page) => setActiveCasePage(page)}
          onEditCell={(emp, dateStr, rec) =>
            setEditingCell({ employee: emp, date: dateStr, record: rec })
          }
          onEditEmployee={(emp) =>
            setEmployeeModalState({ open: true, editingEmployee: emp })
          }
        />
      ) : (
      <main className="flex-1 p-4 sm:p-6 max-w-[1900px] w-full mx-auto">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-[calc(100vh-290px)] min-h-[420px] relative transition-colors duration-150">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700 select-none">
                <th className="p-2.5 w-[72px] min-w-[72px] text-center sticky-col-first bg-slate-100 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                  الكود
                </th>
                <th className="p-2.5 w-[176px] min-w-[176px] sticky-col-second bg-slate-100 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                  اسم المندوب
                </th>
                <th className="p-2.5 w-[76px] min-w-[76px] text-center sticky-col-third bg-slate-100 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                  الحالة
                </th>

                {monthDaysList.map((d) => {
                  const isTodayCol =
                    isCurrentMonthView && d.dayNumber === today.getDate();
                  return (
                    <th
                      key={d.dayNumber}
                      className={`p-1 text-center w-11 min-w-[42px] border-l border-slate-200 dark:border-slate-700 ${
                        isTodayCol
                          ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-950 dark:text-indigo-200 font-extrabold'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                        {d.dayName}
                      </div>
                      <div className="text-xs font-mono tabular-nums">
                        {d.dayNumber}
                      </div>
                    </th>
                  );
                })}

                <th className="p-2.5 min-w-[270px] w-[270px] text-center sticky-col-last bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 font-extrabold">
                  ملخص الأداء والالتزام الشهري
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={monthDaysList.length + 4}
                    className="text-center py-16 text-slate-500 dark:text-slate-400"
                  >
                    <div className="flex flex-col items-center justify-center gap-3">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {employees.length === 0
                          ? 'لا يوجد مندوبون مسجلون في النظام حالياً'
                          : 'لا يوجد مندوبون مطابقون لمعايير البحث أو الفلترة'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {employees.length === 0
                          ? 'ابدأ بإضافة مندوب جديد أو قم بتهيئة 100 مندوب تجريبي لمعاينة الجدول بالكامل.'
                          : 'جرّب تعديل كلمات البحث أو إعادة ضبط الفلاتر المختارة.'}
                      </p>
                      {employees.length === 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            onClick={generateInitial100Delegates}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors"
                          >
                            تهيئة 100 مندوب للتجربة
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEmployeeModalState({
                                open: true,
                                editingEmployee: null,
                              })
                            }
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors"
                          >
                            + إضافة أول مندوب
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const sum = summaries[emp.id];
                  return (
                    <tr
                      key={emp.id}
                      className="group hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <td className="p-2 text-center font-mono tabular-nums text-slate-600 dark:text-slate-400 sticky-col-first bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800">
                        {emp.employeeCode}
                      </td>

                      <td className="p-2 font-bold text-slate-900 dark:text-slate-100 sticky-col-second bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="truncate max-w-[130px]"
                            title={`${emp.fullName}${
                              emp.phone ? ` — ${emp.phone}` : ''
                            }`}
                          >
                            {emp.fullName}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEmployeeModalState({
                                open: true,
                                editingEmployee: emp,
                              })
                            }
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-opacity no-print"
                            title="تعديل بيانات المندوب"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="p-2 text-center sticky-col-third bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleToggleEmployeeStatus(emp.id)}
                          title="انقر لتغيير حالة المندوب (نشط / موقوف)"
                          className={`text-[11px] font-bold transition-colors whitespace-nowrap ${
                            emp.status === 'active'
                              ? 'text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300'
                              : 'text-rose-700 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-300'
                          }`}
                        >
                          {emp.status === 'active' ? 'نشط' : 'موقوف'}
                        </button>
                      </td>

                      {monthDaysList.map((d) => {
                        const visual = getCellPresentation(
                          emp.id,
                          d.dateStr,
                          d.dayNumber
                        );
                        const key = `${emp.id}_${d.dateStr}`;
                        const rec = attendanceRecords[key];
                        return (
                          <td
                            key={d.dayNumber}
                            onClick={() =>
                              setEditingCell({
                                employee: emp,
                                date: d.dateStr,
                                record: rec,
                              })
                            }
                            className="p-0.5 text-center border-l border-slate-200 dark:border-slate-800 cursor-pointer"
                            title={`${emp.fullName} | ${d.dateStr} | ${visual.title}${
                              rec?.supervisorNotes
                                ? ` | ملاحظة: ${rec.supervisorNotes}`
                                : ''
                            }`}
                          >
                            <div
                              className={`w-full h-8 flex items-center justify-center rounded border text-[10px] transition-transform active:scale-95 select-none ${visual.bg}`}
                            >
                              {visual.symbol}
                            </div>
                          </td>
                        );
                      })}

                      <td className="p-2.5 sticky-col-last bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-r border-slate-300 dark:border-slate-700">
                        <div className="flex flex-col gap-1 text-[11px]">
                          <div className="flex items-center justify-between font-mono tabular-nums">
                            <span className="font-sans text-slate-600 dark:text-slate-400">
                              أيام العمل · الساعات:
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              <span className="text-emerald-700 dark:text-emerald-400">
                                {sum?.workedDays ?? 0} ي
                              </span>
                              <span className="text-slate-300 dark:text-slate-600 mx-1">
                                /
                              </span>
                              <span className="text-indigo-700 dark:text-indigo-400">
                                {sum?.totalHours ?? 0} س
                              </span>
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            <span>
                              غياب:{' '}
                              <strong className="text-rose-700 dark:text-rose-400">
                                {sum?.absentDays ?? 0}
                              </strong>{' '}
                              · إجازة:{' '}
                              {(sum?.leaveDays ?? 0) + (sum?.dayOffDays ?? 0)}
                            </span>
                            <span>معدل: {sum?.avgHours ?? 0} س</span>
                          </div>

                          <div className="mt-0.5">
                            <div className="flex justify-between items-center text-[10px] mb-0.5 font-bold">
                              <span className="text-slate-600 dark:text-slate-400">
                                نسبة الأداء:
                              </span>
                              <span
                                className={`font-mono tabular-nums ${
                                  sum?.performanceRate !== null &&
                                  sum?.performanceRate !== undefined
                                    ? sum.performanceRate >= 80
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-amber-700 dark:text-amber-400'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              >
                                {sum?.performanceRate !== null &&
                                sum?.performanceRate !== undefined
                                  ? `${sum.performanceRate}%`
                                  : 'غير متاح'}
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-transform duration-150 origin-right ${
                                  (sum?.performanceRate ?? 0) >= 80
                                    ? 'bg-emerald-600 dark:bg-emerald-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{
                                  transform: `scaleX(${
                                    Math.min(100, sum?.performanceRate ?? 0) / 100
                                  })`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
      )}

      {/* النوافذ المنبثقة */}
      {editingCell && (
        <CellEditorModal
          employee={editingCell.employee}
          date={editingCell.date}
          record={editingCell.record}
          onSave={handleSaveCell}
          onDelete={handleDeleteCellRecord}
          onClose={() => setEditingCell(null)}
        />
      )}

      {employeeModalState.open && (
        <EmployeeModal
          existingEmployees={employees}
          editingEmployee={employeeModalState.editingEmployee}
          todayStr={todayStr}
          onSave={handleSaveEmployee}
          onDelete={handleDeleteEmployee}
          onClose={() =>
            setEmployeeModalState({ open: false, editingEmployee: null })
          }
        />
      )}

      {isSyncModalOpen && (
        <ImportSyncModal
          employees={employees}
          attendanceRecords={attendanceRecords}
          lastSyncTime={lastSyncTime}
          onImportData={(newEmps, newAtt) => {
            setEmployees(newEmps);
            setAttendanceRecords(newAtt);
            setLastSyncTime(
              new Date().toLocaleTimeString('ar-EG', {
                hour: '2-digit',
                minute: '2-digit',
              })
            );
          }}
          onSyncComplete={(msg) => {
            setLastSyncTime(
              new Date().toLocaleTimeString('ar-EG', {
                hour: '2-digit',
                minute: '2-digit',
              })
            );
            showToast(msg);
          }}
          onClose={() => setIsSyncModalOpen(false)}
        />
      )}

      {activeViewTab === 'analytics' && (
        <AnalyticsModal
          employees={employees}
          summaries={summaries}
          currentMonth={currentMonth}
          currentYear={currentYear}
          onClose={() => setActiveViewTab('grid')}
        />
      )}
    </div>
  );
}
