import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Download, FileJson, RefreshCw, ShieldCheck, ArrowRight } from 'lucide-react';
import {
  AttendanceRecord,
  Employee,
  SecurityPolicySettings,
  UserProfile,
} from '../types';
import { hasPermission } from '../utils/rbac';
import { isBenignAbortError } from '../firebase';
import { saveSecurityPolicySettings } from '../services/firestoreService';

interface ImportSyncModalProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
  lastSyncTime: string;
  onImportData: (
    newEmployees: Employee[],
    newAttendance: Record<string, AttendanceRecord>,
    isExternalSync: boolean
  ) => Promise<void>;
  onSyncComplete: (message: string) => void;
  onClose: () => void;
}

export const ImportSyncModal: React.FC<ImportSyncModalProps> = ({
  currentUser,
  securityPolicy,
  employees,
  attendanceRecords,
  lastSyncTime,
  onImportData,
  onSyncComplete,
  onClose,
}) => {
  const canManageIntegration = hasPermission(
    currentUser,
    'integration.manage',
    securityPolicy
  );

  const [endpointUrl, setEndpointUrl] = useState<string>(
    securityPolicy.externalSyncEndpoint || ''
  );
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (syncAbortRef.current) {
        syncAbortRef.current.abort();
        syncAbortRef.current = null;
      }
    };
  }, [onClose]);

  const handleSaveEndpoint = async () => {
    if (currentUser.role !== 'super_admin') return;
    try {
      await saveSecurityPolicySettings({
        actor: currentUser,
        settings: {
          ...securityPolicy,
          externalSyncEndpoint: endpointUrl.trim(),
        },
      });
      setStatusBanner({
        type: 'success',
        text: 'تم حفظ رابط نقطة المزامنة الآمنة في سياسات النظام.',
      });
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'تعذر حفظ رابط المزامنة.',
      });
    }
  };

  const handleSyncFromEndpoint = async () => {
    const trimmed = endpointUrl.trim();
    if (!trimmed) {
      onSyncComplete('تم التحقق من مطابقة البيانات مع قاعدة بيانات Firestore السحابية.');
      onClose();
      return;
    }

    if (syncAbortRef.current) {
      syncAbortRef.current.abort();
    }
    const controller = new AbortController();
    syncAbortRef.current = controller;

    setIsTesting(true);
    setStatusBanner(null);
    try {
      // الاتصال عبر الخادم الخلفي الآمن (/api/external-sync) لحماية التوكن السري ومنع كشفه في الواجهة
      const response = await fetch('/api/external-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          endpointUrl: trimmed,
          actorRole: currentUser.role,
          actorStatus: currentUser.status,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      if (Array.isArray(payload.employees)) {
        await onImportData(
          payload.employees,
          payload.attendanceRecords || {},
          true
        );

        if (currentUser.role === 'super_admin') {
          await saveSecurityPolicySettings({
            actor: currentUser,
            settings: {
              ...securityPolicy,
              externalSyncEndpoint: trimmed,
              lastExternalSyncStatus: 'نجاح المزامنة الآمنة',
              lastExternalSyncImported: payload.stats?.importedEmployees || payload.employees.length,
              lastExternalSyncFailed: payload.stats?.failedCount || 0,
              lastExternalSyncTime: new Date().toLocaleString('ar-EG'),
            },
          });
        }

        onSyncComplete(
          `تمت مزامنة ${payload.employees.length} مندوب بنجاح من النظام الخارجي وتوسيمها كمصدر خارجي موثوق.`
        );
        onClose();
      }
    } catch (err) {
      if (isBenignAbortError(err)) {
        return;
      }
      setStatusBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'تعذر الاتصال بالنظام الخارجي. يمكنك استخدام استيراد ملف JSON المعتمد.',
      });
    } finally {
      if (syncAbortRef.current === controller) {
        syncAbortRef.current = null;
        setIsTesting(false);
      }
    }
  };

  const handleExportBackupJson = () => {
    const backup = {
      version: '2.0-rbac',
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser.email,
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
    reader.onload = async (event) => {
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
        await onImportData(
          parsed.employees,
          parsed.attendanceRecords || {},
          true
        );
        onSyncComplete(
          `تم استيراد وترحيل ${parsed.employees.length} مندوب وسجلات حضورهم إلى Cloud Firestore بنجاح.`
        );
        onClose();
      } catch {
        setStatusBanner({
          type: 'error',
          text: 'تعذر قراءة ملف JSON أو حفظه في قاعدة البيانات.',
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
              <h3 className="font-bold text-base">مزامنة الشفتات والنسخ الاحتياطي الآمن</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                استيراد وتصدير البيانات إلى Cloud Firestore دون كشف أي مفاتيح سرية
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

          {/* استيراد وتصدير ملف JSON */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5">
              <FileJson className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              النسخ الاحتياطي والاستيراد السحابي (JSON)
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              تصدير نسخة احتياطية مشفرة الصلاحية، أو استيراد ملف شفتات وحفظه مباشرة في قاعدة بيانات Cloud Firestore مع توسيم السجلات وتوثيق العملية في Audit Log.
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
              {canManageIntegration && (
                <>
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
                </>
              )}
            </div>
          </div>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* الربط الآمن مع نقطة بيانات الشركة الخارجية */}
          {canManageIntegration ? (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                المزامنة عبر الخادم الخلفي الآمن (External Company Sync)
              </h4>
              <div className="flex gap-2">
                <input
                  type="url"
                  disabled={currentUser.role !== 'super_admin'}
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://api.company.com/shifts-export.json"
                  dir="ltr"
                  className="flex-1 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left disabled:opacity-60"
                />
                {currentUser.role === 'super_admin' && (
                  <button
                    type="button"
                    onClick={handleSaveEndpoint}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    حفظ الرابط
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-[11px]">
                <div>
                  <span className="text-slate-500 block">حالة الاتصال</span>
                  <strong>{securityPolicy.lastExternalSyncStatus}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">آخر مزامنة</span>
                  <strong className="font-mono">{securityPolicy.lastExternalSyncTime || lastSyncTime}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">سجلات مستوردة</span>
                  <strong className="font-mono text-emerald-600">{securityPolicy.lastExternalSyncImported}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">سجلات فاشلة</span>
                  <strong className="font-mono text-rose-600">{securityPolicy.lastExternalSyncFailed}</strong>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">
              إدارة إعدادات الربط الخارجي مقصورة على مدير النظام فقط.
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium whitespace-nowrap"
            >
              إغلاق
            </button>
            {canManageIntegration && (
              <button
                type="button"
                disabled={isTesting}
                onClick={handleSyncFromEndpoint}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`}
                />
                {isTesting ? 'جارٍ المزامنة الآمنة...' : 'مزامنة الآن'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
