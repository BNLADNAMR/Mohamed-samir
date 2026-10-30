import React, { useMemo, useState } from 'react';
import {
  Users,
  Plus,
  Edit3,
  ArrowLeftRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import {
  AttendanceRecord,
  Employee,
  SecurityPolicySettings,
  Team,
  UserProfile,
} from '../types';
import { hasPermission } from '../utils/rbac';
import {
  saveTeamRecord,
  transferEmployeeToTeam,
} from '../services/firestoreService';

interface TeamsManagementPageProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  teams: Team[];
  users: UserProfile[];
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const TeamsManagementPage: React.FC<TeamsManagementPageProps> = ({
  currentUser,
  securityPolicy,
  teams,
  users,
  employees,
  attendanceRecords,
  onNotify,
}) => {
  const canManageTeams = hasPermission(currentUser, 'teams.manage', securityPolicy);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamIdInput, setTeamIdInput] = useState('');
  const [teamNameInput, setTeamNameInput] = useState('');
  const [supervisorIdInput, setSupervisorIdInput] = useState('');
  const [teamStatusInput, setTeamStatusInput] = useState<'active' | 'disabled'>('active');
  const [isSaving, setIsSaving] = useState(false);

  const [transferTargetEmp, setTransferTargetEmp] = useState<Employee | null>(null);
  const [destinationTeamId, setDestinationTeamId] = useState('');

  const supervisorsList = useMemo(
    () => users.filter((u) => u.role === 'supervisor' && u.status === 'active'),
    [users]
  );

  const visibleTeams = useMemo(() => {
    if (currentUser.role === 'supervisor') {
      return teams.filter(
        (t) => t.teamId === currentUser.teamId || t.supervisorId === currentUser.uid
      );
    }
    return teams;
  }, [teams, currentUser]);

  const openCreateTeam = () => {
    setEditingTeam(null);
    setTeamIdInput(`TEAM_${String(teams.length + 1).padStart(2, '0')}`);
    setTeamNameInput('');
    setSupervisorIdInput('');
    setTeamStatusInput('active');
    setIsModalOpen(true);
  };

  const openEditTeam = (team: Team) => {
    setEditingTeam(team);
    setTeamIdInput(team.teamId);
    setTeamNameInput(team.teamName);
    setSupervisorIdInput(team.supervisorId || '');
    setTeamStatusInput(team.status);
    setIsModalOpen(true);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTeams) return;
    if (!teamNameInput.trim()) return;

    const currentMemberCount = employees.filter(
      (emp) => emp.teamId === teamIdInput.trim()
    ).length;

    setIsSaving(true);
    try {
      await saveTeamRecord({
        actor: currentUser,
        team: {
          teamId: teamIdInput.trim(),
          teamName: teamNameInput.trim(),
          supervisorId: supervisorIdInput,
          status: teamStatusInput,
          memberCount: currentMemberCount,
        },
        isEdit: Boolean(editingTeam),
      });
      setIsModalOpen(false);
      onNotify(
        editingTeam
          ? `تم تحديث بيانات الفريق "${teamNameInput}" بنجاح.`
          : `تم إنشاء الفريق "${teamNameInput}" بنجاح.`
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر حفظ بيانات الفريق.',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTargetEmp || !canManageTeams) return;

    setIsSaving(true);
    try {
      await transferEmployeeToTeam({
        actor: currentUser,
        employee: transferTargetEmp,
        newTeamId: destinationTeamId,
        attendanceRecords,
        allTeams: teams,
      });
      setTransferTargetEmp(null);
      onNotify(
        `تم نقل المندوب "${transferTargetEmp.fullName}" وتحديث نطاق الوصول تلقائياً في السجل الأمني.`
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر نقل المندوب بين الفرق.',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const unassignedEmployees = useMemo(
    () => employees.filter((e) => !e.teamId),
    [employees]
  );

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-[1900px] w-full mx-auto space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold mb-1">
            <ShieldCheck className="w-4 h-4" />
            عزل نطاق البيانات التشغيلي (Team Data Scope)
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
            إدارة الفرق والمشرفين وتوزيع المندوبين
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            كل مندوب ينتمي إلى فريق أساسي نشط واحد فقط، ولا يرى كل مشرف سوى مندوبي وشفتات فريقه المخصص.
          </p>
        </div>

        {canManageTeams && (
          <button
            type="button"
            onClick={openCreateTeam}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            إنشاء فريق جديد
          </button>
        )}
      </div>

      {/* بطاقات الفرق */}
      {visibleTeams.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            لا توجد فرق مسجلة حالياً ضمن نطاق صلاحيتك
          </p>
          {canManageTeams && (
            <p className="text-xs text-slate-500">
              اضغط على "إنشاء فريق جديد" لتأسيس الفرق وتعيين المشرفين والمندوبين.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleTeams.map((team) => {
            const members = employees.filter((e) => e.teamId === team.teamId);
            const sup = users.find((u) => u.uid === team.supervisorId);
            return (
              <div
                key={team.teamId}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                        {team.teamName}
                      </h2>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {team.teamId}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      المشرف المسؤول:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {sup ? `${sup.name} (${sup.email})` : team.supervisorId || 'غير معيّن بعد'}
                      </strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {team.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        نشط
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 dark:text-rose-400">
                        <XCircle className="w-3.5 h-3.5" />
                        معطل
                      </span>
                    )}
                    {canManageTeams && (
                      <button
                        type="button"
                        onClick={() => openEditTeam(team)}
                        className="p-1.5 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="تعديل الفريق أو تعيين مشرف"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    أعضاء الفريق ({members.length} مندوب)
                  </div>
                  {members.length === 0 ? (
                    <p className="text-xs text-slate-400">لا يوجد مندوبون مضافون لهذا الفريق بعد.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {members.map((emp) => (
                        <div
                          key={emp.id}
                          className="py-2 flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {emp.fullName}
                            </span>{' '}
                            <span className="font-mono text-slate-500">
                              ({emp.employeeCode})
                            </span>
                          </div>
                          {canManageTeams && (
                            <button
                              type="button"
                              onClick={() => {
                                setTransferTargetEmp(emp);
                                setDestinationTeamId(emp.teamId || '');
                              }}
                              className="px-2 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded flex items-center gap-1"
                            >
                              <ArrowLeftRight className="w-3 h-3" />
                              نقل لفريق آخر
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* المندوبون غير الموزعين على فرق بعد */}
      {currentUser.role !== 'supervisor' && unassignedEmployees.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            مندوبون غير معينين لفريق محدد ({unassignedEmployees.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {unassignedEmployees.slice(0, 30).map((emp) => (
              <div
                key={emp.id}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-bold">{emp.fullName}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    {emp.employeeCode}
                  </div>
                </div>
                {canManageTeams && (
                  <button
                    type="button"
                    onClick={() => {
                      setTransferTargetEmp(emp);
                      setDestinationTeamId(teams[0]?.teamId || '');
                    }}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-[11px]"
                  >
                    تسكين في فريق
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* نافذة إنشاء / تعديل فريق */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-800 overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingTeam ? 'تعديل بيانات الفريق' : 'إنشاء فريق تشغيلي جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeam} className="p-6 space-y-4">
              <div>
                <label className="font-bold block mb-1">كود تعريف الفريق *</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingTeam)}
                  value={teamIdInput}
                  onChange={(e) => setTeamIdInput(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 font-mono disabled:opacity-60"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">اسم الفريق *</label>
                <input
                  type="text"
                  required
                  value={teamNameInput}
                  onChange={(e) => setTeamNameInput(e.target.value)}
                  placeholder="مثال: فريق شرق القاهرة - أ"
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">تعيين مشرف الفريق</label>
                <select
                  value={supervisorIdInput}
                  onChange={(e) => setSupervisorIdInput(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                >
                  <option value="">— بدون مشرف معين حالياً —</option>
                  {supervisorsList.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.name} ({s.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold block mb-1">حالة الفريق</label>
                <select
                  value={teamStatusInput}
                  onChange={(e) =>
                    setTeamStatusInput(e.target.value as 'active' | 'disabled')
                  }
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                >
                  <option value="active">نشط</option>
                  <option value="disabled">معطل</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  {isSaving ? 'جارٍ الحفظ...' : 'حفظ الفريق'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة نقل مندوب بين الفرق */}
      {transferTargetEmp && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setTransferTargetEmp(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-800 overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-base">
                نقل المندوب وتحديث نطاق الصلاحيات
              </h3>
              <button
                type="button"
                onClick={() => setTransferTargetEmp(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleTransferSubmit} className="p-6 space-y-4">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                نقل المندوب{' '}
                <strong className="text-slate-900 dark:text-white">
                  {transferTargetEmp.fullName} ({transferTargetEmp.employeeCode})
                </strong>{' '}
                سيؤدي تلقائياً إلى تحويل صلاحية متابعة حضوره وشفتاته إلى مشرف الفريق الجديد وتوثيق النقل في سجل العمليات الأمنية.
              </p>

              <div>
                <label className="font-bold block mb-1">الفريق الأساسي الجديد</label>
                <select
                  value={destinationTeamId}
                  onChange={(e) => setDestinationTeamId(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                >
                  <option value="">— إزالة من الفرق (بدون فريق) —</option>
                  {teams
                    .filter((t) => t.status === 'active')
                    .map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.teamName} ({t.teamId})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setTransferTargetEmp(null)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  {isSaving ? 'جارٍ النقل...' : 'تأكيد النقل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
