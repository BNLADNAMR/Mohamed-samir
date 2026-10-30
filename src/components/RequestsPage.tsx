import React, { useMemo, useState } from 'react';
import {
  FileCheck2,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import {
  Employee,
  SecurityPolicySettings,
  UserProfile,
  WorkflowRequest,
  WorkflowRequestStatus,
  WorkflowRequestType,
} from '../types';
import {
  canReviewOrApproveRequest,
  hasPermission,
  ROLE_SHORT_LABELS_AR,
} from '../utils/rbac';
import {
  decideWorkflowRequest,
  recommendWorkflowRequestBySupervisor,
  submitWorkflowRequest,
} from '../services/firestoreService';
import { calculateShiftMinutes } from '../utils/shiftCalculations';

export const REQUEST_TYPE_LABELS: Record<WorkflowRequestType, string> = {
  leave: 'طلب إجازة',
  absence_dispute: 'اعتراض على غياب مسجل',
  attendance_correction: 'طلب تصحيح حضور',
  checkout_correction: 'تعديل وقت انصراف',
  shift_modification: 'طلب تعديل شفت',
};

export const REQUEST_STATUS_LABELS: Record<WorkflowRequestStatus, string> = {
  pending: 'قيد المراجعة',
  recommended: 'موصى به من المشرف',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

interface RequestsPageProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  requests: WorkflowRequest[];
  employees: Employee[];
  todayStr: string;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const RequestsPage: React.FC<RequestsPageProps> = ({
  currentUser,
  securityPolicy,
  requests,
  employees,
  todayStr,
  onNotify,
}) => {
  const canSubmit =
    hasPermission(currentUser, 'leave.request', securityPolicy) ||
    currentUser.role === 'super_admin' ||
    currentUser.role === 'operations_manager';

  const [statusFilter, setStatusFilter] = useState<'all' | WorkflowRequestStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | WorkflowRequestType>('all');

  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string>(
    currentUser.employeeId || ''
  );
  const [reqType, setReqType] = useState<WorkflowRequestType>('leave');
  const [reqDate, setReqDate] = useState<string>(todayStr);
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('17:00');
  const [description, setDescription] = useState<string>('');
  const [evidenceUrl, setEvidenceUrl] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);

  const [reviewModal, setReviewModal] = useState<{
    req: WorkflowRequest;
    mode: 'recommend' | 'approve' | 'reject';
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  // المندوبون المتاح اختيارهم عند تقديم طلب جديد حسب دور المستخدم
  const selectableEmployees = useMemo(() => {
    if (currentUser.role === 'delivery_rep') {
      return employees.filter(
        (e) => e.id === currentUser.employeeId || e.userId === currentUser.uid
      );
    }
    if (currentUser.role === 'supervisor') {
      return employees.filter((e) => e.teamId === currentUser.teamId);
    }
    return employees;
  }, [employees, currentUser]);

  const filteredRequests = useMemo(() => {
    return [...requests]
      .filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (typeFilter !== 'all' && r.requestType !== typeFilter) return false;
        return true;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [requests, statusFilter, typeFilter]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmp =
      currentUser.role === 'delivery_rep'
        ? selectableEmployees[0]
        : selectableEmployees.find((emp) => emp.id === selectedEmpId);

    if (!targetEmp) {
      onNotify('يرجى تحديد المندوب المرتبط بالطلب أولاً.', 'warning');
      return;
    }
    if (description.trim().length < 3) {
      onNotify('يرجى كتابة سبب واضح لا يقل عن 3 أحرف.', 'warning');
      return;
    }

    setIsBusy(true);
    try {
      await submitWorkflowRequest({
        actor: currentUser,
        employee: targetEmp,
        requestType: reqType,
        requestDate: reqDate,
        proposedStartTime: reqType === 'leave' ? '' : startTime,
        proposedEndTime: reqType === 'leave' ? '' : endTime,
        description,
        evidenceUrl,
      });
      setIsSubmitOpen(false);
      setDescription('');
      setEvidenceUrl('');
      onNotify('تم إرسال الطلب بنجاح وإدراجه في دورة الاعتماد.');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر إرسال الطلب.',
        'error'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleReviewDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModal) return;

    setIsBusy(true);
    try {
      if (reviewModal.mode === 'recommend') {
        await recommendWorkflowRequestBySupervisor({
          actor: currentUser,
          request: reviewModal.req,
          recommendation: reviewNote || 'أوصي بالمراجعة والاعتماد',
        });
        onNotify('تمت إضافة توصية المشرف على الطلب بنجاح.');
      } else {
        const emp = employees.find((item) => item.id === reviewModal.req.employeeId);
        const calcMins =
          reviewModal.req.requestType === 'leave'
            ? 0
            : calculateShiftMinutes(
                reviewModal.req.proposedStartTime || '09:00',
                reviewModal.req.proposedEndTime || '17:00',
                30
              );
        await decideWorkflowRequest({
          actor: currentUser,
          request: reviewModal.req,
          employee: emp,
          decision: reviewModal.mode === 'approve' ? 'approved' : 'rejected',
          reviewComment: reviewNote || (reviewModal.mode === 'approve' ? 'معتمد إدارياً' : 'غير مستوفٍ'),
          calculatedMinutes: calcMins,
        });
        onNotify(
          reviewModal.mode === 'approve'
            ? 'تم اعتماد الطلب وتحديث سجل الحضور والشفت تلقائياً.'
            : 'تم رفض الطلب وتوثيق السبب في سجل العمليات.',
          reviewModal.mode === 'approve' ? 'success' : 'info'
        );
      }
      setReviewModal(null);
      setReviewNote('');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء على الطلب.',
        'error'
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-[1900px] w-full mx-auto space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold mb-1">
            <FileCheck2 className="w-4 h-4" />
            دورة الاعتماد الرسمية (Approval Workflow)
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
            طلبات الإجازات وتصحيح الحضور والشفتات
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            لا يتم تعديل سجلات الحضور بناءً على الطلبات إلا بعد اعتماد رسمي من مدير التشغيل أو مدير النظام، ولا يمكن لأي مستخدم اعتماد طلبه الشخصي.
          </p>
        </div>

        {canSubmit && (
          <button
            type="button"
            onClick={() => {
              setSelectedEmpId(
                currentUser.employeeId || selectableEmployees[0]?.id || ''
              );
              setIsSubmitOpen(true);
            }}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            تقديم طلب جديد
          </button>
        )}
      </div>

      {/* فلاتر الطلبات */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as 'all' | WorkflowRequestStatus)
          }
          className="border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
        >
          <option value="all">كل حالات الطلبات ({requests.length})</option>
          <option value="pending">قيد المراجعة</option>
          <option value="recommended">موصى بها من المشرف</option>
          <option value="approved">معتمدة</option>
          <option value="rejected">مرفوضة</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as 'all' | WorkflowRequestType)
          }
          className="border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
        >
          <option value="all">كل أنواع الطلبات</option>
          {(Object.keys(REQUEST_TYPE_LABELS) as WorkflowRequestType[]).map((t) => (
            <option key={t} value={t}>
              {REQUEST_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* قائمة الطلبات */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-right text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
              <th className="p-3">المندوب</th>
              <th className="p-3">نوع الطلب</th>
              <th className="p-3">التاريخ المطلوب</th>
              <th className="p-3">الوقت المقترح</th>
              <th className="p-3">التفاصيل والسبب</th>
              <th className="p-3">توصية المشرف / رد الإدارة</th>
              <th className="p-3">الحالة</th>
              <th className="p-3 text-center">إجراء المراجعة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-10 text-center text-slate-500">
                  لا توجد طلبات مسجلة تطابق الفلتر المختار حالياً.
                </td>
              </tr>
            ) : (
              filteredRequests.map((req) => {
                const canRecommend = canReviewOrApproveRequest(
                  currentUser,
                  req,
                  'recommend',
                  securityPolicy
                );
                const canApproveReject = canReviewOrApproveRequest(
                  currentUser,
                  req,
                  'approve_or_reject',
                  securityPolicy
                );

                return (
                  <tr
                    key={req.requestId}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="p-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {req.employeeName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        مقدم بواسطة: {ROLE_SHORT_LABELS_AR[req.submitterRole]}
                      </div>
                    </td>
                    <td className="p-3 font-bold">
                      {REQUEST_TYPE_LABELS[req.requestType]}
                    </td>
                    <td className="p-3 font-mono">{req.requestDate}</td>
                    <td className="p-3 font-mono">
                      {req.proposedStartTime && req.proposedEndTime
                        ? `${req.proposedStartTime} → ${req.proposedEndTime}`
                        : '—'}
                    </td>
                    <td className="p-3 max-w-xs">
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {req.description}
                      </p>
                      {req.evidenceUrl && (
                        <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 block mt-0.5 truncate">
                          مرفق/مرجع: {req.evidenceUrl}
                        </span>
                      )}
                    </td>
                    <td className="p-3 max-w-xs space-y-1">
                      {req.supervisorRecommendation && (
                        <div className="text-[11px] text-sky-700 dark:text-sky-300">
                          <strong>توصية المشرف:</strong> {req.supervisorRecommendation}
                        </div>
                      )}
                      {req.reviewComment && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-300">
                          <strong>قرار ({req.reviewerName}):</strong> {req.reviewComment}
                        </div>
                      )}
                      {!req.supervisorRecommendation && !req.reviewComment && (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {req.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {REQUEST_STATUS_LABELS[req.status]}
                        </span>
                      ) : req.status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-700 dark:text-rose-400">
                          <XCircle className="w-3.5 h-3.5" />
                          {REQUEST_STATUS_LABELS[req.status]}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400">
                          <Clock className="w-3.5 h-3.5" />
                          {REQUEST_STATUS_LABELS[req.status]}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {canRecommend && (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewModal({ req, mode: 'recommend' });
                              setReviewNote(req.supervisorRecommendation || '');
                            }}
                            className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold flex items-center gap-1"
                          >
                            <MessageSquarePlus className="w-3.5 h-3.5" />
                            توصية
                          </button>
                        )}
                        {canApproveReject && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setReviewModal({ req, mode: 'approve' });
                                setReviewNote('');
                              }}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold"
                            >
                              اعتماد
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReviewModal({ req, mode: 'reject' });
                                setReviewNote('');
                              }}
                              className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold"
                            >
                              رفض
                            </button>
                          </>
                        )}
                        {!canRecommend && !canApproveReject && (
                          <span className="text-slate-400 text-[11px]">
                            {req.submittedBy === currentUser.uid &&
                            req.status === 'pending' &&
                            currentUser.role !== 'super_admin'
                              ? 'بانتظار جهة الاعتماد'
                              : 'مكتمل / للعرض'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* نافذة تقديم طلب جديد */}
      {isSubmitOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setIsSubmitOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-lg w-full border border-slate-200 dark:border-slate-800 overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-base">تقديم طلب إجازة أو تصحيح حضور</h3>
              <button
                type="button"
                onClick={() => setIsSubmitOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="p-6 space-y-4">
              {currentUser.role !== 'delivery_rep' && (
                <div>
                  <label className="font-bold block mb-1">المندوب المعني بالطلب *</label>
                  <select
                    required
                    value={selectedEmpId}
                    onChange={(e) => setSelectedEmpId(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                  >
                    <option value="">— اختر المندوب —</option>
                    {selectableEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold block mb-1">نوع الطلب *</label>
                  <select
                    value={reqType}
                    onChange={(e) => setReqType(e.target.value as WorkflowRequestType)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                  >
                    {(Object.keys(REQUEST_TYPE_LABELS) as WorkflowRequestType[]).map(
                      (k) => (
                        <option key={k} value={k}>
                          {REQUEST_TYPE_LABELS[k]}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">تاريخ اليوم المعني *</label>
                  <input
                    type="date"
                    required
                    value={reqDate}
                    onChange={(e) => setReqDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              {reqType !== 'leave' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold block mb-1">وقت البداية الصحيح</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">وقت الانصراف الصحيح</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="font-bold block mb-1">شرح وتفاصيل الطلب *</label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="اشرح سبب الإجازة أو تفاصيل التصحيح المطلوب..."
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">
                  رابط مستند أو رقم مرجعي داعم (اختياري)
                </label>
                <input
                  type="text"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="مثال: رقم التذكرة أو رابط الإذن الطبي"
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSubmitOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  {isBusy ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة المراجعة أو الاعتماد / الرفض */}
      {reviewModal && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setReviewModal(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-800 overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-base">
                {reviewModal.mode === 'recommend'
                  ? 'إضافة توصية مشرف الفريق'
                  : reviewModal.mode === 'approve'
                  ? 'اعتماد الطلب وتحديث السجل تلقائياً'
                  : 'رفض الطلب مع ذكر السبب'}
              </h3>
              <button
                type="button"
                onClick={() => setReviewModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReviewDecision} className="p-6 space-y-4">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 space-y-1">
                <div className="font-bold">{reviewModal.req.employeeName}</div>
                <div className="text-slate-500">
                  {REQUEST_TYPE_LABELS[reviewModal.req.requestType]} ·{' '}
                  <span className="font-mono">{reviewModal.req.requestDate}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 pt-1">
                  {reviewModal.req.description}
                </p>
              </div>

              <div>
                <label className="font-bold block mb-1">
                  {reviewModal.mode === 'recommend'
                    ? 'نص توصية المشرف *'
                    : 'ملاحظة قرار الاعتماد / الرفض *'}
                </label>
                <textarea
                  required
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="اكتب المبرر الإداري ليظهر لصاحب الطلب ويوثق في Audit Log..."
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReviewModal(null)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className={`px-5 py-2 text-white rounded-lg font-bold disabled:opacity-50 ${
                    reviewModal.mode === 'reject'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : reviewModal.mode === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-sky-600 hover:bg-sky-500'
                  }`}
                >
                  {isBusy ? 'جارٍ الحفظ...' : 'تأكيد القرار'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
