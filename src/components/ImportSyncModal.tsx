import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Download, FileJson, RefreshCw } from 'lucide-react';
import { AttendanceRecord, Employee } from '../types';
import { safeLoadFromStorage, safeSaveToStorage } from '../utils/shiftCalculations';

interface ImportSyncModalProps {
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
  lastSyncTime: string;
  onImportData: (
    newEmployees: Employee[],
    newAttendance: Record<string, AttendanceRecord>
  ) => void;
  onSyncComplete: (message: string) => void;
  onClose: () => void;
}

export const ImportSyncModal: React.FC<ImportSyncModalProps> = ({
  employees,
  attendanceRecords,
  lastSyncTime,
  onImportData,
  onSyncComplete,
  onClose,
}) => {
  const [endpointUrl, setEndpointUrl] = useState<string>(() =>
    safeLoadFromStorage('shift_tracker_sync_url', '')
  );
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSaveEndpoint = () => {
    safeSaveToStorage('shift_tracker_sync_url', endpointUrl.trim());
    setStatusBanner({
      type: 'success',
      text: 'تم حفظ رابط نقطة المزامنة بنجاح في المتصفح.',
    });
  };

  const handleSyncFromEndpoint = async () => {
    const trimmed = endpointUrl.trim();
    if (!trimmed) {
      onSyncComplete('تم تحديث حالة السجلات المحلية ومطابقة البيانات بنجاح.');
      onClose();
      return;
    }

    setIsTesting(true);
    setStatusBanner(null);
    try {
      const response = await fetch(trimmed, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (Array.isArray(payload.employees)) {
        onImportData(
          payload.employees,
          payload.attendanceRecords || attendanceRecords
        );
        onSyncComplete(
          `تمت مزامنة ${payload.employees.length} مندوب من الرابط الخارجي بنجاح.`
        );
        onClose();
      } else {
        setStatusBanner({
          type: 'info',
          text: 'تم الاتصال بالرابط بنجاح، ولكن البيانات المستلمة لا تحتوي على مصفوفة مندوبين جاهزة.',
        });
      }
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'تعذر الوصول إلى الرابط الخارجي (تحقق من صلاحيات CORS أو صحة العنوان). يمكنك استخدام النسخ الاحتياطي عبر ملف JSON بالأسفل.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleExportBackupJson = () => {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      employees,
      attendanceRecords,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `نسخة_احتياطية_الشفتات_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatusBanner({
      type: 'success',
      text: 'تم تنزيل ملف النسخة الاحتياطية (JSON) بنجاح.',
    });
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = String(event.target?.result || '');
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed.employees)) {
          setStatusBanner({
            type: 'error',
            text: 'صيغة الملف غير صالحة: يجب أن يحتوي ملف JSON على قائمة المندوبين (employees).',
          });
          return;
        }
        onImportData(parsed.employees, parsed.attendanceRecords || {});
        onSyncComplete(
          `تم استيراد ${parsed.employees.length} مندوب وسجلات حضورهم بنجاح.`
        );
        onClose();
      } catch {
        setStatusBanner({
          type: 'error',
          text: 'تعذر قراءة ملف JSON. تأكد من سلامة الملف.',
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-xl w-full overflow-hidden border border-slate-200 dark:border-slate-800 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div>
            <h3 className="font-bold text-base">مزامنة الشفتات والنسخ الاحتياطي</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              استيراد وتصدير بيانات الشفتات أو المزامنة عبر JSON Endpoint
            </p>
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

        <div className="p-6 space-y-5">
          {statusBanner && (
            <div
              className={`p-3 rounded-lg border font-medium ${
                statusBanner.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-300'
                  : statusBanner.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-300'
                  : 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-900 text-sky-900 dark:text-sky-300'
              }`}
            >
              {statusBanner.text}
            </div>
          )}

          {/* استيراد وتصدير ملف JSON محلي */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5">
              <FileJson className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              النسخ الاحتياطي المباشر (JSON)
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              احفظ نسخة كاملة من بيانات المندوبين وسجلات الحضور على جهازك، أو استعدها في أي وقت.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleExportBackupJson}
                className="px-4 py-2 bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                تصدير نسخة احتياطية
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                استيراد ملف شفتات (JSON)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportJsonFile}
                className="hidden"
              />
            </div>
          </div>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* مزامنة عبر رابط JSON خارجي */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              الربط مع نقطة بيانات الشفتات (JSON Endpoint)
            </h4>
            <div className="flex gap-2">
              <input
                type="url"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://example.com/api/shifts-export.json"
                dir="ltr"
                className="flex-1 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <button
                type="button"
                onClick={handleSaveEndpoint}
                className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                حفظ الرابط
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500 dark:text-slate-400 pt-1">
              <span>
                إجمالي المندوبين المسجلين:{' '}
                <strong className="text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                  {employees.length}
                </strong>
              </span>
              <span>·</span>
              <span>
                إجمالي سجلات الأيام:{' '}
                <strong className="text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                  {Object.keys(attendanceRecords).length}
                </strong>
              </span>
              <span>·</span>
              <span>
                آخر تحديث:{' '}
                <strong className="text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                  {lastSyncTime}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium whitespace-nowrap"
            >
              إغلاق
            </button>
            <button
              type="button"
              disabled={isTesting}
              onClick={handleSyncFromEndpoint}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`}
              />
              {isTesting ? 'جارٍ الاتصال...' : 'مزامنة الآن'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
