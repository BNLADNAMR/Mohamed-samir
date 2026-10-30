import React, { useState, useEffect } from 'react';
import { X, UserPlus, Save, Trash2 } from 'lucide-react';
import { Employee, EmployeeStatus } from '../types';
import { generateNextUniqueEmployeeCode } from '../utils/shiftCalculations';

interface EmployeeModalProps {
  existingEmployees: Employee[];
  editingEmployee?: Employee | null;
  todayStr: string;
  onSave: (emp: Employee, isEdit: boolean) => void;
  onDelete?: (empId: string) => void;
  onClose: () => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  existingEmployees,
  editingEmployee,
  todayStr,
  onSave,
  onDelete,
  onClose,
}) => {
  const defaultCode = editingEmployee
    ? editingEmployee.employeeCode
    : generateNextUniqueEmployeeCode(existingEmployees);

  const [fullName, setFullName] = useState(editingEmployee?.fullName || '');
  const [employeeCode, setEmployeeCode] = useState(defaultCode);
  const [phone, setPhone] = useState(editingEmployee?.phone || '');
  const [hireDate, setHireDate] = useState(editingEmployee?.hireDate || todayStr);
  const [status, setStatus] = useState<EmployeeStatus>(
    editingEmployee?.status || 'active'
  );
  const [externalId, setExternalId] = useState(editingEmployee?.externalId || '');
  const [notes, setNotes] = useState(editingEmployee?.notes || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    const trimmedCode = employeeCode.trim() || defaultCode;

    if (!trimmedName) {
      setErrorMsg('يرجى إدخال الاسم الكامل للمندوب.');
      return;
    }

    const duplicateCode = existingEmployees.some(
      (emp) =>
        emp.id !== editingEmployee?.id &&
        emp.employeeCode.toLowerCase() === trimmedCode.toLowerCase()
    );

    if (duplicateCode) {
      setErrorMsg(`الرقم الوظيفي "${trimmedCode}" مستخدم بالفعل لمندوب آخر.`);
      return;
    }

    const empRecord: Employee = {
      id: editingEmployee ? editingEmployee.id : `emp_${Date.now()}_${trimmedCode}`,
      employeeCode: trimmedCode,
      fullName: trimmedName,
      phone: phone.trim(),
      hireDate: hireDate || todayStr,
      status,
      externalId: externalId.trim() || `EXT_${trimmedCode}`,
      notes: notes.trim(),
    };

    onSave(empRecord, Boolean(editingEmployee));
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-base">
              {editingEmployee ? 'تعديل بيانات المندوب' : 'إضافة مندوب جديد'}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 font-medium">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              الاسم الكامل *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="مثال: أحمد محمد علي"
              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                الرقم الوظيفي
              </label>
              <input
                type="text"
                value={employeeCode}
                onChange={(e) => {
                  setEmployeeCode(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder={defaultCode}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                حالة المندوب
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="active">نشط</option>
                <option value="suspended">موقوف مؤقتاً</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                رقم الهاتف
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678"
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                تاريخ التعيين
              </label>
              <input
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              المعرف الخارجي للربط (External ID)
            </label>
            <input
              type="text"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="معرف المندوب في ملف الشفتات"
              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              ملاحظات إدارية (المنطقة / الفرع)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: قطاع شرق القاهرة"
              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div>
              {editingEmployee && onDelete && (
                confirmDelete ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onDelete(editingEmployee.id)}
                      className="px-2.5 py-1.5 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 whitespace-nowrap"
                    >
                      تأكيد الحذف
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
                    >
                      تراجع
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-3 py-2 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف المندوب
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium whitespace-nowrap"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                {editingEmployee ? 'حفظ التعديلات' : 'إضافة المندوب'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
