import React, { useMemo, useState } from 'react';
import {
  FileText,
  Search,
  Download,
  Lock,
  CheckCircle2,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import {
  AuditLogItem,
  SecurityPolicySettings,
  UserProfile,
  UserRole,
} from '../types';
import { hasPermission, ROLE_SHORT_LABELS_AR } from '../utils/rbac';
import { escapeCsvCell } from '../utils/shiftCalculations';

interface AuditLogsPageProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  logs: AuditLogItem[];
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const AuditLogsPage: React.FC<AuditLogsPageProps> = ({
  currentUser,
  securityPolicy,
  logs,
  onNotify,
}) => {
  const canExport = hasPermission(currentUser, 'audit.export', securityPolicy);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'security' | 'operational'
  >('all');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [resultFilter, setResultFilter] = useState<
    'all' | 'success' | 'denied' | 'failure'
  >('all');

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...logs]
      .filter((item) => {
        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
        if (roleFilter !== 'all' && item.actorRole !== roleFilter) return false;
        if (resultFilter !== 'all' && item.result !== resultFilter) return false;
        if (!q) return true;
        return (
          item.actorName.toLowerCase().includes(q) ||
          item.action.toLowerCase().includes(q) ||
          item.targetId.toLowerCase().includes(q) ||
          item.afterSummary.toLowerCase().includes(q) ||
          item.beforeSummary.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [logs, searchQuery, categoryFilter, roleFilter, resultFilter]);

  const handleExportAuditCsv = () => {
    if (!canExport) return;
    let csv = '\uFEFF';
    const headers = [
      'التاريخ والوقت',
      'المنفذ',
      'الدور',
      'التصنيف',
      'العملية',
      'نوع العنصر',
      'معرف العنصر',
      'القيمة السابقة',
      'القيمة الجديدة',
      'السبب',
      'النتيجة',
    ];
    csv += headers.map(escapeCsvCell).join(',') + '\r\n';

    filteredLogs.forEach((l) => {
      const row = [
        l.timestamp,
        l.actorName,
        ROLE_SHORT_LABELS_AR[l.actorRole] || l.actorRole,
        l.category === 'security' ? 'أمني' : 'تشغيلي',
        l.action,
        l.targetType,
        l.targetId,
        l.beforeSummary,
        l.afterSummary,
        l.reason,
        l.result,
      ];
      csv += row.map(escapeCsvCell).join(',') + '\r\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `سجل_العمليات_الأمنية_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify('تم تصدير سجل العمليات الأمنية (CSV) بنجاح.');
  };

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-[1900px] w-full mx-auto space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold mb-1">
            <Lock className="w-4 h-4" />
            سجل غير قابل للتعديل أو الحذف (Immutable Audit Trail)
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
            سجل العمليات الأمنية والتشغيلية (Audit Log)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            جميع السجلات محمية بقواعد Firestore تمنع التعديل أو الحذف حتى على مدير النظام، وخالية تماماً من أي كلمات مرور أو رموز سرية.
          </p>
        </div>

        {canExport && (
          <button
            type="button"
            onClick={handleExportAuditCsv}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-4 h-4" />
            تصدير السجل (CSV)
          </button>
        )}
      </div>

      {/* شريط الفلترة */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث باسم المنفذ، نوع العملية، أو تفاصيل الحدث..."
            className="w-full border border-slate-300 dark:border-slate-700 rounded-lg pr-8 pl-3 py-2 bg-white dark:bg-slate-800"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
        </div>

        {currentUser.role === 'super_admin' && (
          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(
                e.target.value as 'all' | 'security' | 'operational'
              )
            }
            className="border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
          >
            <option value="all">كل التصنيفات (أمني + تشغيلي)</option>
            <option value="security">العمليات الأمنية وإدارة الحسابات</option>
            <option value="operational">العمليات التشغيلية والشفتات</option>
          </select>
        )}

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
          className="border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
        >
          <option value="all">كل الأدوار</option>
          <option value="super_admin">مدير النظام</option>
          <option value="operations_manager">مدير التشغيل</option>
          <option value="supervisor">مشرف فريق</option>
          <option value="delivery_rep">مندوب</option>
          <option value="viewer">مراقب</option>
        </select>

        <select
          value={resultFilter}
          onChange={(e) =>
            setResultFilter(
              e.target.value as 'all' | 'success' | 'denied' | 'failure'
            )
          }
          className="border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
        >
          <option value="all">كل النتائج</option>
          <option value="success">ناجحة</option>
          <option value="denied">مرفوضة أمنياً (Denied)</option>
          <option value="failure">فشل تنفيذي</option>
        </select>
      </div>

      {/* جدول السجل */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-right text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
              <th className="p-3">التوقيت</th>
              <th className="p-3">المنفذ والدور</th>
              <th className="p-3">التصنيف</th>
              <th className="p-3">العملية والهدف</th>
              <th className="p-3">قبل / بعد والسبب</th>
              <th className="p-3 text-center">النتيجة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-slate-500">
                  <FileText className="w-7 h-7 mx-auto mb-2 text-slate-400" />
                  لا توجد سجلات مطابقة لمعايير البحث الحالية.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr
                  key={log.logId}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {log.timestamp
                      ? new Date(log.timestamp).toLocaleString('ar-EG', {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })
                      : 'الآن'}
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {log.actorName}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {ROLE_SHORT_LABELS_AR[log.actorRole] || log.actorRole}
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        log.category === 'security'
                          ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {log.category === 'security' ? 'أمني' : 'تشغيلي'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="font-bold">{log.action}</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {log.targetType} / {log.targetId}
                    </div>
                  </td>
                  <td className="p-3 max-w-md space-y-0.5 text-[11px]">
                    {log.beforeSummary && log.beforeSummary !== '—' && (
                      <div className="text-slate-500">
                        <strong>سابقاً:</strong> {log.beforeSummary}
                      </div>
                    )}
                    {log.afterSummary && log.afterSummary !== '—' && (
                      <div className="text-slate-800 dark:text-slate-200">
                        <strong>الحالي:</strong> {log.afterSummary}
                      </div>
                    )}
                    {log.reason && log.reason !== '—' && (
                      <div className="text-indigo-700 dark:text-indigo-400">
                        <strong>السبب:</strong> {log.reason}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {log.result === 'success' ? (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        نجاح
                      </span>
                    ) : log.result === 'denied' ? (
                      <span className="inline-flex items-center gap-1 font-bold text-rose-700 dark:text-rose-400">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        مرفوض
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        خطأ
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
};
