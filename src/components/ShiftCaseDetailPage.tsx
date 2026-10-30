import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Search,
  Calendar,
  Phone,
  Edit3,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  CalendarCheck,
} from 'lucide-react';
import {
  AttendanceRecord,
  Employee,
  EmployeeSummary,
  MonthDay,
} from '../types';
import {
  MONTH_NAMES,
  getDayTemporalState,
} from '../utils/shiftCalculations';

export type ShiftCasePageType =
  | 'all_shifts'
  | 'selected_not_worked'
  | 'incomplete_schedule'
  | 'worked_only'
  | 'absent_only';

interface ShiftCaseDetailPageProps {
  pageType: ShiftCasePageType;
  employees: Employee[];
  summaries: Record<string, EmployeeSummary>;
  attendanceRecords: Record<string, AttendanceRecord>;
  monthDaysList: MonthDay[];
  currentMonth: number;
  currentYear: number;
  today: Date;
  onBackToGrid: () => void;
  onSwitchPage: (page: ShiftCasePageType) => void;
  onEditCell: (emp: Employee, dateStr: string, rec?: AttendanceRecord) => void;
  onEditEmployee: (emp: Employee) => void;
}

const PAGE_CONFIG: Record<
  ShiftCasePageType,
  {
    title: string;
    subtitle: string;
    badgeLabel: string;
    accentColor: string;
  }
> = {
  all_shifts: {
    title: 'صفحة كل حالات الشفتات للشهر',
    subtitle:
      'نظرة شاملة ومبسطة على جميع المندوبين وتوزيع أيام اختيار الشفتات والحضور الفعلي والغياب والإجازات.',
    badgeLabel: 'كل حالات الشفت',
    accentColor: 'text-indigo-700 dark:text-indigo-400',
  },
  selected_not_worked: {
    title: 'صفحة: اختار الشفت ولم يعمل',
    subtitle:
      'قائمة المندوبين الذين قاموا بحجز شفتات في أيام منقضية ولكن لم يُسجّل لهم حضور فعلي، مع تواريخ الأيام الفائتة بدقة.',
    badgeLabel: 'اختار الشفت ولم يعمل',
    accentColor: 'text-rose-700 dark:text-rose-400',
  },
  incomplete_schedule: {
    title: 'صفحة: لم يكمل جدولة الشهر',
    subtitle:
      'قائمة المندوبين الذين لم يختاروا شفتاتهم لكل أيام الشهر المتاحة، مع عرض الأيام المتبقية غير المحددة.',
    badgeLabel: 'لم يكمل جدولة الشهر',
    accentColor: 'text-amber-700 dark:text-amber-400',
  },
  worked_only: {
    title: 'صفحة: المندوبون الحاضرون فعلياً',
    subtitle:
      'تفاصيل المندوبين الذين باشروا العمل الفعلي خلال الشهر مع إجمالي الساعات ومتوسط العمل اليومي ونسبة الأداء.',
    badgeLabel: 'الحاضرون فقط',
    accentColor: 'text-emerald-700 dark:text-emerald-400',
  },
  absent_only: {
    title: 'صفحة: سجل حالات الغياب',
    subtitle:
      'تفاصيل المندوبين المسجّل عليهم غياب خلال الشهر مع تواريخ أيام الغياب وملاحظات المشرف للمتابعة السريعة.',
    badgeLabel: 'الذين لديهم غياب',
    accentColor: 'text-rose-700 dark:text-rose-400',
  },
};

export const ShiftCaseDetailPage: React.FC<ShiftCaseDetailPageProps> = ({
  pageType,
  employees,
  summaries,
  attendanceRecords,
  monthDaysList,
  currentMonth,
  currentYear,
  today,
  onBackToGrid,
  onSwitchPage,
  onEditCell,
  onEditEmployee,
}) => {
  const [localSearch, setLocalSearch] = useState('');
  const config = PAGE_CONFIG[pageType];
  const daysInMonth = monthDaysList.length;

  // استخراج التفاصيل الدقيقة لكل مندوب حسب نوع الصفحة المخصصة
  const enrichedList = useMemo(() => {
    const q = localSearch.trim().toLowerCase();

    return employees
      .map((emp) => {
        const sum = summaries[emp.id];
        const missedShiftDates: MonthDay[] = [];
        const unscheduledDates: MonthDay[] = [];
        const absentDates: MonthDay[] = [];
        const workedDates: MonthDay[] = [];

        monthDaysList.forEach((d) => {
          const key = `${emp.id}_${d.dateStr}`;
          const rec = attendanceRecords[key];
          const { isPastDay } = getDayTemporalState(
            currentYear,
            currentMonth,
            d.dayNumber,
            today
          );

          const isExempt =
            rec?.attendance === 'leave' ||
            rec?.attendance === 'day_off' ||
            rec?.shiftSelection === 'exempt';

          if (rec?.attendance === 'worked') {
            workedDates.push(d);
          }

          if (
            rec?.attendance === 'absent' ||
            (isPastDay &&
              rec?.shiftSelection === 'selected' &&
              (!rec?.attendance || rec.attendance === 'pending'))
          ) {
            absentDates.push(d);
          }

          if (
            isPastDay &&
            rec?.shiftSelection === 'selected' &&
            rec?.attendance !== 'worked' &&
            !isExempt
          ) {
            missedShiftDates.push(d);
          }

          if (!isExempt && rec?.shiftSelection !== 'selected') {
            unscheduledDates.push(d);
          }
        });

        return {
          emp,
          sum,
          missedShiftDates,
          unscheduledDates,
          absentDates,
          workedDates,
        };
      })
      .filter(({ emp, sum, missedShiftDates, unscheduledDates, absentDates, workedDates }) => {
        if (q) {
          const matches =
            emp.fullName.toLowerCase().includes(q) ||
            emp.employeeCode.toLowerCase().includes(q) ||
            emp.phone.includes(q);
          if (!matches) return false;
        }

        if (!sum) return false;

        if (pageType === 'selected_not_worked') {
          return missedShiftDates.length > 0;
        }
        if (pageType === 'incomplete_schedule') {
          return unscheduledDates.length > 0;
        }
        if (pageType === 'worked_only') {
          return workedDates.length > 0;
        }
        if (pageType === 'absent_only') {
          return absentDates.length > 0;
        }
        return true;
      });
  }, [
    employees,
    summaries,
    attendanceRecords,
    monthDaysList,
    currentYear,
    currentMonth,
    today,
    pageType,
    localSearch,
  ]);

  // إحصاءات علوية مبسطة خاصة بالصفحة المفتوحة
  const pageTotals = useMemo(() => {
    let totalTargetDays = 0;
    let totalWorkedHours = 0;
    enrichedList.forEach((item) => {
      totalWorkedHours += item.sum?.totalHours ?? 0;
      if (pageType === 'selected_not_worked') {
        totalTargetDays += item.missedShiftDates.length;
      } else if (pageType === 'incomplete_schedule') {
        totalTargetDays += item.unscheduledDates.length;
      } else if (pageType === 'absent_only') {
        totalTargetDays += item.absentDates.length;
      } else {
        totalTargetDays += item.workedDates.length;
      }
    });
    return {
      count: enrichedList.length,
      totalTargetDays,
      totalWorkedHours: Number(totalWorkedHours.toFixed(1)),
    };
  }, [enrichedList, pageType]);

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-6">
      {/* شريط العودة والتنقل السريع بين صفحات الوظائف */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              type="button"
              onClick={onBackToGrid}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline mb-1"
            >
              <ArrowRight className="w-4 h-4" />
              العودة إلى الجدول الشهري العام
            </button>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {config.title} — {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
              {config.subtitle}
            </p>
          </div>

          <div className="relative">
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="بحث سريع داخل هذه الصفحة..."
              className="w-64 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg pr-8 pl-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* أزرار التنقل المباشر بين الصفحات المخصصة */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/80">
          {(
            [
              { id: 'all_shifts', label: 'كل حالات الشفت' },
              { id: 'selected_not_worked', label: 'اختار الشفت ولم يعمل' },
              { id: 'incomplete_schedule', label: 'لم يكمل جدولة الشهر' },
              { id: 'worked_only', label: 'الحاضرون فقط' },
              { id: 'absent_only', label: 'الذين لديهم غياب' },
            ] as { id: ShiftCasePageType; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSwitchPage(tab.id)}
              className={`px-3.5 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                pageType === tab.id
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ملخص مبسط في 3 مؤشرات واضحة */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              عدد المندوبين في هذه القائمة
            </span>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-1 block">
              {pageTotals.count} <span className="text-xs font-sans font-normal text-slate-500">مندوب من أصل {employees.length}</span>
            </span>
          </div>

          <div className="px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              {pageType === 'selected_not_worked'
                ? 'إجمالي الشفتات المحجوزة غير المنفذة'
                : pageType === 'incomplete_schedule'
                ? 'إجمالي الأيام غير المجدولة بعد'
                : pageType === 'absent_only'
                ? 'إجمالي أيام الغياب المسجلة'
                : 'إجمالي أيام العمل الفعلية'}
            </span>
            <span className={`text-2xl font-extrabold font-mono tabular-nums mt-1 block ${config.accentColor}`}>
              {pageTotals.totalTargetDays} <span className="text-xs font-sans font-normal text-slate-500">يوم</span>
            </span>
          </div>

          <div className="px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              مجموع الساعات الفعلية لهؤلاء المندوبين
            </span>
            <span className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-400 font-mono tabular-nums mt-1 block">
              {pageTotals.totalWorkedHours} <span className="text-xs font-sans font-normal text-slate-500">ساعة</span>
            </span>
          </div>
        </div>
      </div>

      {/* قائمة البطاقات التفصيلية المبسطة لكل مندوب */}
      {enrichedList.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-2">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            لا يوجد مندوبون ضمن فئة «{config.badgeLabel}» حالياً
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            يمكنك اختيار تبويب آخر من الأعلى أو العودة للجدول الشهري لتسجيل بيانات جديدة.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {enrichedList.map(
            ({
              emp,
              sum,
              missedShiftDates,
              unscheduledDates,
              absentDates,
              workedDates,
            }) => {
              // تحديد الأيام التي ستُعرض كأزرار تفاعلية قابلة للتعديل المباشر حسب نوع الصفحة
              const targetDays =
                pageType === 'selected_not_worked'
                  ? missedShiftDates
                  : pageType === 'incomplete_schedule'
                  ? unscheduledDates
                  : pageType === 'absent_only'
                  ? absentDates
                  : workedDates;

              const daysSectionTitle =
                pageType === 'selected_not_worked'
                  ? `الأيام التي اختار فيها الشفت ولم يعمل (${missedShiftDates.length} يوم) — انقر لتعديل اليوم:`
                  : pageType === 'incomplete_schedule'
                  ? `الأيام المتبقية بدون اختيار شفت (${unscheduledDates.length} من ${daysInMonth} يوم) — انقر للجدولة:`
                  : pageType === 'absent_only'
                  ? `تواريخ أيام الغياب (${absentDates.length} يوم) — انقر للمراجعة:`
                  : `تواريخ أيام الحضور الفعلي (${workedDates.length} يوم) — انقر لعرض الساعات:`;

              return (
                <div
                  key={emp.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  {/* رأس بطاقة المندوب */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                            {emp.fullName}
                          </h3>
                          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            · {emp.employeeCode}
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              emp.status === 'active'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            · {emp.status === 'active' ? 'نشط' : 'موقوف'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {emp.phone && (
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <Phone className="w-3 h-3" />
                              {emp.phone}
                            </span>
                          )}
                          {emp.notes && (
                            <span>· {emp.notes}</span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onEditEmployee(emp)}
                        className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="تعديل ملف المندوب"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* شريط أرقام المندوب المبسط */}
                    <div className="grid grid-cols-4 gap-2 py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-center">
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          اختار شفت
                        </span>
                        <span className="text-sm font-extrabold text-sky-700 dark:text-sky-400 font-mono tabular-nums">
                          {sum?.selectedDays ?? 0} ي
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          عمل فعلياً
                        </span>
                        <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                          {sum?.workedDays ?? 0} ي
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          الغياب
                        </span>
                        <span className="text-sm font-extrabold text-rose-700 dark:text-rose-400 font-mono tabular-nums">
                          {sum?.absentDays ?? 0} ي
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          الأداء · الساعات
                        </span>
                        <span className="text-sm font-extrabold text-indigo-700 dark:text-indigo-400 font-mono tabular-nums">
                          {sum?.performanceRate !== null ? `${sum?.performanceRate}%` : '—'} ({sum?.totalHours ?? 0}س)
                        </span>
                      </div>
                    </div>

                    {/* عرض الأيام التفصيلية التفاعلية بشكل مبسط */}
                    <div className="space-y-2 pt-1">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        {pageType === 'selected_not_worked' || pageType === 'absent_only' ? (
                          <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        ) : pageType === 'incomplete_schedule' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        )}
                        {daysSectionTitle}
                      </span>

                      {targetDays.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          لا توجد أيام مسجلة في هذا البند حالياً — انقر على أي يوم بالجدول لتسجيله.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {targetDays.slice(0, 18).map((d) => {
                            const rec = attendanceRecords[`${emp.id}_${d.dateStr}`];
                            return (
                              <button
                                key={d.dateStr}
                                type="button"
                                onClick={() => onEditCell(emp, d.dateStr, rec)}
                                className={`px-2.5 py-1 rounded-md border text-[11px] font-mono tabular-nums transition-colors flex items-center gap-1 ${
                                  pageType === 'selected_not_worked' || pageType === 'absent_only'
                                    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/70'
                                    : pageType === 'incomplete_schedule'
                                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                                }`}
                                title={`انقر لتعديل سجل يوم ${d.dateStr}`}
                              >
                                <Calendar className="w-3 h-3 opacity-70" />
                                <span>
                                  {d.dayName} {d.dayNumber}
                                </span>
                                {rec?.attendance === 'worked' && (
                                  <span className="opacity-80">
                                    ({Number(((rec.totalWorkedMinutes || 0) / 60).toFixed(1))}س)
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          {targetDays.length > 18 && (
                            <span className="px-2 py-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              +{targetDays.length - 18} أيام أخرى
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* تذييل البطاقة: نسبة الالتزام والإجازات */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <CalendarCheck className="w-3.5 h-3.5 text-slate-400" />
                      نسبة الالتزام بالحضور:{' '}
                      <strong className="text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                        {sum?.commitmentRate !== null ? `${sum?.commitmentRate}%` : 'غير متاح'}
                      </strong>
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      إجازات وراحات: {(sum?.leaveDays ?? 0) + (sum?.dayOffDays ?? 0)} يوم
                    </span>
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </main>
  );
};
