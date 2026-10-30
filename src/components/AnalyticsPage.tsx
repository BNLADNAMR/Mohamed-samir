import React, { useMemo } from 'react';
import { Award, AlertTriangle, ArrowRight, Calendar, ChevronLeft, Edit3 } from 'lucide-react';
import { Employee, EmployeeSummary } from '../types';
import { MONTH_NAMES } from '../utils/shiftCalculations';

interface AnalyticsPageProps {
  employees: Employee[];
  summaries: Record<string, EmployeeSummary>;
  currentMonth: number;
  currentYear: number;
  onChangeMonth: (year: number, month: number) => void;
  onOpenMonthlyGrid: () => void;
  onOpenShiftCase: (
    caseType:
      | 'all_shifts'
      | 'selected_not_worked'
      | 'incomplete_schedule'
      | 'worked_only'
      | 'absent_only'
  ) => void;
  onInspectEmployee?: (emp: Employee) => void;
  onEditEmployee?: (emp: Employee) => void;
  canEditEmp?: boolean;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({
  employees,
  summaries,
  currentMonth,
  currentYear,
  onChangeMonth,
  onOpenMonthlyGrid,
  onOpenShiftCase,
  onInspectEmployee,
  onEditEmployee,
  canEditEmp = false,
}) => {
  const topPerformers = useMemo(() => {
    return [...employees]
      .filter((emp) => (summaries[emp.id]?.workedDays || 0) > 0)
      .sort((a, b) => {
        const perfDiff =
          (summaries[b.id]?.performanceRate ?? 0) -
          (summaries[a.id]?.performanceRate ?? 0);
        if (perfDiff !== 0) return perfDiff;
        return (summaries[b.id]?.totalHours ?? 0) - (summaries[a.id]?.totalHours ?? 0);
      })
      .slice(0, 8);
  }, [employees, summaries]);

  const needsFollowUp = useMemo(() => {
    return [...employees]
      .filter((emp) => {
        const s = summaries[emp.id];
        return s && (s.absentDays > 0 || s.selectedNotWorkedDays > 0);
      })
      .sort((a, b) => {
        const sA = summaries[a.id];
        const sB = summaries[b.id];
        const absDiff = (sB?.absentDays ?? 0) - (sA?.absentDays ?? 0);
        if (absDiff !== 0) return absDiff;
        return (sA?.commitmentRate ?? 100) - (sB?.commitmentRate ?? 100);
      })
      .slice(0, 8);
  }, [employees, summaries]);

  const overallMetrics = useMemo(() => {
    let totalWorkedDays = 0;
    let totalAbsentDays = 0;
    let totalHours = 0;
    let missedShifts = 0;
    employees.forEach((emp) => {
      const s = summaries[emp.id];
      if (s) {
        totalWorkedDays += s.workedDays;
        totalAbsentDays += s.absentDays;
        totalHours += s.totalHours;
        missedShifts += s.selectedNotWorkedDays;
      }
    });
    const avgCommitment =
      totalWorkedDays + totalAbsentDays > 0
        ? Number(
            ((totalWorkedDays / (totalWorkedDays + totalAbsentDays)) * 100).toFixed(1)
          )
        : 0;

    return {
      totalWorkedDays,
      totalAbsentDays,
      totalHours: Number(totalHours.toFixed(1)),
      missedShifts,
      avgCommitment,
    };
  }, [employees, summaries]);

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-6 text-xs">
      {/* رأس الصفحة المستقلة لملخص الأداء والتقارير */}
      <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              صفحة ملخص الأداء والتقارير التحليلية — {MONTH_NAMES[currentMonth - 1]}{' '}
              <span className="font-mono tabular-nums">{currentYear}</span>
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              اضغط على أي مؤشر أو مندوب لعرض تفاصيله المبسطة أو الانتقال المباشر إلى سجله في الجدول.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  if (currentMonth === 1) {
                    onChangeMonth(currentYear - 1, 12);
                  } else {
                    onChangeMonth(currentYear, currentMonth - 1);
                  }
                }}
                className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                title="الشهر السابق"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <span className="px-3.5 py-1 font-extrabold text-xs text-slate-900 dark:text-slate-100 min-w-[115px] text-center whitespace-nowrap">
                {MONTH_NAMES[currentMonth - 1]}{' '}
                <span className="font-mono tabular-nums">{currentYear}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  if (currentMonth === 12) {
                    onChangeMonth(currentYear + 1, 1);
                  } else {
                    onChangeMonth(currentYear, currentMonth + 1);
                  }
                }}
                className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                title="الشهر التالي"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenMonthlyGrid}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>فتح الجدول الشهري التفصيلي</span>
            </button>
          </div>
        </div>

        {/* البطاقات التفاعلية الأربعة — كل بطاقة تنقلك لتفاصيلها المبسطة */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => onOpenShiftCase('worked_only')}
            className="text-right p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold">
                إجمالي أيام الحضور الفعلي
              </span>
              <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
            </div>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-1.5 block">
              {overallMetrics.totalWorkedDays}
            </span>
            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1 block">
              اضغط لعرض قائمة الحاضرين وساعاتهم
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenShiftCase('absent_only')}
            className="text-right p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-rose-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-rose-400 dark:hover:border-rose-500 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold">
                إجمالي حالات الغياب المسجلة
              </span>
              <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-rose-500 transition-colors" />
            </div>
            <span className="text-2xl font-extrabold text-rose-700 dark:text-rose-400 font-mono tabular-nums mt-1.5 block">
              {overallMetrics.totalAbsentDays}
            </span>
            <span className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 block">
              اضغط لعرض تواريخ الغياب والمندوبين
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenShiftCase('selected_not_worked')}
            className="text-right p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-amber-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold">
                اختار الشفت ولم يعمل
              </span>
              <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-amber-500 transition-colors" />
            </div>
            <span className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 font-mono tabular-nums mt-1.5 block">
              {overallMetrics.missedShifts}
            </span>
            <span className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 block">
              اضغط لمتابعة الشفتات المحجوزة غير المنفذة
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenShiftCase('all_shifts')}
            className="text-right p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold">
                معدل الالتزام العام · الساعات
              </span>
              <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
            </div>
            <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums mt-1.5 block">
              {overallMetrics.avgCommitment}%{' '}
              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                ({overallMetrics.totalHours} س)
              </span>
            </span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 block">
              اضغط لعرض التوزيع الكامل لحالات الشفتات
            </span>
          </button>
        </div>
      </section>

      {/* القوائم التفاعلية للأعلى التزاماً والذين يحتاجون متابعة */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              أعلى المندوبين أداءً والتزاماً
            </h2>
            <button
              type="button"
              onClick={() => onOpenShiftCase('worked_only')}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              عرض الكل
            </button>
          </div>

          {topPerformers.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 py-6 text-center">
              لا توجد سجلات عمل فعلية مسجلة في هذا الشهر حتى الآن.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              {topPerformers.map((emp, idx) => {
                const s = summaries[emp.id];
                return (
                  <div
                    key={emp.id}
                    className="px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onInspectEmployee?.(emp)}
                      className="flex-1 text-right flex items-center gap-3 cursor-pointer"
                    >
                      <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500 font-bold w-6">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block hover:text-indigo-600 dark:hover:text-indigo-400">
                          {emp.fullName}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {emp.employeeCode} · {s?.workedDays || 0} يوم عمل ·{' '}
                          {s?.totalHours || 0} ساعة
                        </span>
                      </div>
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                        {s?.performanceRate ?? 0}%
                      </span>
                      {canEditEmp && onEditEmployee && (
                        <button
                          type="button"
                          onClick={() => onEditEmployee(emp)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="تعديل ملف المندوب"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              مندوبون بحاجة إلى متابعة (غياب أو تخلف عن الشفت)
            </h2>
            <button
              type="button"
              onClick={() => onOpenShiftCase('absent_only')}
              className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              عرض سجل الغياب
            </button>
          </div>

          {needsFollowUp.length === 0 ? (
            <div className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-4 py-6 text-center font-medium">
              لا توجد حالات غياب أو تخلف عن الشفتات المسجلة خلال هذا الشهر.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              {needsFollowUp.map((emp) => {
                const s = summaries[emp.id];
                return (
                  <div
                    key={emp.id}
                    className="px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onInspectEmployee?.(emp)}
                      className="flex-1 text-right cursor-pointer"
                    >
                      <span className="font-bold text-slate-900 dark:text-slate-100 block hover:text-rose-600 dark:hover:text-rose-400">
                        {emp.fullName}
                      </span>
                      <span className="text-[11px] text-rose-700 dark:text-rose-400 font-mono tabular-nums">
                        {emp.employeeCode} · {s?.absentDays || 0} غياب ·{' '}
                        {s?.selectedNotWorkedDays || 0} شفت لم يحضره
                      </span>
                    </button>

                    <span className="text-sm font-extrabold text-rose-700 dark:text-rose-400 font-mono tabular-nums">
                      الالتزام:{' '}
                      {s?.commitmentRate !== null ? `${s.commitmentRate}%` : '0%'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* قواعد الاحتساب المبسطة */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
        <span className="font-extrabold text-slate-800 dark:text-slate-100 block mb-1.5">
          قواعد الاحتساب المعتمدة في النظام:
        </span>
        1. تتم المقارنة حتى تاريخ اليوم المنقضي في الشهر الجاري، ولا تُحتسب الأيام المستقبلية أو اليوم الجاري قبل انتهائه غياباً تلقائياً.
        <br />
        2. نسبة الأداء = أيام العمل الفعلية ÷ الأيام المستحقة المنقضية (بعد استبعاد الإجازات المعتمدة وأيام الراحة).
        <br />
        3. الشفتات الليلية تُحسب تلقائياً بجمع الساعات العابرة لمنتصف الليل مع خصم دقائق الاستراحة.
      </section>
    </main>
  );
};
