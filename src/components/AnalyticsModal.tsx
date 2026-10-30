import React, { useMemo, useEffect } from 'react';
import { X, Award, AlertTriangle, ArrowRight } from 'lucide-react';
import { Employee, EmployeeSummary } from '../types';
import { MONTH_NAMES } from '../utils/shiftCalculations';

interface AnalyticsModalProps {
  employees: Employee[];
  summaries: Record<string, EmployeeSummary>;
  currentMonth: number;
  currentYear: number;
  onClose: () => void;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  employees,
  summaries,
  currentMonth,
  currentYear,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
      .slice(0, 6);
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
      .slice(0, 6);
  }, [employees, summaries]);

  const overallMetrics = useMemo(() => {
    let totalWorkedDays = 0;
    let totalAbsentDays = 0;
    let totalHours = 0;
    employees.forEach((emp) => {
      const s = summaries[emp.id];
      if (s) {
        totalWorkedDays += s.workedDays;
        totalAbsentDays += s.absentDays;
        totalHours += s.totalHours;
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
      avgCommitment,
    };
  }, [employees, summaries]);

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title="الرجوع للخلف"
            >
              <ArrowRight className="w-4 h-4 text-indigo-400" />
              <span>رجوع للخلف</span>
            </button>
            <h3 className="font-bold text-base">
              تقرير ملخص الأداء والالتزام — {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* شريط الإجماليات الشهرية */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">
                إجمالي أيام الحضور
              </span>
              <span className="text-xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5 block">
                {overallMetrics.totalWorkedDays}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">
                إجمالي حالات الغياب
              </span>
              <span className="text-xl font-extrabold text-rose-700 dark:text-rose-400 font-mono tabular-nums mt-0.5 block">
                {overallMetrics.totalAbsentDays}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">
                مجموع الساعات الفعلية
              </span>
              <span className="text-xl font-extrabold text-indigo-700 dark:text-indigo-400 font-mono tabular-nums mt-0.5 block">
                {overallMetrics.totalHours} س
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">
                معدل الالتزام العام
              </span>
              <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums mt-0.5 block">
                {overallMetrics.avgCommitment}%
              </span>
            </div>
          </div>

          {/* الأعلى أداءً */}
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              أعلى المندوبين أداءً والتزاماً
            </h4>
            {topPerformers.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 py-3">
                لا توجد سجلات عمل فعلية مسجلة في هذا الشهر حتى الآن.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {topPerformers.map((emp, idx) => {
                  const s = summaries[emp.id];
                  return (
                    <div
                      key={emp.id}
                      className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500 font-bold w-5">
                          0{idx + 1}.
                        </span>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-slate-100 block">
                            {emp.fullName}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {emp.employeeCode} · {s?.workedDays || 0} يوم عمل ·{' '}
                            {s?.totalHours || 0} ساعة
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                        {s?.performanceRate ?? 0}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* بحاجة إلى متابعة */}
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              مندوبون بحاجة إلى متابعة (لديهم غياب أو تخلف عن الشفت)
            </h4>
            {needsFollowUp.length === 0 ? (
              <p className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-4 py-3 font-medium">
                لا توجد حالات غياب أو تخلف عن الشفتات المسجلة خلال هذا الشهر.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {needsFollowUp.map((emp) => {
                  const s = summaries[emp.id];
                  return (
                    <div
                      key={emp.id}
                      className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">
                          {emp.fullName}
                        </span>
                        <span className="text-[11px] text-rose-700 dark:text-rose-400 font-mono tabular-nums">
                          {emp.employeeCode} · {s?.absentDays || 0} غياب ·{' '}
                          {s?.selectedNotWorkedDays || 0} شفت لم يحضره
                        </span>
                      </div>
                      <span className="text-sm font-extrabold text-rose-700 dark:text-rose-400 font-mono tabular-nums">
                        الالتزام:{' '}
                        {s?.commitmentRate !== null ? `${s.commitmentRate}%` : '0%'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-4 rounded-lg text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
            <span className="font-bold text-slate-800 dark:text-slate-100 block mb-1">
              قواعد الاحتساب المعتمدة:
            </span>
            1. تتم المقارنة حتى تاريخ اليوم المنقضي في الشهر الجاري، ولا تُحتسب الأيام المستقبلية أو اليوم الجاري قبل انتهائه غياباً تلقائياً.
            <br />
            2. نسبة الأداء = أيام العمل الفعلية ÷ الأيام المستحقة المنقضية (بعد استبعاد الإجازات المعتمدة وأيام الراحة).
            <br />
            3. الشفتات الليلية تُحسب تلقائياً بجمع الساعات العابرة لمنتصف الليل مع خصم دقائق الاستراحة.
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-slate-900 dark:bg-indigo-600 text-white rounded-lg font-bold hover:bg-slate-800 dark:hover:bg-indigo-500 transition-colors"
            >
              إغلاق التقرير
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
