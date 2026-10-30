import React, { useState, useEffect } from 'react';
import { X, Clock, Trash2, Check, ShieldAlert, ArrowRight } from 'lucide-react';
import {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  ShiftSelectionStatus,
  UserProfile,
} from '../types';
import {
  calculateShiftMinutes,
  formatMinutesToHoursText,
} from '../utils/shiftCalculations';

interface CellEditorModalProps {
  currentUser: UserProfile;
  employee: Employee;
  date: string;
  record?: AttendanceRecord;
  canEditShiftSelection: boolean;
  canDeleteRecord: boolean;
  onSave: (data: {
    employeeId: string;
    date: string;
    shiftSelection: ShiftSelectionStatus;
    attendance: AttendanceStatus;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    supervisorNotes: string;
  }) => void;
  onDelete: (employeeId: string, date: string) => void;
  onClose: () => void;
}

export const CellEditorModal: React.FC<CellEditorModalProps> = ({
  currentUser,
  employee,
  date,
  record,
  canEditShiftSelection,
  canDeleteRecord,
  onSave,
  onDelete,
  onClose,
}) => {
  const [shiftSelection, setShiftSelection] = useState<ShiftSelectionStatus>(
    record?.shiftSelection || 'selected'
  );
  const [attendance, setAttendance] = useState<AttendanceStatus>(
    record?.attendance || 'worked'
  );
  const [startTime, setStartTime] = useState<string>(record?.startTime || '09:00');
  const [endTime, setEndTime] = useState<string>(record?.endTime || '17:00');
  const [breakMinutes, setBreakMinutes] = useState<number>(record?.breakMinutes ?? 30);
  const [supervisorNotes, setSupervisorNotes] = useState<string>(
    record?.supervisorNotes || ''
  );

  const isExternalProtectedForSupervisor =
    currentUser.role === 'supervisor' && record?.source === 'external_sync';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAttendanceChange = (val: AttendanceStatus) => {
    setAttendance(val);
    if (canEditShiftSelection) {
      if (val === 'leave' || val === 'day_off') {
        setShiftSelection('exempt');
      } else if (val === 'worked' && shiftSelection === 'exempt') {
        setShiftSelection('selected');
      }
    }
  };

  const liveMinutes =
    attendance === 'worked'
      ? calculateShiftMinutes(startTime, endTime, breakMinutes)
      : 0;

  const isTimeDisabled = attendance !== 'worked' || isExternalProtectedForSupervisor;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isExternalProtectedForSupervisor) return;
    onSave({
      employeeId: employee.id,
      date,
      shiftSelection,
      attendance,
      startTime,
      endTime,
      breakMinutes: Math.max(0, Number(breakMinutes) || 0),
      supervisorNotes: supervisorNotes.trim(),
    });
  };

  const sourceLabel =
    record?.source === 'external_sync'
      ? 'مستورد من تطبيق الشركة الخارجي'
      : record?.source === 'approved_request'
      ? 'معتمد بموجب طلب رسمي'
      : 'إدخال يدوي موثق';

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
              title="الرجوع للخلف"
            >
              <ArrowRight className="w-4 h-4 text-indigo-400" />
              <span>رجوع للخلف</span>
            </button>
            <div>
              <h3 className="font-bold text-base">تسجيل بيانات اليوم والشفت</h3>
              <p className="text-xs text-slate-300 mt-0.5 font-mono tabular-nums">
                {employee.fullName} · {employee.employeeCode} · {date}
              </p>
            </div>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {record && (
            <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">مصدر البيانات:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {sourceLabel}
              </span>
            </div>
          )}

          {isExternalProtectedForSupervisor && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                هذا السجل مستورد مباشرة من النظام الخارجي. لتعديله بصفتك مشرف فريق، يرجى تقديم طلب تصحيح من صفحة "الطلبات" لاعتماده من مدير التشغيل.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                حالة اختيار الشفت
              </label>
              <select
                value={shiftSelection}
                disabled={!canEditShiftSelection || isExternalProtectedForSupervisor}
                onChange={(e) =>
                  setShiftSelection(e.target.value as ShiftSelectionStatus)
                }
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-indigo-600 text-xs"
              >
                <option value="selected">اختار الشفت</option>
                <option value="not_selected">لم يختر</option>
                <option value="undecided">لم يحدد بعد</option>
                <option value="exempt">معفى (إجازة / راحة)</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                حالة الحضور الفعلي
              </label>
              <select
                value={attendance}
                disabled={isExternalProtectedForSupervisor}
                onChange={(e) =>
                  handleAttendanceChange(e.target.value as AttendanceStatus)
                }
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-indigo-600 text-xs"
              >
                <option value="worked">عمل بالفعل (حاضر)</option>
                <option value="absent">غياب</option>
                <option value="leave">إجازة معتمدة</option>
                <option value="day_off">يوم راحة</option>
                <option value="pending">قيد المراجعة / بانتظار الاعتماد</option>
              </select>
            </div>
          </div>

          <div
            className={`p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3 transition-opacity ${
              isTimeDisabled
                ? 'bg-slate-100 dark:bg-slate-800/40 opacity-60'
                : 'bg-slate-50 dark:bg-slate-800/70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                ساعات العمل الفعلية (تدعم الشفتات الليلية)
              </span>
              <span className="font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-400 text-xs">
                الصافي: {formatMinutesToHoursText(liveMinutes)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-slate-600 dark:text-slate-400 block mb-1">
                  بداية العمل
                </label>
                <input
                  type="time"
                  value={startTime}
                  disabled={isTimeDisabled}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono tabular-nums disabled:bg-slate-100 dark:disabled:bg-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-600 dark:text-slate-700 block mb-1">
                  نهاية العمل
                </label>
                <input
                  type="time"
                  value={endTime}
                  disabled={isTimeDisabled}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono tabular-nums disabled:bg-slate-100 dark:disabled:bg-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-600 dark:text-slate-400 block mb-1">
                  الاستراحة (دقيقة)
                </label>
                <input
                  type="number"
                  value={breakMinutes}
                  disabled={isTimeDisabled}
                  onChange={(e) => setBreakMinutes(Math.max(0, Number(e.target.value)))}
                  min={0}
                  max={480}
                  step={5}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono tabular-nums disabled:bg-slate-100 dark:disabled:bg-slate-800"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              ملاحظات المشرف
            </label>
            <textarea
              value={supervisorNotes}
              disabled={isExternalProtectedForSupervisor}
              onChange={(e) => setSupervisorNotes(e.target.value)}
              rows={2}
              placeholder="أي تفاصيل خاصة بتأخير، تبديل شفت، أو عذر مقبول..."
              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div>
              {record && canDeleteRecord && (
                <button
                  type="button"
                  onClick={() => onDelete(employee.id, date)}
                  className="px-3 py-2 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  مسح السجل
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors whitespace-nowrap"
              >
                إلغاء
              </button>
              {!isExternalProtectedForSupervisor && (
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Check className="w-4 h-4" />
                  حفظ السجل
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
