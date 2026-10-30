import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  ChevronRight,
  ChevronLeft,
  UserPlus,
  Download,
  Printer,
  RefreshCw,
  BarChart3,
  Users,
  Edit3,
  Trash2,
  Sun,
  Moon,
  ShieldCheck,
  LogOut,
  CloudUpload,
  Lock,
  ShieldAlert,
  ArrowRight,
  Home,
  Menu,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { auth, db, isBenignAbortError } from './firebase';
import {
  AppRoutePage,
  AttendanceRecord,
  AttendanceStatus,
  AuditLogItem,
  Employee,
  EmployeeSummary,
  MonthDay,
  PreprovisionedInvitation,
  ProfileSectionId,
  ShiftSelectionStatus,
  Team,
  ToastNotification,
  UserProfile,
  WorkflowRequest,
} from './types';
import {
  MONTH_NAMES,
  calculateShiftMinutes,
  computeEmployeeSummary,
  escapeCsvCell,
  getDayTemporalState,
  getDaysInMonth,
  safeLoadFromStorage,
  safeSaveToStorage,
} from './utils/shiftCalculations';
import {
  canAccessRoute,
  canRecordOrEditAttendance,
  getDefaultRouteForRole,
  hasPermission,
  ROLE_SHORT_LABELS_AR,
} from './utils/rbac';
import {
  clearAllOperationalDataFirestore,
  deleteAttendanceFirestore,
  deleteEmployeeFirestore,
  formatFirestoreTimestamp,
  migrateLocalDataToFirestore,
  recordAuditLog,
  saveAttendanceFirestore,
  saveEmployeeFirestore,
  saveSecurityPolicySettings,
} from './services/firestoreService';
import {
  AuthProvider,
  parseUserProfileDoc,
  useAuth,
} from './context/AuthContext';
import { FirestoreErrorBoundary } from './components/FirestoreErrorBoundary';
import { AuthScreen } from './components/AuthScreen';
import { AccessDeniedView } from './components/AccessDeniedView';
import { CellEditorModal } from './components/CellEditorModal';
import { EmployeeModal } from './components/EmployeeModal';
import { ImportSyncModal } from './components/ImportSyncModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import { AnalyticsPage } from './components/AnalyticsPage';
import { ExecutiveOverviewDashboard } from './components/ExecutiveOverviewDashboard';
import {
  ShiftCaseDetailPage,
  ShiftCasePageType,
} from './components/ShiftCaseDetailPage';
import { UserManagementPage } from './components/UserManagementPage';
import { TeamsManagementPage } from './components/TeamsManagementPage';
import { RequestsPage } from './components/RequestsPage';
import { ProfileAndRepPortalPage } from './components/ProfileAndRepPortalPage';
import { AuditLogsPage } from './components/AuditLogsPage';
import { SecuritySettingsPage } from './components/SecuritySettingsPage';
import {
  SecurityHubTab,
  SuperAdminSecurityHub,
} from './components/SuperAdminSecurityHub';
import {
  NavigationSnapshot,
  areSnapshotsEqual,
  getBackTargetHintAr,
  getSnapshotLabelAr,
  pushNavigationSnapshot,
  resolveBackStep,
} from './utils/navigationHistory';
import { AppSectionsDrawer } from './components/AppSectionsDrawer';
import { DrawerQuickActionId } from './utils/sectionsCatalog';

const VALID_ROUTES: Set<string> = new Set([
  'dashboard',
  'monthly_grid',
  'analytics',
  'my_portal',
  'requests',
  'security_center',
  'users',
  'teams',
  'audit_logs',
  'security_settings',
  'profile',
]);

function parseHashRoute(defaultRoute: AppRoutePage): AppRoutePage {
  if (typeof window === 'undefined') return defaultRoute;
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (VALID_ROUTES.has(raw)) {
    return raw as AppRoutePage;
  }
  return defaultRoute;
}

function AuthenticatedWorkspace({
  isDarkMode,
  setIsDarkMode,
}: {
  isDarkMode: boolean;
  setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const {
    userProfile,
    securityPolicy,
    linkedProviderIds,
    isEmailVerified,
    lastIdentityVerifiedAt,
    requestPasswordReset,
    updatePersonalProfileInfo,
    changeOrSetManualPassword,
    updateAccountSecuritySettings,
    reauthenticateAccountManually,
    refreshSecuritySessionToken,
    sendVerificationEmailManually,
    logout,
  } = useAuth();

  // ضمان أمان الأنواع (يتم استدعاء هذا المكون فقط بعد التأكد من وجود userProfile)
  const currentUser = userProfile!;
  const defaultRoute = getDefaultRouteForRole(currentUser.role);

  const getInitialSecurityTabFromRoute = (route: AppRoutePage): SecurityHubTab => {
    if (route === 'users') return 'users';
    if (route === 'teams') return 'teams';
    if (route === 'audit_logs') return 'audit_and_simulator';
    return 'overview';
  };

  const [activeRoute, setActiveRoute] = useState<AppRoutePage>(() =>
    parseHashRoute(defaultRoute)
  );
  const [securityHubTab, setSecurityHubTab] = useState<SecurityHubTab>(() =>
    getInitialSecurityTabFromRoute(parseHashRoute(defaultRoute))
  );
  const [profileSection, setProfileSection] = useState<ProfileSectionId>('all');
  const [navHistory, setNavHistory] = useState<NavigationSnapshot[]>([]);
  const [mfaNoticeDismissed, setMfaNoticeDismissed] = useState(false);

  // التاريخ الحالي
  const [today, setToday] = useState<Date>(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setToday((prev) =>
        prev.getDate() !== now.getDate() || prev.getMonth() !== now.getMonth()
          ? now
          : prev
      );
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const todayStr = useMemo(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(today.getDate()).padStart(2, '0')}`;
  }, [today]);

  const [currentYear, setCurrentYear] = useState<number>(() => today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(
    () => today.getMonth() + 1
  );

  // البيانات السحابية المعزولة حسب دور المستخدم ونطاق فريقه في Firestore
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    Record<string, AttendanceRecord>
  >({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [requests, setRequests] = useState<WorkflowRequest[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([currentUser]);
  const [invitations, setInvitations] = useState<PreprovisionedInvitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [myAccountAuditLogs, setMyAccountAuditLogs] = useState<AuditLogItem[]>([]);
  const [isInitialCloudLoaded, setIsInitialCloudLoaded] = useState(false);
  const [isMigratingLocal, setIsMigratingLocal] = useState(false);

  // فحص وجود بيانات سابقة في المتصفح لترحيلها بأمان دون فقد أي سجل
  const [legacyLocalEmployees] = useState<Employee[]>(() =>
    safeLoadFromStorage<Employee[]>('shift_tracker_employees', [])
  );
  const [legacyLocalAttendance] = useState<Record<string, AttendanceRecord>>(() =>
    safeLoadFromStorage<Record<string, AttendanceRecord>>(
      'shift_tracker_attendance',
      {}
    )
  );
  const [legacyMigratedDone, setLegacyMigratedDone] = useState<boolean>(() =>
    safeLoadFromStorage<boolean>('shift_tracker_cloud_migrated_v1', false)
  );

  // الفلاتر والبحث والترتيب
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSelection, setFilterSelection] = useState('all');
  const [filterAttendance, setFilterAttendance] = useState('all');
  const [sortBy, setSortBy] = useState('code');
  const [activeViewTab, setActiveViewTab] = useState<'grid' | 'analytics'>('grid');
  const [activeCasePage, setActiveCasePage] = useState<ShiftCasePageType | null>(
    null
  );

  // النوافذ المنبثقة
  const [editingCell, setEditingCell] = useState<{
    employee: Employee;
    date: string;
    record?: AttendanceRecord;
  } | null>(null);

  const [employeeModalState, setEmployeeModalState] = useState<{
    open: boolean;
    editingEmployee: Employee | null;
  }>({ open: false, editingEmployee: null });

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSectionsDrawerOpen, setIsSectionsDrawerOpen] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() =>
    new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  );
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastNotification['type'] = 'success') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3800);
    },
    []
  );

  // لقطة التنقل الحالية وسجل الرجوع للخلف عبر جميع صفحات وأقسام النظام
  const currentNavSnapshot: NavigationSnapshot = useMemo(
    () => ({
      route: activeRoute,
      viewTab: activeViewTab,
      casePage: activeCasePage,
      securityTab: securityHubTab,
      profileSection,
    }),
    [activeRoute, activeViewTab, activeCasePage, securityHubTab, profileSection]
  );

  const applyNavigation = useCallback(
    (
      partialNext: Partial<NavigationSnapshot>,
      options?: { pushBrowserHistory?: boolean }
    ) => {
      const next: NavigationSnapshot = {
        route: partialNext.route ?? activeRoute,
        viewTab: partialNext.viewTab ?? activeViewTab,
        casePage:
          partialNext.casePage !== undefined ? partialNext.casePage : activeCasePage,
        securityTab: partialNext.securityTab ?? securityHubTab,
        profileSection: partialNext.profileSection ?? profileSection,
      };

      if (areSnapshotsEqual(currentNavSnapshot, next)) return;

      setNavHistory((prev) =>
        pushNavigationSnapshot(prev, currentNavSnapshot, next)
      );
      setActiveRoute(next.route);
      setActiveViewTab(next.viewTab);
      setActiveCasePage(next.casePage);
      setSecurityHubTab(next.securityTab);
      setProfileSection(next.profileSection ?? 'all');

      if (typeof window !== 'undefined' && options?.pushBrowserHistory !== false) {
        window.history.pushState(
          { shiftTrackerNav: next },
          '',
          `#${next.route}`
        );
      }
    },
    [
      activeRoute,
      activeViewTab,
      activeCasePage,
      securityHubTab,
      profileSection,
      currentNavSnapshot,
    ]
  );

  const navigateToRoute = useCallback(
    (route: AppRoutePage, targetProfileSection?: ProfileSectionId) => {
      const nextSecTab: SecurityHubTab =
        route === 'users'
          ? 'users'
          : route === 'teams'
          ? 'teams'
          : route === 'audit_logs'
          ? 'audit_and_simulator'
          : route === 'security_center'
          ? 'overview'
          : securityHubTab;

      applyNavigation({
        route,
        viewTab: 'grid',
        casePage: null,
        securityTab: nextSecTab,
        profileSection:
          route === 'profile' ? targetProfileSection ?? 'all' : 'all',
      });
    },
    [applyNavigation, securityHubTab]
  );

  // مزامنة زر الرجوع في المتصفح وتغيير الرابط اليدوي مع مكدس التنقل الداخلي
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.history.state?.shiftTrackerNav) {
      window.history.replaceState(
        { shiftTrackerNav: currentNavSnapshot },
        '',
        window.location.hash || `#${activeRoute}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const restored = event.state?.shiftTrackerNav as
        | NavigationSnapshot
        | undefined;
      if (restored && VALID_ROUTES.has(restored.route)) {
        setNavHistory((prev) => {
          if (prev.length === 0) return prev;
          const copy = [...prev];
          copy.pop();
          return copy;
        });
        setActiveRoute(restored.route);
        setActiveViewTab(restored.viewTab || 'grid');
        setActiveCasePage(restored.casePage ?? null);
        setSecurityHubTab(restored.securityTab || 'overview');
        setProfileSection(restored.profileSection || 'all');
      }
    };

    const onHashChange = () => {
      const nextRoute = parseHashRoute(defaultRoute);
      if (nextRoute !== activeRoute) {
        applyNavigation(
          {
            route: nextRoute,
            viewTab: 'grid',
            casePage: null,
            securityTab: getInitialSecurityTabFromRoute(nextRoute),
            profileSection: 'all',
          },
          { pushBrowserHistory: false }
        );
      }
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [activeRoute, applyNavigation, defaultRoute]);

  // الاستماع اللحظي من Cloud Firestore وفق صلاحيات ونطاق كل دور بدقة
  useEffect(() => {
    let isUnmounted = false;
    const unsubs: (() => void)[] = [];

    const handleListenerError = (label: string) => (err: unknown) => {
      if (isUnmounted || isBenignAbortError(err) || !auth.currentUser) {
        return;
      }
      console.warn(label, err);
    };

    // 1. المندوبون (Employees)
    if (
      currentUser.role === 'super_admin' ||
      currentUser.role === 'operations_manager' ||
      currentUser.role === 'viewer'
    ) {
      unsubs.push(
        onSnapshot(
          collection(db, 'employees'),
          (snap) => {
            const list: Employee[] = snap.docs.map((d) => {
              const raw = d.data();
              return {
                id: String(raw.id || d.id),
                employeeCode: String(raw.employeeCode || d.id),
                fullName: String(raw.fullName || ''),
                phone: String(raw.phone || ''),
                hireDate: String(raw.hireDate || ''),
                status: raw.status === 'suspended' ? 'suspended' : 'active',
                externalId: String(raw.externalId || ''),
                teamId: String(raw.teamId || ''),
                userId: String(raw.userId || ''),
                notes: String(raw.notes || ''),
                createdAt: formatFirestoreTimestamp(raw.createdAt),
                updatedAt: formatFirestoreTimestamp(raw.updatedAt),
              };
            });
            setEmployees(list);
            setIsInitialCloudLoaded(true);
            setLastSyncTime(
              new Date().toLocaleTimeString('ar-EG', {
                hour: '2-digit',
                minute: '2-digit',
              })
            );
          },
          handleListenerError('Employees listener warning:')
        )
      );
    } else if (currentUser.role === 'supervisor') {
      if (currentUser.teamId) {
        unsubs.push(
          onSnapshot(
            query(
              collection(db, 'employees'),
              where('teamId', '==', currentUser.teamId)
            ),
            (snap) => {
              const list: Employee[] = snap.docs.map((d) => {
                const raw = d.data();
                return {
                  id: String(raw.id || d.id),
                  employeeCode: String(raw.employeeCode || d.id),
                  fullName: String(raw.fullName || ''),
                  phone: String(raw.phone || ''),
                  hireDate: String(raw.hireDate || ''),
                  status: raw.status === 'suspended' ? 'suspended' : 'active',
                  externalId: String(raw.externalId || ''),
                  teamId: String(raw.teamId || ''),
                  userId: String(raw.userId || ''),
                  notes: String(raw.notes || ''),
                };
              });
              setEmployees(list);
              setIsInitialCloudLoaded(true);
            },
            handleListenerError('Team employees listener warning:')
          )
        );
      } else {
        setEmployees([]);
        setIsInitialCloudLoaded(true);
      }
    } else if (currentUser.role === 'delivery_rep') {
      if (currentUser.employeeId) {
        unsubs.push(
          onSnapshot(
            doc(db, 'employees', currentUser.employeeId),
            (docSnap) => {
              if (docSnap.exists()) {
                const raw = docSnap.data();
                setEmployees([
                  {
                    id: String(raw.id || docSnap.id),
                    employeeCode: String(raw.employeeCode || docSnap.id),
                    fullName: String(raw.fullName || ''),
                    phone: String(raw.phone || ''),
                    hireDate: String(raw.hireDate || ''),
                    status: raw.status === 'suspended' ? 'suspended' : 'active',
                    externalId: String(raw.externalId || ''),
                    teamId: String(raw.teamId || ''),
                    userId: String(raw.userId || ''),
                    notes: String(raw.notes || ''),
                  },
                ]);
              } else {
                setEmployees([]);
              }
              setIsInitialCloudLoaded(true);
            },
            handleListenerError('Self employee listener warning:')
          )
        );
      } else {
        setEmployees([]);
        setIsInitialCloudLoaded(true);
      }
    }

    // 2. سجلات الحضور والشفتات (Attendance)
    const parseAttendanceSnap = (docs: { id: string; data: () => Record<string, unknown> }[]) => {
      const map: Record<string, AttendanceRecord> = {};
      docs.forEach((d) => {
        const raw = d.data();
        const empId = String(raw.employeeId || '');
        const date = String(raw.date || '');
        if (!empId || !date) return;
        const key = `${empId}_${date}`;
        map[key] = {
          id: String(raw.id || d.id),
          employeeId: empId,
          teamId: String(raw.teamId || ''),
          date,
          shiftSelection: (raw.shiftSelection as ShiftSelectionStatus) || 'undecided',
          attendance: (raw.attendance as AttendanceStatus) || 'pending',
          startTime: String(raw.startTime || '09:00'),
          endTime: String(raw.endTime || '17:00'),
          breakMinutes: Number(raw.breakMinutes) || 0,
          totalWorkedMinutes: Number(raw.totalWorkedMinutes) || 0,
          supervisorNotes: String(raw.supervisorNotes || ''),
          source: (raw.source as AttendanceRecord['source']) || 'manual',
          recordedBy: String(raw.recordedBy || ''),
          updatedAt: formatFirestoreTimestamp(raw.updatedAt),
        };
      });
      setAttendanceRecords(map);
    };

    if (
      currentUser.role === 'super_admin' ||
      currentUser.role === 'operations_manager' ||
      currentUser.role === 'viewer'
    ) {
      unsubs.push(
        onSnapshot(
          collection(db, 'attendance'),
          (snap) => parseAttendanceSnap(snap.docs),
          handleListenerError('Attendance listener warning:')
        )
      );
    } else if (currentUser.role === 'supervisor' && currentUser.teamId) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'attendance'),
            where('teamId', '==', currentUser.teamId)
          ),
          (snap) => parseAttendanceSnap(snap.docs),
          handleListenerError('Team attendance listener warning:')
        )
      );
    } else if (currentUser.role === 'delivery_rep' && currentUser.employeeId) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'attendance'),
            where('employeeId', '==', currentUser.employeeId)
          ),
          (snap) => parseAttendanceSnap(snap.docs),
          handleListenerError('Rep attendance listener warning:')
        )
      );
    }

    // 3. الفرق (Teams)
    if (
      currentUser.role === 'super_admin' ||
      currentUser.role === 'operations_manager' ||
      currentUser.role === 'viewer'
    ) {
      unsubs.push(
        onSnapshot(
          collection(db, 'teams'),
          (snap) => {
            setTeams(
              snap.docs.map((d) => {
                const raw = d.data();
                return {
                  teamId: String(raw.teamId || d.id),
                  teamName: String(raw.teamName || ''),
                  supervisorId: String(raw.supervisorId || ''),
                  status: raw.status === 'disabled' ? 'disabled' : 'active',
                  memberCount: Number(raw.memberCount) || 0,
                  createdAt: formatFirestoreTimestamp(raw.createdAt),
                  updatedAt: formatFirestoreTimestamp(raw.updatedAt),
                };
              })
            );
          },
          () => {}
        )
      );
    } else if (currentUser.role === 'supervisor' && currentUser.teamId) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'teams'),
            where('teamId', '==', currentUser.teamId)
          ),
          (snap) => {
            setTeams(
              snap.docs.map((d) => {
                const raw = d.data();
                return {
                  teamId: String(raw.teamId || d.id),
                  teamName: String(raw.teamName || ''),
                  supervisorId: String(raw.supervisorId || ''),
                  status: raw.status === 'disabled' ? 'disabled' : 'active',
                  memberCount: Number(raw.memberCount) || 0,
                  createdAt: formatFirestoreTimestamp(raw.createdAt),
                  updatedAt: formatFirestoreTimestamp(raw.updatedAt),
                };
              })
            );
          },
          () => {}
        )
      );
    }

    // 4. طلبات الإجازات والتصحيح (Requests)
    const parseRequestsSnap = (docs: { id: string; data: () => Record<string, unknown> }[]) => {
      setRequests(
        docs.map((d) => {
          const raw = d.data();
          return {
            requestId: String(raw.requestId || d.id),
            employeeId: String(raw.employeeId || ''),
            employeeName: String(raw.employeeName || ''),
            teamId: String(raw.teamId || ''),
            submittedBy: String(raw.submittedBy || ''),
            submitterRole: (raw.submitterRole as WorkflowRequest['submitterRole']) || 'delivery_rep',
            requestType: (raw.requestType as WorkflowRequest['requestType']) || 'leave',
            requestDate: String(raw.requestDate || ''),
            proposedStartTime: String(raw.proposedStartTime || ''),
            proposedEndTime: String(raw.proposedEndTime || ''),
            description: String(raw.description || ''),
            evidenceUrl: String(raw.evidenceUrl || ''),
            status: (raw.status as WorkflowRequest['status']) || 'pending',
            supervisorRecommendation: String(raw.supervisorRecommendation || ''),
            reviewedBy: String(raw.reviewedBy || ''),
            reviewerName: String(raw.reviewerName || ''),
            reviewComment: String(raw.reviewComment || ''),
            reviewedAt: formatFirestoreTimestamp(raw.reviewedAt),
            createdAt: formatFirestoreTimestamp(raw.createdAt),
            updatedAt: formatFirestoreTimestamp(raw.updatedAt),
          };
        })
      );
    };

    if (
      currentUser.role === 'super_admin' ||
      currentUser.role === 'operations_manager'
    ) {
      unsubs.push(
        onSnapshot(
          collection(db, 'requests'),
          (snap) => parseRequestsSnap(snap.docs),
          () => {}
        )
      );
    } else if (currentUser.role === 'supervisor' && currentUser.teamId) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'requests'),
            where('teamId', '==', currentUser.teamId)
          ),
          (snap) => parseRequestsSnap(snap.docs),
          () => {}
        )
      );
    } else if (currentUser.role === 'delivery_rep' && currentUser.employeeId) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'requests'),
            where('employeeId', '==', currentUser.employeeId)
          ),
          (snap) => parseRequestsSnap(snap.docs),
          () => {}
        )
      );
    }

    // 5. المستخدمون والدعوات (Users & Invitations) للإدارة فقط
    if (
      currentUser.role === 'super_admin' ||
      currentUser.role === 'operations_manager'
    ) {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            setAllUsers(
              snap.docs.map((d) => parseUserProfileDoc(d.id, d.data()))
            );
          },
          () => {}
        )
      );
    }

    if (currentUser.role === 'super_admin') {
      unsubs.push(
        onSnapshot(
          collection(db, 'preprovisionedUsers'),
          (snap) => {
            setInvitations(
              snap.docs.map((d) => {
                const raw = d.data();
                return {
                  emailKey: String(raw.emailKey || d.id),
                  name: String(raw.name || ''),
                  email: String(raw.email || ''),
                  role: (raw.role as typeof currentUser.role) || 'delivery_rep',
                  extraPermissions: Array.isArray(raw.extraPermissions)
                    ? raw.extraPermissions
                    : [],
                  revokedPermissions: Array.isArray(raw.revokedPermissions)
                    ? raw.revokedPermissions
                    : [],
                  employeeId: String(raw.employeeId || ''),
                  teamId: String(raw.teamId || ''),
                  status: (raw.status as typeof currentUser.status) || 'active',
                  createdBy: String(raw.createdBy || ''),
                  createdAt: formatFirestoreTimestamp(raw.createdAt),
                  updatedAt: formatFirestoreTimestamp(raw.updatedAt),
                };
              })
            );
          },
          () => {}
        )
      );
    }

    // 6. سجل العمليات الأمنية والتشغيلية (Audit Logs)
    if (currentUser.role === 'super_admin') {
      unsubs.push(
        onSnapshot(
          collection(db, 'auditLogs'),
          (snap) => {
            setAuditLogs(
              snap.docs.map((d) => {
                const raw = d.data();
                return {
                  logId: String(raw.logId || d.id),
                  actorUserId: String(raw.actorUserId || ''),
                  actorName: String(raw.actorName || ''),
                  actorRole: (raw.actorRole as typeof currentUser.role) || 'viewer',
                  category: raw.category === 'security' ? 'security' : 'operational',
                  action: String(raw.action || ''),
                  targetType: String(raw.targetType || ''),
                  targetId: String(raw.targetId || ''),
                  beforeSummary: String(raw.beforeSummary || ''),
                  afterSummary: String(raw.afterSummary || ''),
                  reason: String(raw.reason || ''),
                  result:
                    raw.result === 'denied' || raw.result === 'failure'
                      ? raw.result
                      : 'success',
                  timestamp: formatFirestoreTimestamp(raw.timestamp),
                };
              })
            );
          },
          () => {}
        )
      );
    } else if (currentUser.role === 'operations_manager') {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'auditLogs'),
            where('category', '==', 'operational')
          ),
          (snap) => {
            setAuditLogs(
              snap.docs.map((d) => {
                const raw = d.data();
                return {
                  logId: String(raw.logId || d.id),
                  actorUserId: String(raw.actorUserId || ''),
                  actorName: String(raw.actorName || ''),
                  actorRole: (raw.actorRole as typeof currentUser.role) || 'viewer',
                  category: 'operational',
                  action: String(raw.action || ''),
                  targetType: String(raw.targetType || ''),
                  targetId: String(raw.targetId || ''),
                  beforeSummary: String(raw.beforeSummary || ''),
                  afterSummary: String(raw.afterSummary || ''),
                  reason: String(raw.reason || ''),
                  result:
                    raw.result === 'denied' || raw.result === 'failure'
                      ? raw.result
                      : 'success',
                  timestamp: formatFirestoreTimestamp(raw.timestamp),
                };
              })
            );
          },
          () => {}
        )
      );
    }

    // 7. سجل النشاط الأمني الخاص بحساب المستخدم الحالي (للملف الشخصي)
    if (currentUser.role !== 'super_admin') {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'auditLogs'),
            where('actorUserId', '==', currentUser.uid)
          ),
          (snap) => {
            setMyAccountAuditLogs(
              snap.docs.map((d) => {
                const raw = d.data();
                return {
                  logId: String(raw.logId || d.id),
                  actorUserId: String(raw.actorUserId || ''),
                  actorName: String(raw.actorName || ''),
                  actorRole:
                    (raw.actorRole as typeof currentUser.role) || currentUser.role,
                  category: raw.category === 'security' ? 'security' : 'operational',
                  action: String(raw.action || ''),
                  targetType: String(raw.targetType || ''),
                  targetId: String(raw.targetId || ''),
                  beforeSummary: String(raw.beforeSummary || ''),
                  afterSummary: String(raw.afterSummary || ''),
                  reason: String(raw.reason || ''),
                  result:
                    raw.result === 'denied' || raw.result === 'failure'
                      ? raw.result
                      : 'success',
                  timestamp: formatFirestoreTimestamp(raw.timestamp),
                };
              })
            );
          },
          () => {}
        )
      );
    }

    return () => {
      isUnmounted = true;
      unsubs.forEach((fn) => fn());
    };
  }, [currentUser.uid, currentUser.role, currentUser.teamId, currentUser.employeeId]);

  const daysInMonth = useMemo(() => {
    return getDaysInMonth(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const monthDaysList = useMemo<MonthDay[]>(() => {
    const days: MonthDay[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(
        2,
        '0'
      )}-${String(i).padStart(2, '0')}`;
      const dateObj = new Date(currentYear, currentMonth - 1, i);
      const dayName = dateObj.toLocaleDateString('ar-EG', { weekday: 'short' });
      days.push({ dayNumber: i, dateStr, dayName });
    }
    return days;
  }, [currentYear, currentMonth, daysInMonth]);

  const isCurrentMonthView =
    today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth;

  // صلاحيات الأزرار الإجرائية في الجدول
  const canCreateEmp = hasPermission(currentUser, 'employees.create', securityPolicy);
  const canEditEmp =
    hasPermission(currentUser, 'employees.edit', securityPolicy) ||
    currentUser.role === 'supervisor';
  const canDeleteEmp = hasPermission(currentUser, 'employees.delete', securityPolicy);
  const canExportReport = hasPermission(currentUser, 'reports.export', securityPolicy);
  const canEditShiftSelection = hasPermission(currentUser, 'shifts.edit', securityPolicy);
  const canDeleteAttendance =
    currentUser.role === 'super_admin' || currentUser.role === 'operations_manager';

  const handleMigrateLegacyLocalToCloud = async () => {
    if (legacyLocalEmployees.length === 0) return;
    setIsMigratingLocal(true);
    try {
      const res = await migrateLocalDataToFirestore({
        actor: currentUser,
        employees: legacyLocalEmployees,
        attendanceRecords: legacyLocalAttendance,
        sourceLabel: 'ترحيل البيانات المحلية المحفوظة إلى Cloud Firestore',
      });
      safeSaveToStorage('shift_tracker_cloud_migrated_v1', true);
      setLegacyMigratedDone(true);
      showToast(
        `تم ترحيل ${res.importedEmployees} مندوب و ${res.importedAttendance} سجل شفت إلى السحابة بنجاح.`
      );
    } catch {
      showToast('تعذر ترحيل البيانات المحلية إلى السحابة.', 'error');
    } finally {
      setIsMigratingLocal(false);
    }
  };

  const generateInitial100Delegates = async () => {
    if (!canCreateEmp) return;
    setIsMigratingLocal(true);
    try {
      const firstNames = [
        'أحمد',
        'محمد',
        'محمود',
        'علي',
        'عمر',
        'خالد',
        'إبراهيم',
        'حسن',
        'يوسف',
        'طارق',
        'مصطفى',
        'ياسر',
        'كريم',
        'هشام',
        'سامح',
      ];
      const lastNames = [
        'السيد',
        'عبدالله',
        'الشريف',
        'إسماعيل',
        'النجار',
        'منصور',
        'راضي',
        'فاروق',
        'عثمان',
        'سالم',
        'الجمال',
        'حمدي',
        'غانم',
      ];

      const newEmps: Employee[] = [];
      const newAttendance: Record<string, AttendanceRecord> = {};

      const maxElapsedSeedDay = isCurrentMonthView
        ? Math.min(today.getDate(), daysInMonth)
        : Math.min(12, daysInMonth);

      for (let i = 1; i <= 100; i++) {
        const empCode = `EMP${String(i).padStart(3, '0')}`;
        const fn = firstNames[i % firstNames.length];
        const ln = lastNames[(i * 3) % lastNames.length];
        newEmps.push({
          id: empCode,
          employeeCode: empCode,
          fullName: `${fn} ${ln}`,
          phone: `010${String(10000000 + ((i * 7919) % 89999999)).padStart(8, '0')}`,
          hireDate: '2025-01-01',
          status: i % 18 === 0 ? 'suspended' : 'active',
          externalId: `EXT_${1000 + i}`,
          teamId: teams[0]?.teamId || '',
          userId: '',
          notes: 'قوة أساسية معتمدة',
        });

        for (let d = 1; d <= Math.min(daysInMonth, maxElapsedSeedDay + 2); d++) {
          const dateStr = `${currentYear}-${String(currentMonth).padStart(
            2,
            '0'
          )}-${String(d).padStart(2, '0')}`;
          const key = `${empCode}_${dateStr}`;
          const { isFutureDay, isToday } = getDayTemporalState(
            currentYear,
            currentMonth,
            d,
            today
          );

          let shift: ShiftSelectionStatus = 'selected';
          let att: AttendanceStatus = 'worked';
          const start = '09:00';
          const end = '17:00';
          const brk = 30;

          if (isFutureDay) {
            shift = i % 3 === 0 ? 'undecided' : 'selected';
            att = 'pending';
          } else if (isToday) {
            shift = i % 5 === 0 ? 'not_selected' : 'selected';
            att =
              shift === 'selected' ? (i % 3 === 0 ? 'pending' : 'worked') : 'pending';
          } else {
            if (d === 3 && i % 4 === 0) att = 'absent';
            else if (d === 5 && i % 5 === 0) {
              shift = 'exempt';
              att = 'leave';
            } else if (d === 7 && i % 6 === 0) {
              shift = 'exempt';
              att = 'day_off';
            }
          }

          const totalMins =
            att === 'worked' ? calculateShiftMinutes(start, end, brk) : 0;
          newAttendance[key] = {
            id: key,
            employeeId: empCode,
            teamId: teams[0]?.teamId || '',
            date: dateStr,
            shiftSelection: shift,
            attendance: att,
            startTime: start,
            endTime: end,
            breakMinutes: brk,
            totalWorkedMinutes: totalMins,
            source: 'manual',
            updatedAt: new Date().toISOString(),
          };
        }
      }

      await migrateLocalDataToFirestore({
        actor: currentUser,
        employees: newEmps,
        attendanceRecords: newAttendance,
        sourceLabel: 'تهيئة 100 مندوب تجريبي في قاعدة بيانات السحابة',
      });
      showToast('تمت تهيئة وحفظ 100 مندوب مع سجلات الشفتات في Cloud Firestore.');
    } catch {
      showToast('تعذر تهيئة البيانات التجريبية.', 'error');
    } finally {
      setIsMigratingLocal(false);
    }
  };

  const summaries = useMemo<Record<string, EmployeeSummary>>(() => {
    const map: Record<string, EmployeeSummary> = {};
    employees.forEach((emp) => {
      map[emp.id] = computeEmployeeSummary(
        emp,
        monthDaysList,
        attendanceRecords,
        currentYear,
        currentMonth,
        today
      );
    });
    return map;
  }, [employees, monthDaysList, attendanceRecords, currentYear, currentMonth, today]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees
      .filter((emp) => {
        const matchQuery =
          !q ||
          emp.fullName.toLowerCase().includes(q) ||
          emp.employeeCode.toLowerCase().includes(q) ||
          emp.phone.includes(q);
        if (!matchQuery) return false;

        const summary = summaries[emp.id];
        if (!summary) return true;

        if (
          filterSelection === 'selected_not_worked' &&
          summary.selectedNotWorkedDays === 0
        ) {
          return false;
        }
        if (
          filterSelection === 'not_selected' &&
          summary.selectedDays >=
            daysInMonth - (summary.leaveDays + summary.dayOffDays)
        ) {
          return false;
        }
        if (filterAttendance === 'worked_only' && summary.workedDays === 0) {
          return false;
        }
        if (filterAttendance === 'absent_only' && summary.absentDays === 0) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.fullName.localeCompare(b.fullName, 'ar');
        if (sortBy === 'workedDays') {
          return (summaries[b.id]?.workedDays ?? 0) - (summaries[a.id]?.workedDays ?? 0);
        }
        if (sortBy === 'hours') {
          return (summaries[b.id]?.totalHours ?? 0) - (summaries[a.id]?.totalHours ?? 0);
        }
        if (sortBy === 'performance') {
          const pA = summaries[a.id]?.performanceRate ?? -1;
          const pB = summaries[b.id]?.performanceRate ?? -1;
          return pB - pA;
        }
        return a.employeeCode.localeCompare(b.employeeCode, undefined, {
          numeric: true,
        });
      });
  }, [
    employees,
    searchQuery,
    filterSelection,
    filterAttendance,
    sortBy,
    summaries,
    daysInMonth,
  ]);

  const topStats = useMemo(() => {
    const totalHeadcount = employees.length;
    const activeCount = employees.filter((e) => e.status === 'active').length;

    const targetRefDateStr = isCurrentMonthView
      ? todayStr
      : `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;

    let workedRefDay = 0;
    let selectedRefDay = 0;
    let notSelectedRefDay = 0;
    let totalMonthlyHours = 0;

    employees.forEach((emp) => {
      const refKey = `${emp.id}_${targetRefDateStr}`;
      const refRec = attendanceRecords[refKey];
      if (refRec?.attendance === 'worked') workedRefDay++;
      if (refRec?.shiftSelection === 'selected') selectedRefDay++;
      else if (refRec?.shiftSelection !== 'exempt') notSelectedRefDay++;

      const summary = summaries[emp.id];
      if (summary) totalMonthlyHours += summary.totalHours;
    });

    return {
      totalHeadcount,
      activeCount,
      workedToday: workedRefDay,
      selectedToday: selectedRefDay,
      notSelectedToday: notSelectedRefDay,
      totalMonthlyHours: Number(totalMonthlyHours.toFixed(1)),
      refLabel: isCurrentMonthView ? 'اليوم' : `1 ${MONTH_NAMES[currentMonth - 1]}`,
    };
  }, [
    employees,
    attendanceRecords,
    todayStr,
    summaries,
    isCurrentMonthView,
    currentYear,
    currentMonth,
  ]);

  const getCellPresentation = (empId: string, dateStr: string, dayNumber: number) => {
    const key = `${empId}_${dateStr}`;
    const record = attendanceRecords[key];
    const { isPastDay, isFutureDay } = getDayTemporalState(
      currentYear,
      currentMonth,
      dayNumber,
      today
    );

    if (isFutureDay) {
      if (record?.attendance === 'leave') {
        return {
          bg: 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200',
          symbol: 'إج',
          title: 'إجازة مجدولة',
        };
      }
      if (record?.attendance === 'day_off') {
        return {
          bg: 'bg-stone-200 dark:bg-slate-800 hover:bg-stone-300 dark:hover:bg-slate-700 border-stone-300 dark:border-slate-700 text-stone-800 dark:text-slate-200',
          symbol: 'را',
          title: 'راحة مجدولة',
        };
      }
      if (record?.shiftSelection === 'selected') {
        return {
          bg: 'bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 font-bold',
          symbol: 'مجدول',
          title: 'شفت محدد مسبقاً',
        };
      }
      return {
        bg: 'bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800/80 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600',
        symbol: '—',
        title: 'يوم مستقبلي',
      };
    }

    if (record?.attendance === 'leave') {
      return {
        bg: 'bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 border-slate-400 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-bold',
        symbol: 'إج',
        title: 'إجازة معتمدة',
      };
    }
    if (record?.attendance === 'day_off') {
      return {
        bg: 'bg-stone-200 dark:bg-slate-700/80 hover:bg-stone-300 dark:hover:bg-slate-600 border-stone-300 dark:border-slate-600 text-stone-800 dark:text-slate-200 font-bold',
        symbol: 'را',
        title: 'يوم راحة',
      };
    }
    if (record?.attendance === 'worked') {
      return {
        bg: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-700 dark:border-emerald-500 text-white font-bold',
        symbol: '✓',
        title: `حاضر (${Number(((record.totalWorkedMinutes || 0) / 60).toFixed(1))} س)`,
      };
    }

    if (
      record?.attendance === 'absent' ||
      (isPastDay &&
        record?.shiftSelection === 'selected' &&
        (!record?.attendance || record.attendance === 'pending'))
    ) {
      return {
        bg: 'bg-rose-600 hover:bg-rose-500 border-rose-700 dark:border-rose-500 text-white font-bold',
        symbol: '✕',
        title: 'غياب',
      };
    }

    if (
      record?.shiftSelection === 'selected' &&
      (!record?.attendance || record.attendance === 'pending')
    ) {
      return {
        bg: 'bg-sky-600 hover:bg-sky-500 border-sky-700 dark:border-sky-500 text-white font-bold',
        symbol: 'انتظار',
        title: 'اختار الشفت وبانتظار الاعتماد',
      };
    }

    return {
      bg: 'bg-amber-300 dark:bg-amber-500/90 hover:bg-amber-400 dark:hover:bg-amber-400 border-amber-400 dark:border-amber-500 text-amber-950 font-bold',
      symbol: '؟',
      title: 'لم يحدد الشفت',
    };
  };

  const handleSaveCell = async (formData: {
    employeeId: string;
    date: string;
    shiftSelection: ShiftSelectionStatus;
    attendance: AttendanceStatus;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    supervisorNotes: string;
  }) => {
    const targetEmp = employees.find((e) => e.id === formData.employeeId);
    if (!targetEmp) return;

    const key = `${formData.employeeId}_${formData.date}`;
    const existingRec = attendanceRecords[key];

    if (
      !canRecordOrEditAttendance(
        currentUser,
        targetEmp,
        existingRec,
        securityPolicy
      )
    ) {
      showToast('ليس لديك صلاحية تعديل هذا السجل.', 'error');
      return;
    }

    const totalWorkedMinutes =
      formData.attendance === 'worked'
        ? calculateShiftMinutes(
            formData.startTime,
            formData.endTime,
            formData.breakMinutes
          )
        : 0;

    try {
      await saveAttendanceFirestore({
        actor: currentUser,
        employee: targetEmp,
        previousRecord: existingRec,
        record: {
          id: `${formData.employeeId}_${formData.date}`,
          employeeId: formData.employeeId,
          teamId: targetEmp.teamId || '',
          date: formData.date,
          shiftSelection: formData.shiftSelection,
          attendance: formData.attendance,
          startTime: formData.startTime,
          endTime: formData.endTime,
          breakMinutes: formData.breakMinutes,
          totalWorkedMinutes,
          supervisorNotes: formData.supervisorNotes,
          source: 'manual',
          updatedAt: new Date().toISOString(),
        },
      });
      setEditingCell(null);
      showToast('تم حفظ سجل اليوم وتوثيقه في قاعدة البيانات السحابية.');
    } catch {
      showToast('تم رفض تعديل السجل وفق سياسة الصلاحيات.', 'error');
    }
  };

  const handleDeleteCellRecord = async (empId: string, date: string) => {
    if (!canDeleteAttendance) return;
    try {
      await deleteAttendanceFirestore({
        actor: currentUser,
        employeeId: empId,
        date,
      });
      setEditingCell(null);
      showToast('تم مسح سجل اليوم وتوثيق العملية.', 'info');
    } catch {
      showToast('تعذر مسح السجل.', 'error');
    }
  };

  const handleSaveEmployee = async (emp: Employee, isEdit: boolean) => {
    try {
      await saveEmployeeFirestore({
        actor: currentUser,
        employee: emp,
        isEdit,
      });
      setEmployeeModalState({ open: false, editingEmployee: null });
      showToast(
        isEdit
          ? `تم تحديث بيانات المندوب "${emp.fullName}".`
          : `تمت إضافة المندوب "${emp.fullName}" بنجاح.`
      );
    } catch {
      showToast('تعذر حفظ بيانات المندوب.', 'error');
    }
  };

  const handleDeleteEmployee = async (empId: string) => {
    if (!canDeleteEmp) return;
    const target = employees.find((e) => e.id === empId);
    if (!target) return;
    try {
      await deleteEmployeeFirestore({
        actor: currentUser,
        employee: target,
      });
      setEmployeeModalState({ open: false, editingEmployee: null });
      showToast(`تم حذف المندوب "${target.fullName}" وتوثيق العملية أمنياً.`, 'info');
    } catch {
      showToast('تعذر حذف سجل المندوب.', 'error');
    }
  };

  const handleToggleEmployeeStatus = async (empId: string) => {
    if (!hasPermission(currentUser, 'employees.edit', securityPolicy)) return;
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const nextStatus = emp.status === 'active' ? 'suspended' : 'active';
    try {
      await saveEmployeeFirestore({
        actor: currentUser,
        employee: { ...emp, status: nextStatus },
        isEdit: true,
      });
      showToast(
        `تم تغيير حالة "${emp.fullName}" إلى ${
          nextStatus === 'active' ? 'نشط' : 'موقوف'
        }.`
      );
    } catch {
      showToast('ليس لديك صلاحية تغيير حالة المندوب.', 'error');
    }
  };

  const handleExportCSV = async () => {
    if (!canExportReport) {
      showToast('ليس لديك صلاحية تصدير التقارير.', 'error');
      return;
    }
    let csvContent = '\uFEFF';
    const headers = ['رقم المندوب', 'اسم المندوب', 'الهاتف', 'الفريق', 'الحالة'];
    monthDaysList.forEach((d) => headers.push(`يوم ${d.dayNumber}`));
    headers.push(
      'أيام العمل',
      'أيام الغياب',
      'أيام الإجازة والراحة',
      'أيام اختيار الشفت',
      'ساعات العمل',
      'متوسط الساعات',
      'نسبة الالتزام',
      'نسبة الأداء'
    );
    csvContent += headers.map(escapeCsvCell).join(',') + '\r\n';

    filteredEmployees.forEach((emp) => {
      const sum = summaries[emp.id];
      const teamObj = teams.find((t) => t.teamId === emp.teamId);
      const row: (string | number)[] = [
        emp.employeeCode,
        emp.fullName,
        emp.phone || '—',
        teamObj ? teamObj.teamName : emp.teamId || '—',
        emp.status === 'active' ? 'نشط' : 'موقوف',
      ];

      monthDaysList.forEach((d) => {
        const visual = getCellPresentation(emp.id, d.dateStr, d.dayNumber);
        row.push(visual.title);
      });

      row.push(
        sum?.workedDays ?? 0,
        sum?.absentDays ?? 0,
        (sum?.leaveDays ?? 0) + (sum?.dayOffDays ?? 0),
        sum?.selectedDays ?? 0,
        sum?.totalHours ?? 0,
        sum?.avgHours ?? 0,
        sum?.commitmentRate !== null && sum?.commitmentRate !== undefined
          ? `${sum.commitmentRate}%`
          : 'غير متاح',
        sum?.performanceRate !== null && sum?.performanceRate !== undefined
          ? `${sum.performanceRate}%`
          : 'غير متاح'
      );

      csvContent += row.map(escapeCsvCell).join(',') + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `تقرير_الشفتات_${MONTH_NAMES[currentMonth - 1]}_${currentYear}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    await recordAuditLog({
      actor: currentUser,
      category: 'operational',
      action: 'تصدير تقرير الشفتات الشهري (CSV)',
      targetType: 'report',
      targetId: `${currentYear}_${currentMonth}`,
      afterSummary: `عدد المندوبين المصدرين: ${filteredEmployees.length}`,
    });

    showToast('تم تصدير تقرير Excel / CSV وتوثيقه بنجاح.');
  };

  const pendingRequestsCount = useMemo(
    () =>
      requests.filter(
        (r) => r.status === 'pending' || r.status === 'recommended'
      ).length,
    [requests]
  );

  const isSuperAdminInSecurityHub =
    currentUser.role === 'super_admin' &&
    (activeRoute === 'security_center' ||
      activeRoute === 'users' ||
      activeRoute === 'teams' ||
      activeRoute === 'audit_logs' ||
      activeRoute === 'security_settings');

  const isRouteAuthorized = canAccessRoute(currentUser, activeRoute, securityPolicy);

  const hasOpenModal =
    isSectionsDrawerOpen ||
    Boolean(editingCell) ||
    employeeModalState.open ||
    isSyncModalOpen;

  const backTargetHint = useMemo(
    () =>
      getBackTargetHintAr({
        stack: navHistory,
        current: currentNavSnapshot,
        defaultRoute,
        isSuperAdmin: currentUser.role === 'super_admin',
      }),
    [navHistory, currentNavSnapshot, defaultRoute, currentUser.role]
  );

  const currentPageLabel = useMemo(
    () =>
      getSnapshotLabelAr(
        currentNavSnapshot,
        currentUser.role === 'super_admin'
      ),
    [currentNavSnapshot, currentUser.role]
  );

  const isAtRootHome =
    activeRoute === defaultRoute &&
    activeViewTab === 'grid' &&
    activeCasePage === null &&
    !(isSuperAdminInSecurityHub && securityHubTab !== 'overview');

  const handleGlobalBack = useCallback(() => {
    // 1. إغلاق القائمة الجانبية أو أي نافذة منبثقة مفتوحة أولاً
    if (isSectionsDrawerOpen) {
      setIsSectionsDrawerOpen(false);
      return;
    }
    if (editingCell) {
      setEditingCell(null);
      return;
    }
    if (employeeModalState.open) {
      setEmployeeModalState({ open: false, editingEmployee: null });
      return;
    }
    if (isSyncModalOpen) {
      setIsSyncModalOpen(false);
      return;
    }

    // 2. الرجوع خطوة للخلف عبر سجل الصفحات والتبويبات أو الصفحة الأب
    const resolution = resolveBackStep({
      stack: navHistory,
      current: currentNavSnapshot,
      defaultRoute,
      isSuperAdmin: currentUser.role === 'super_admin',
    });

    if (resolution.nextSnapshot) {
      setNavHistory(resolution.nextStack);
      setActiveRoute(resolution.nextSnapshot.route);
      setActiveViewTab(resolution.nextSnapshot.viewTab);
      setActiveCasePage(resolution.nextSnapshot.casePage);
      setSecurityHubTab(resolution.nextSnapshot.securityTab);
      setProfileSection(resolution.nextSnapshot.profileSection ?? 'all');
      if (typeof window !== 'undefined') {
        window.history.replaceState(
          { shiftTrackerNav: resolution.nextSnapshot },
          '',
          `#${resolution.nextSnapshot.route}`
        );
      }
      return;
    }

    // 3. عند التواجد في الصفحة الرئيسية مع وجود فلاتر أو شهر مختلف، نرجع للعرض الافتراضي
    const hasActiveFilters =
      Boolean(searchQuery) ||
      filterSelection !== 'all' ||
      filterAttendance !== 'all';

    if (hasActiveFilters) {
      setSearchQuery('');
      setFilterSelection('all');
      setFilterAttendance('all');
      showToast('تم الرجوع للخلف وإلغاء الفلاتر النشطة.', 'info');
      return;
    }

    if (!isCurrentMonthView) {
      setCurrentYear(today.getFullYear());
      setCurrentMonth(today.getMonth() + 1);
      showToast('تم الرجوع إلى عرض الشهر الحالي.', 'info');
      return;
    }

    showToast('أنت حالياً في الصفحة الرئيسية الأساسية للنظام.', 'info');
  }, [
    isSectionsDrawerOpen,
    editingCell,
    employeeModalState.open,
    isSyncModalOpen,
    navHistory,
    currentNavSnapshot,
    defaultRoute,
    currentUser.role,
    searchQuery,
    filterSelection,
    filterAttendance,
    isCurrentMonthView,
    today,
    showToast,
  ]);

  const handleDrawerQuickAction = (actionId: DrawerQuickActionId) => {
    switch (actionId) {
      case 'open_add_employee':
        setEmployeeModalState({ open: true, editingEmployee: null });
        break;
      case 'open_sync_modal':
        setIsSyncModalOpen(true);
        break;
      case 'export_csv':
        void handleExportCSV();
        break;
      case 'print_page':
        window.print();
        break;
      case 'toggle_theme':
        setIsDarkMode((prev) => !prev);
        break;
      case 'logout':
        void logout();
        break;
    }
  };

  // اختصارات لوحة المفاتيح: Alt + السهم الأيمن للرجوع، و Alt + M لفتح/إغلاق القائمة الجانبية لجميع الأقسام
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'm' || e.key === 'M' || e.key === 'ة')) {
        e.preventDefault();
        setIsSectionsDrawerOpen((prev) => !prev);
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        handleGlobalBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleGlobalBack]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      {/* إشعارات فورية */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 no-print">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`px-4 py-2.5 rounded-lg shadow-lg border text-xs font-bold transition-all ${
                t.type === 'error'
                  ? 'bg-rose-900 text-white border-rose-800'
                  : t.type === 'warning'
                  ? 'bg-amber-900 text-white border-amber-800'
                  : t.type === 'info'
                  ? 'bg-slate-900 dark:bg-slate-800 text-white border-slate-700'
                  : 'bg-emerald-900 text-white border-emerald-800'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* الهيدر العلوي المبسط مع زر القائمة الجانبية الشاملة وزر الرجوع للخلف */}
      <header className="sticky top-0 z-30 bg-slate-900 dark:bg-slate-950 text-white border-b border-slate-800 px-4 sm:px-6 py-3 no-print">
        <div className="max-w-[1900px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* المنطقة 1: زر القائمة الجانبية لجميع الأقسام + زر الرجوع للخلف + عنوان النظام */}
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setIsSectionsDrawerOpen(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="فتح القائمة الجانبية المنظمة لجميع أقسام النظام (Alt + M)"
            >
              <Menu className="w-4 h-4 shrink-0" />
              <span>جميع الأقسام</span>
              {pendingRequestsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-mono tabular-nums text-[10px] font-extrabold">
                  {pendingRequestsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleGlobalBack}
              className="min-h-[40px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title={
                hasOpenModal
                  ? 'رجوع وإغلاق النافذة المفتوحة'
                  : backTargetHint
                  ? `رجوع للخلف إلى: ${backTargetHint}`
                  : 'رجوع للخلف (Alt + السهم الأيمن)'
              }
            >
              <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>رجوع للخلف</span>
              {navHistory.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 font-mono tabular-nums text-[10px]">
                  {navHistory.length}
                </span>
              )}
            </button>

            <div className="flex items-center gap-2 min-w-0 pl-1">
              <a
                href={`#${defaultRoute}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigateToRoute(defaultRoute);
                }}
                className="text-base sm:text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2"
              >
                <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
                <span>نظام متابعة الشفتات</span>
              </a>

              <span
                aria-hidden="true"
                className="hidden lg:inline text-slate-700"
              >
                /
              </span>
              <span className="hidden lg:inline text-xs font-bold text-slate-300 truncate max-w-[320px]">
                {!isRouteAuthorized
                  ? 'صفحة محجوبة الصلاحية (403)'
                  : currentPageLabel}
              </span>
            </div>
          </div>

          {/* المنطقة 2: الإجراء السياقي وهوية المستخدم */}
          <div className="flex items-center gap-2 shrink-0">
            {canCreateEmp &&
              (activeRoute === 'dashboard' || activeRoute === 'monthly_grid') &&
              !activeCasePage && (
                <button
                  type="button"
                  onClick={() =>
                    setEmployeeModalState({ open: true, editingEmployee: null })
                  }
                  className="min-h-[40px] px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>إضافة مندوب</span>
                </button>
              )}

            <button
              type="button"
              onClick={() => navigateToRoute('profile')}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-right transition-colors flex items-center gap-2 cursor-pointer"
              title="الملف الشخصي وإجراءات أمان الحساب"
            >
              <div>
                <div className="text-xs font-bold text-white leading-tight whitespace-nowrap">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-indigo-300 font-medium leading-tight whitespace-nowrap">
                  {ROLE_SHORT_LABELS_AR[currentUser.role]}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={logout}
              className="min-h-[40px] min-w-[40px] p-2 rounded-lg border border-slate-700 hover:bg-rose-900/60 hover:border-rose-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="تسجيل الخروج الآمن"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* شريط المسار الحالي والرجوع للخلف + الوصول السريع للقائمة الجانبية */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2.5 no-print transition-colors duration-150">
        <div className="max-w-[1900px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGlobalBack}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg font-extrabold flex items-center gap-2 transition-colors cursor-pointer ${
                backTargetHint || hasOpenModal
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700'
              }`}
            >
              <ArrowRight className="w-4 h-4 shrink-0" />
              <span>رجوع للخلف</span>
            </button>

            <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="text-slate-400 dark:text-slate-500">القسم الحالي:</span>
              <strong className="font-extrabold text-slate-900 dark:text-white">
                {!isRouteAuthorized ? 'صفحة محجوبة الصلاحية (403)' : currentPageLabel}
              </strong>
              {backTargetHint && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                    ·
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    الخطوة السابقة:{' '}
                    <span className="font-bold text-indigo-700 dark:text-indigo-300">
                      {backTargetHint}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isAtRootHome && (
              <button
                type="button"
                onClick={() => navigateToRoute(defaultRoute)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Home className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>الصفحة الرئيسية</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsSectionsDrawerOpen(true)}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Menu className="w-3.5 h-3.5" />
              <span>قائمة الأقسام</span>
            </button>
          </div>
        </div>
      </div>

      {/* شريط حالة الطوارئ الأمني (تجميد التعديلات أو قفل النظام) */}
      {(securityPolicy.systemLockdownMode || securityPolicy.emergencyReadOnlyMode) && (
        <div
          className={`px-6 py-2.5 text-xs border-b no-print ${
            securityPolicy.systemLockdownMode
              ? 'bg-rose-950 text-rose-100 border-rose-800'
              : 'bg-amber-950 text-amber-100 border-amber-800'
          }`}
        >
          <div className="max-w-[1900px] mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                {securityPolicy.systemLockdownMode
                  ? 'وضع قفل النظام الشامل (System Lockdown) نشط حالياً — جميع المستخدمين غير Super Admin محجوبون مؤقتاً.'
                  : 'وضع تجميد التعديلات (Read-Only Freeze) نشط بأمر مدير النظام — التعديلات متوقفة مؤقتاً لغير مدير النظام.'}
              </span>
            </div>
            {currentUser.role === 'super_admin' && (
              <div className="flex items-center gap-2">
                {!isSuperAdminInSecurityHub && (
                  <button
                    type="button"
                    onClick={() => navigateToRoute('security_center')}
                    className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-bold"
                  >
                    فتح مركز التحكم الأمني
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    await saveSecurityPolicySettings({
                      actor: currentUser,
                      settings: {
                        ...securityPolicy,
                        emergencyReadOnlyMode: false,
                        systemLockdownMode: false,
                      },
                      auditActionLabel: 'إيقاف وضع الطوارئ الأمني من الشريط العلوي',
                    });
                    showToast('تم إيقاف وضع الطوارئ واستئناف التشغيل الطبيعي.');
                  }}
                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  إيقاف وضع الطوارئ فوراً
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* شريط تنبيه أمني للحسابات الإدارية حول التحقق بخطوتين (MFA) إن كان مفعلاً */}
      {securityPolicy.enforceAdminMfaNotice &&
        !mfaNoticeDismissed &&
        (currentUser.role === 'super_admin' ||
          currentUser.role === 'operations_manager') && (
          <div className="bg-indigo-950 text-indigo-100 px-6 py-2 text-xs border-b border-indigo-900 no-print">
            <div className="max-w-[1900px] mx-auto flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>
                  سياسة حماية الحسابات الإدارية نشطة: يُوصى بتفعيل التحقق بخطوتين (2FA) على حسابك البريدي المؤسسي. مهلة عدم النشاط الحالية:{' '}
                  <strong className="font-mono">{securityPolicy.sessionTimeoutMinutes}</strong> دقيقة.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMfaNoticeDismissed(true)}
                className="text-[11px] text-indigo-300 hover:text-white font-bold"
              >
                إخفاء التنبيه
              </button>
            </div>
          </div>
        )}

      {/* شريط ترحيل غير مدمّر للبيانات المحلية السابقة في المتصفح إلى السحابة */}
      {isInitialCloudLoaded &&
        employees.length === 0 &&
        legacyLocalEmployees.length > 0 &&
        !legacyMigratedDone &&
        canCreateEmp && (
          <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-900 px-6 py-3 text-xs no-print">
            <div className="max-w-[1900px] mx-auto flex flex-wrap items-center justify-between gap-3">
              <div className="text-amber-950 dark:text-amber-200 font-medium">
                <strong>حفظ البيانات السابقة:</strong> تم العثور على{' '}
                <strong className="font-mono">{legacyLocalEmployees.length}</strong> مندوب محفوظين محلياً في متصفحك قبل تفعيل نظام الحماية السحابي. يمكنك ترحيلهم الآن بأمان دون فقد أي سجل.
              </div>
              <button
                type="button"
                disabled={isMigratingLocal}
                onClick={handleMigrateLegacyLocalToCloud}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <CloudUpload className="w-4 h-4" />
                {isMigratingLocal
                  ? 'جارٍ ترحيل السجلات للسحابة...'
                  : 'ترحيل البيانات الحالية إلى Cloud Firestore'}
              </button>
            </div>
          </div>
        )}

      {/* حارس المسارات: منع الوصول عند إدخال رابط غير مصرح به يدوياً */}
      {!isRouteAuthorized ? (
        <AccessDeniedView
          user={currentUser}
          attemptedRoute={activeRoute}
          onGoBack={handleGlobalBack}
          onReturnHome={() => navigateToRoute(defaultRoute)}
        />
      ) : isSuperAdminInSecurityHub ? (
        <SuperAdminSecurityHub
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          users={allUsers}
          invitations={invitations}
          teams={teams}
          employees={employees}
          attendanceRecords={attendanceRecords}
          auditLogs={auditLogs}
          initialTab={securityHubTab}
          activeTabProp={securityHubTab}
          onTabChange={(nextTab) =>
            applyNavigation({
              route: 'security_center',
              securityTab: nextTab,
            })
          }
          onSendPasswordReset={requestPasswordReset}
          onNotify={showToast}
        />
      ) : activeRoute === 'users' ? (
        <UserManagementPage
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          users={allUsers}
          invitations={invitations}
          employees={employees}
          teams={teams}
          onSendPasswordReset={requestPasswordReset}
          onNotify={showToast}
        />
      ) : activeRoute === 'teams' ? (
        <TeamsManagementPage
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          teams={teams}
          users={allUsers}
          employees={employees}
          attendanceRecords={attendanceRecords}
          onNotify={showToast}
        />
      ) : activeRoute === 'requests' ? (
        <RequestsPage
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          requests={requests}
          employees={employees}
          todayStr={todayStr}
          onNotify={showToast}
        />
      ) : activeRoute === 'audit_logs' ? (
        <AuditLogsPage
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          logs={auditLogs}
          onNotify={showToast}
        />
      ) : activeRoute === 'security_settings' ? (
        <SecuritySettingsPage
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          users={allUsers}
          onNotify={showToast}
        />
      ) : activeRoute === 'my_portal' || activeRoute === 'profile' ? (
        <ProfileAndRepPortalPage
          mode={activeRoute}
          activeProfileSection={profileSection}
          onSelectProfileSection={(sec) =>
            applyNavigation({ route: 'profile', profileSection: sec })
          }
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          linkedProviderIds={linkedProviderIds}
          isEmailVerified={isEmailVerified}
          lastIdentityVerifiedAt={lastIdentityVerifiedAt}
          accountAuditLogs={
            currentUser.role === 'super_admin' ? auditLogs : myAccountAuditLogs
          }
          employees={employees}
          teams={teams}
          attendanceRecords={attendanceRecords}
          summaries={summaries}
          requests={requests}
          monthDaysList={monthDaysList}
          currentMonth={currentMonth}
          currentYear={currentYear}
          today={today}
          onChangeMonth={(y, m) => {
            setCurrentYear(y);
            setCurrentMonth(m);
          }}
          onNavigateToRequests={() => navigateToRoute('requests')}
          onNavigateToProfile={(sec) => navigateToRoute('profile', sec)}
          onNavigateToMyPortal={() => navigateToRoute('my_portal')}
          onOpenSectionsDrawer={() => setIsSectionsDrawerOpen(true)}
          onUpdatePersonalInfo={updatePersonalProfileInfo}
          onChangeOrSetPassword={changeOrSetManualPassword}
          onUpdateSecuritySettings={updateAccountSecuritySettings}
          onReauthenticateManually={reauthenticateAccountManually}
          onRefreshSessionToken={refreshSecuritySessionToken}
          onSendVerificationEmail={sendVerificationEmailManually}
          onSendPasswordReset={requestPasswordReset}
          onLogout={logout}
          onNotify={showToast}
        />
      ) : activeRoute === 'analytics' ? (
        <AnalyticsPage
          employees={employees}
          summaries={summaries}
          currentMonth={currentMonth}
          currentYear={currentYear}
          onChangeMonth={(y, m) => {
            setCurrentYear(y);
            setCurrentMonth(m);
          }}
          onOpenMonthlyGrid={() =>
            applyNavigation({ route: 'monthly_grid', viewTab: 'grid', casePage: null })
          }
          onOpenShiftCase={(caseType) =>
            applyNavigation({ route: 'dashboard', viewTab: 'grid', casePage: caseType })
          }
          onInspectEmployee={(emp) => {
            setSearchQuery(emp.employeeCode);
            applyNavigation({ route: 'monthly_grid', viewTab: 'grid', casePage: null });
          }}
          onEditEmployee={(emp) => {
            if (canEditEmp) {
              setEmployeeModalState({ open: true, editingEmployee: emp });
            }
          }}
          canEditEmp={canEditEmp}
        />
      ) : activeCasePage ? (
        <ShiftCaseDetailPage
          pageType={activeCasePage}
          employees={employees}
          summaries={summaries}
          attendanceRecords={attendanceRecords}
          monthDaysList={monthDaysList}
          currentMonth={currentMonth}
          currentYear={currentYear}
          today={today}
          onBackToGrid={() =>
            applyNavigation({ route: 'monthly_grid', viewTab: 'grid', casePage: null })
          }
          onSwitchPage={(page) => applyNavigation({ casePage: page })}
          onEditCell={(emp, dateStr, rec) => {
            if (canRecordOrEditAttendance(currentUser, emp, rec, securityPolicy)) {
              setEditingCell({ employee: emp, date: dateStr, record: rec });
            } else {
              showToast('وضع القراءة فقط — ليس لديك صلاحية تعديل هذا السجل.', 'info');
            }
          }}
          onEditEmployee={(emp) => {
            if (canEditEmp) {
              setEmployeeModalState({ open: true, editingEmployee: emp });
            }
          }}
        />
      ) : activeRoute === 'dashboard' ? (
        <ExecutiveOverviewDashboard
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          employees={employees}
          attendanceRecords={attendanceRecords}
          summaries={summaries}
          teams={teams}
          requests={requests}
          users={allUsers}
          monthDaysList={monthDaysList}
          currentMonth={currentMonth}
          currentYear={currentYear}
          today={today}
          todayStr={todayStr}
          canCreateEmp={canCreateEmp}
          isMigratingLocal={isMigratingLocal}
          onChangeMonth={(y, m) => {
            setCurrentYear(y);
            setCurrentMonth(m);
          }}
          onNavigateSnapshot={(next) => {
            applyNavigation({
              route: next.route,
              viewTab: next.viewTab ?? 'grid',
              casePage: next.casePage !== undefined ? next.casePage : null,
              securityTab: next.securityTab ?? securityHubTab,
              profileSection: next.profileSection ?? 'all',
            });
          }}
          onOpenMonthlyGridWithFilter={(opts) => {
            if (opts?.search !== undefined) setSearchQuery(opts.search);
            if (opts?.filterAttendance !== undefined) {
              setFilterAttendance(opts.filterAttendance);
            }
            if (opts?.filterSelection !== undefined) {
              setFilterSelection(opts.filterSelection);
            }
            applyNavigation({
              route: 'monthly_grid',
              viewTab: 'grid',
              casePage: null,
            });
          }}
          onOpenAddEmployee={() =>
            setEmployeeModalState({ open: true, editingEmployee: null })
          }
          onGenerateDemoDelegates={generateInitial100Delegates}
        />
      ) : (
        <>
          {/* شريط التحكم في الشهر، مفتاح الوضع الداكن، والمؤشرات الرقمية لصفحة الجدول الشهري المستقلة */}
          <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 transition-colors duration-150">
            <div className="max-w-[1900px] mx-auto space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        if (currentMonth === 1) {
                          setCurrentMonth(12);
                          setCurrentYear((y) => y - 1);
                        } else {
                          setCurrentMonth((m) => m - 1);
                        }
                      }}
                      className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-700 dark:text-slate-200 transition-colors"
                      title="الشهر السابق"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="px-4 py-1 font-extrabold text-sm text-slate-900 dark:text-slate-100 min-w-[130px] text-center whitespace-nowrap">
                      {MONTH_NAMES[currentMonth - 1]}{' '}
                      <span className="font-mono tabular-nums">{currentYear}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (currentMonth === 12) {
                          setCurrentMonth(1);
                          setCurrentYear((y) => y + 1);
                        } else {
                          setCurrentMonth((m) => m + 1);
                        }
                      }}
                      className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-700 dark:text-slate-200 transition-colors"
                      title="الشهر التالي"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>

                  {!isCurrentMonthView && (
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentYear(today.getFullYear());
                        setCurrentMonth(today.getMonth() + 1);
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 rounded-lg transition-colors whitespace-nowrap"
                    >
                      العودة للشهر الحالي
                    </button>
                  )}

                  <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>تاريخ اليوم:</span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 font-medium">
                      {todayStr}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>مزامنة السحابة:</span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 font-medium">
                      {lastSyncTime}
                    </span>
                    {currentUser.role === 'supervisor' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          نطاق الفريق: {currentUser.teamId || 'غير معين'}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 no-print">
                  <button
                    type="button"
                    onClick={() => setIsDarkMode((prev) => !prev)}
                    className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {isDarkMode ? (
                      <>
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                        الوضع الفاتح
                      </>
                    ) : (
                      <>
                        <Moon className="w-3.5 h-3.5 text-indigo-600" />
                        الوضع الداكن
                      </>
                    )}
                  </button>

                  {employees.length === 0 && canCreateEmp && (
                    <button
                      type="button"
                      disabled={isMigratingLocal}
                      onClick={generateInitial100Delegates}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                    >
                      <Users className="w-3.5 h-3.5" />
                      {isMigratingLocal
                        ? 'جارٍ التهيئة...'
                        : 'تهيئة 100 مندوب للتجربة'}
                    </button>
                  )}

                  {employees.length > 0 && currentUser.role === 'super_admin' && (
                    confirmClearAll ? (
                      <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 px-2.5 py-1 rounded-lg">
                        <span className="text-xs text-rose-800 dark:text-rose-300 font-bold">
                          مسح الكل أمنياً؟
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            await clearAllOperationalDataFirestore({
                              actor: currentUser,
                              employees,
                              attendanceRecords,
                            });
                            setConfirmClearAll(false);
                            showToast('تم تفريغ البيانات وتوثيق العملية في السجل الأمني.', 'info');
                          }}
                          className="px-2 py-1 bg-rose-600 text-white text-xs font-bold rounded hover:bg-rose-700"
                        >
                          نعم
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClearAll(false)}
                          className="px-2 py-1 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmClearAll(true)}
                        className="border border-slate-300 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-700 dark:hover:text-rose-400 text-slate-600 dark:text-slate-300 text-xs font-medium px-3 py-2 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        إعادة ضبط
                      </button>
                    )
                  )}

                  {canAccessRoute(currentUser, 'analytics', securityPolicy) && (
                    <button
                      type="button"
                      onClick={() => navigateToRoute('analytics')}
                      className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      ملخص الأداء
                    </button>
                  )}

                  {(hasPermission(currentUser, 'integration.manage', securityPolicy) ||
                    canExportReport) && (
                    <button
                      type="button"
                      onClick={() => setIsSyncModalOpen(true)}
                      className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                      مزامنة / JSON
                    </button>
                  )}

                  {canExportReport && (
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      تصدير Excel
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    طباعة
                  </button>
                </div>
              </div>

              {/* المؤشرات الرئيسية التفاعلية — كل بطاقة تنقلك لتفاصيلها المبسطة */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => applyNavigation({ casePage: 'all_shifts' })}
                  className="text-right px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 transition-colors cursor-pointer"
                >
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                    القوة الأساسية
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
                      {topStats.totalHeadcount}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      مندوب
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyNavigation({ casePage: 'worked_only' })}
                  className="text-right px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-400 transition-colors cursor-pointer"
                >
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                    المندوبون النشطون
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                      {topStats.activeCount}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      جاهز للعمل
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyNavigation({ casePage: 'all_shifts' })}
                  className="text-right px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-sky-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-sky-400 transition-colors cursor-pointer"
                >
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                    اختاروا شفت ({topStats.refLabel})
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-extrabold text-sky-700 dark:text-sky-400 font-mono tabular-nums">
                      {topStats.selectedToday}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      شفت مؤكد
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyNavigation({ casePage: 'incomplete_schedule' })}
                  className="text-right px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-amber-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-amber-400 transition-colors cursor-pointer"
                >
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                    لم يختاروا شفت ({topStats.refLabel})
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 font-mono tabular-nums">
                      {topStats.notSelectedToday}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      للمتابعة
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyNavigation({ casePage: 'worked_only' })}
                  className="text-right px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-400 transition-colors cursor-pointer"
                >
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                    حضروا فعلياً ({topStats.refLabel})
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                      {topStats.workedToday}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      حضور معتمد
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToRoute('analytics')}
                  className="text-right px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 transition-colors cursor-pointer"
                >
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                    إجمالي ساعات الشهر
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-400 font-mono tabular-nums">
                      {topStats.totalMonthlyHours}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      ساعة فعلية
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </section>

          {/* شريط الفلاتر والبحث ودليل الحالات */}
          <section className="bg-slate-100/80 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 px-6 py-3 no-print transition-colors duration-150">
            <div className="max-w-[1900px] mx-auto flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث بالاسم، الكود، أو الهاتف..."
                    className="w-60 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg pr-8 pl-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>

                {/* أزرار وظائف حالات الشفت — كل زر ينقل إلى صفحة مخصصة بكامل التفاصيل بشكل مبسط */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg">
                  <button
                    type="button"
                    onClick={() => applyNavigation({ casePage: 'all_shifts' })}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeCasePage === 'all_shifts'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    كل حالات الشفت
                  </button>
                  <button
                    type="button"
                    onClick={() => applyNavigation({ casePage: 'selected_not_worked' })}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeCasePage === 'selected_not_worked'
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    اختار الشفت ولم يعمل
                  </button>
                  <button
                    type="button"
                    onClick={() => applyNavigation({ casePage: 'incomplete_schedule' })}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeCasePage === 'incomplete_schedule'
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    لم يكمل جدولة الشهر
                  </button>
                </div>

                <select
                  value={filterAttendance}
                  onChange={(e) => setFilterAttendance(e.target.value)}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="all">كل حالات الحضور</option>
                  <option value="worked_only">الحاضرون فقط</option>
                  <option value="absent_only">الذين لديهم غياب</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="code">ترتيب حسب الرقم الوظيفي</option>
                  <option value="name">ترتيب أبجدي بالاسم</option>
                  <option value="workedDays">الأكثر أيام عمل</option>
                  <option value="hours">الأعلى ساعات عمل</option>
                  <option value="performance">الأعلى نسبة أداء</option>
                </select>

                {(searchQuery ||
                  filterSelection !== 'all' ||
                  filterAttendance !== 'all' ||
                  activeCasePage !== null) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setFilterSelection('all');
                      setFilterAttendance('all');
                      if (activeCasePage !== null) {
                        applyNavigation({ casePage: null });
                      }
                    }}
                    className="text-xs text-indigo-700 dark:text-indigo-400 hover:underline font-bold px-2 py-1 whitespace-nowrap"
                  >
                    {activeCasePage
                      ? 'العودة للجدول الشهري'
                      : `إلغاء الفلاتر (${filteredEmployees.length})`}
                  </button>
                )}
              </div>

              {/* دليل الألوان والرموز */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                <span className="font-bold text-slate-800 dark:text-slate-100">
                  دليل الحالات:
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-4 bg-emerald-600 text-white rounded text-[10px] font-bold flex items-center justify-center">
                    ✓
                  </span>
                  حاضر
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-4 bg-rose-600 text-white rounded text-[10px] font-bold flex items-center justify-center">
                    ✕
                  </span>
                  غياب
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1 h-4 bg-sky-600 text-white rounded text-[9px] font-bold flex items-center justify-center">
                    انتظار
                  </span>
                  بانتظار الاعتماد
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-4 bg-amber-300 dark:bg-amber-500 text-amber-950 rounded text-[10px] font-bold flex items-center justify-center">
                    ؟
                  </span>
                  لم يحدد
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-4 bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded text-[9px] font-bold flex items-center justify-center">
                    إج
                  </span>
                  إجازة / راحة
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1 h-4 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 rounded text-[9px] font-bold flex items-center justify-center">
                    مجدول
                  </span>
                  مجدول مستقبلاً
                </span>
              </div>
            </div>
          </section>

          <main className="flex-1 p-4 sm:p-6 max-w-[1900px] w-full mx-auto">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-[calc(100vh-290px)] min-h-[420px] relative transition-colors duration-150">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700 select-none">
                      <th className="p-2.5 w-[72px] min-w-[72px] text-center sticky-col-first bg-slate-100 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                        الكود
                      </th>
                      <th className="p-2.5 w-[176px] min-w-[176px] sticky-col-second bg-slate-100 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                        اسم المندوب
                      </th>
                      <th className="p-2.5 w-[76px] min-w-[76px] text-center sticky-col-third bg-slate-100 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                        الحالة
                      </th>

                      {monthDaysList.map((d) => {
                        const isTodayCol =
                          isCurrentMonthView && d.dayNumber === today.getDate();
                        return (
                          <th
                            key={d.dayNumber}
                            className={`p-1 text-center w-11 min-w-[42px] border-l border-slate-200 dark:border-slate-700 ${
                              isTodayCol
                                ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-950 dark:text-indigo-200 font-extrabold'
                                : 'bg-slate-100 dark:bg-slate-800'
                            }`}
                          >
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                              {d.dayName}
                            </div>
                            <div className="text-xs font-mono tabular-nums">
                              {d.dayNumber}
                            </div>
                          </th>
                        );
                      })}

                      <th className="p-2.5 min-w-[270px] w-[270px] text-center sticky-col-last bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 font-extrabold">
                        ملخص الأداء والالتزام الشهري
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td
                          colSpan={monthDaysList.length + 4}
                          className="text-center py-16 text-slate-500 dark:text-slate-400"
                        >
                          <div className="flex flex-col items-center justify-center gap-3">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                              {employees.length === 0
                                ? currentUser.role === 'supervisor' && !currentUser.teamId
                                  ? 'لم يتم تعيينك على فريق نشط بعد — يرجى مراجعة مدير النظام'
                                  : 'لا يوجد مندوبون مسجلون ضمن هذا النطاق حالياً'
                                : 'لا يوجد مندوبون مطابقون لمعايير البحث أو الفلترة'}
                            </p>
                            {employees.length === 0 && canCreateEmp && (
                              <div className="flex items-center gap-2 mt-1">
                                <button
                                  type="button"
                                  disabled={isMigratingLocal}
                                  onClick={generateInitial100Delegates}
                                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                                >
                                  تهيئة 100 مندوب للتجربة
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEmployeeModalState({
                                      open: true,
                                      editingEmployee: null,
                                    })
                                  }
                                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors"
                                >
                                  + إضافة أول مندوب
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const sum = summaries[emp.id];
                        return (
                          <tr
                            key={emp.id}
                            className="group hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                          >
                            <td className="p-2 text-center font-mono tabular-nums text-slate-600 dark:text-slate-400 sticky-col-first bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800">
                              {emp.employeeCode}
                            </td>

                            <td className="p-2 font-bold text-slate-900 dark:text-slate-100 sticky-col-second bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800">
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className="truncate max-w-[130px]"
                                  title={`${emp.fullName}${
                                    emp.phone ? ` — ${emp.phone}` : ''
                                  }`}
                                >
                                  {emp.fullName}
                                </span>
                                {canEditEmp && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEmployeeModalState({
                                        open: true,
                                        editingEmployee: emp,
                                      })
                                    }
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-opacity no-print"
                                    title="تعديل بيانات المندوب"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>

                            <td className="p-2 text-center sticky-col-third bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800">
                              <button
                                type="button"
                                disabled={!hasPermission(currentUser, 'employees.edit', securityPolicy)}
                                onClick={() => handleToggleEmployeeStatus(emp.id)}
                                className={`text-[11px] font-bold transition-colors whitespace-nowrap disabled:cursor-default ${
                                  emp.status === 'active'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-rose-700 dark:text-rose-400'
                                }`}
                              >
                                {emp.status === 'active' ? 'نشط' : 'موقوف'}
                              </button>
                            </td>

                            {monthDaysList.map((d) => {
                              const visual = getCellPresentation(
                                emp.id,
                                d.dateStr,
                                d.dayNumber
                              );
                              const key = `${emp.id}_${d.dateStr}`;
                              const rec = attendanceRecords[key];
                              const editable = canRecordOrEditAttendance(
                                currentUser,
                                emp,
                                rec,
                                securityPolicy
                              );
                              return (
                                <td
                                  key={d.dayNumber}
                                  onClick={() => {
                                    if (editable || currentUser.role === 'supervisor') {
                                      setEditingCell({
                                        employee: emp,
                                        date: d.dateStr,
                                        record: rec,
                                      });
                                    }
                                  }}
                                  className={`p-0.5 text-center border-l border-slate-200 dark:border-slate-800 ${
                                    editable || currentUser.role === 'supervisor'
                                      ? 'cursor-pointer'
                                      : 'cursor-default'
                                  }`}
                                  title={`${emp.fullName} | ${d.dateStr} | ${visual.title}${
                                    rec?.supervisorNotes
                                      ? ` | ملاحظة: ${rec.supervisorNotes}`
                                      : ''
                                  }`}
                                >
                                  <div
                                    className={`w-full h-8 flex items-center justify-center rounded border text-[10px] transition-transform select-none ${visual.bg}`}
                                  >
                                    {visual.symbol}
                                  </div>
                                </td>
                              );
                            })}

                            <td className="p-2.5 sticky-col-last bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-r border-slate-300 dark:border-slate-700">
                              <div className="flex flex-col gap-1 text-[11px]">
                                <div className="flex items-center justify-between font-mono tabular-nums">
                                  <span className="font-sans text-slate-600 dark:text-slate-400">
                                    أيام العمل · الساعات:
                                  </span>
                                  <span className="font-bold text-slate-900 dark:text-slate-100">
                                    <span className="text-emerald-700 dark:text-emerald-400">
                                      {sum?.workedDays ?? 0} ي
                                    </span>
                                    <span className="text-slate-300 dark:text-slate-600 mx-1">
                                      /
                                    </span>
                                    <span className="text-indigo-700 dark:text-indigo-400">
                                      {sum?.totalHours ?? 0} س
                                    </span>
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                  <span>
                                    غياب:{' '}
                                    <strong className="text-rose-700 dark:text-rose-400">
                                      {sum?.absentDays ?? 0}
                                    </strong>{' '}
                                    · إجازة:{' '}
                                    {(sum?.leaveDays ?? 0) + (sum?.dayOffDays ?? 0)}
                                  </span>
                                  <span>معدل: {sum?.avgHours ?? 0} س</span>
                                </div>

                                <div className="mt-0.5">
                                  <div className="flex justify-between items-center text-[10px] mb-0.5 font-bold">
                                    <span className="text-slate-600 dark:text-slate-400">
                                      نسبة الأداء:
                                    </span>
                                    <span
                                      className={`font-mono tabular-nums ${
                                        sum?.performanceRate !== null &&
                                        sum?.performanceRate !== undefined
                                          ? sum.performanceRate >= 80
                                            ? 'text-emerald-700 dark:text-emerald-400'
                                            : 'text-amber-700 dark:text-amber-400'
                                          : 'text-slate-400 dark:text-slate-500'
                                      }`}
                                    >
                                      {sum?.performanceRate !== null &&
                                      sum?.performanceRate !== undefined
                                        ? `${sum.performanceRate}%`
                                        : 'غير متاح'}
                                    </span>
                                  </div>
                                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-transform duration-150 origin-right ${
                                        (sum?.performanceRate ?? 0) >= 80
                                          ? 'bg-emerald-600 dark:bg-emerald-500'
                                          : 'bg-amber-500'
                                      }`}
                                      style={{
                                        transform: `scaleX(${
                                          Math.min(100, sum?.performanceRate ?? 0) /
                                          100
                                        })`,
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </main>
        </>
      )}

      {/* النوافذ المنبثقة */}
      {editingCell && (
        <CellEditorModal
          currentUser={currentUser}
          employee={editingCell.employee}
          date={editingCell.date}
          record={editingCell.record}
          canEditShiftSelection={canEditShiftSelection}
          canDeleteRecord={canDeleteAttendance}
          onSave={handleSaveCell}
          onDelete={handleDeleteCellRecord}
          onClose={() => setEditingCell(null)}
        />
      )}

      {employeeModalState.open && (
        <EmployeeModal
          currentUser={currentUser}
          teams={teams}
          existingEmployees={employees}
          editingEmployee={employeeModalState.editingEmployee}
          todayStr={todayStr}
          canDeleteEmployee={canDeleteEmp}
          onSave={handleSaveEmployee}
          onDelete={handleDeleteEmployee}
          onClose={() =>
            setEmployeeModalState({ open: false, editingEmployee: null })
          }
        />
      )}

      {isSyncModalOpen && (
        <ImportSyncModal
          currentUser={currentUser}
          securityPolicy={securityPolicy}
          employees={employees}
          attendanceRecords={attendanceRecords}
          lastSyncTime={lastSyncTime}
          onImportData={async (newEmps, newAtt, isExt) => {
            await migrateLocalDataToFirestore({
              actor: currentUser,
              employees: newEmps,
              attendanceRecords: newAtt,
              sourceLabel: isExt
                ? 'مزامنة بيانات الشفتات من النظام الخارجي'
                : 'استيراد نسخة احتياطية JSON',
              markAsExternalSync: isExt,
            });
          }}
          onSyncComplete={(msg) => {
            setLastSyncTime(
              new Date().toLocaleTimeString('ar-EG', {
                hour: '2-digit',
                minute: '2-digit',
              })
            );
            showToast(msg);
          }}
          onClose={() => setIsSyncModalOpen(false)}
        />
      )}

      {activeViewTab === 'analytics' && (
        <AnalyticsModal
          employees={employees}
          summaries={summaries}
          currentMonth={currentMonth}
          currentYear={currentYear}
          onClose={handleGlobalBack}
        />
      )}

      {/* القائمة المنبثقة الجانبية الموحدة لجميع أقسام النظام بلا استثناء */}
      <AppSectionsDrawer
        isOpen={isSectionsDrawerOpen}
        onClose={() => setIsSectionsDrawerOpen(false)}
        currentUser={currentUser}
        securityPolicy={securityPolicy}
        currentSnapshot={currentNavSnapshot}
        counts={{
          employeesCount: employees.length,
          pendingRequestsCount,
          usersCount: allUsers.length + invitations.filter((i) => i.status === 'pending').length,
          teamsCount: teams.length,
          auditLogsCount: auditLogs.length,
          isDarkMode,
        }}
        onNavigate={(targetSnapshot) => {
          applyNavigation({
            route: targetSnapshot.route,
            viewTab: targetSnapshot.viewTab ?? 'grid',
            casePage:
              targetSnapshot.casePage !== undefined
                ? targetSnapshot.casePage
                : null,
            securityTab: targetSnapshot.securityTab ?? securityHubTab,
            profileSection: targetSnapshot.profileSection ?? 'all',
          });
        }}
        onRunQuickAction={handleDrawerQuickAction}
      />
    </div>
  );
}

function AppGate() {
  const { userProfile, isAuthReady } = useAuth();

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = safeLoadFromStorage<'dark' | 'light' | null>(
      'shift_tracker_theme',
      null
    );
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      safeSaveToStorage('shift_tracker_theme', 'dark');
    } else {
      root.classList.remove('dark');
      safeSaveToStorage('shift_tracker_theme', 'light');
    }
  }, [isDarkMode]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
            جارٍ التحقق من هوية المستخدم وصلاحيات الوصول...
          </p>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <AuthScreen
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
      />
    );
  }

  return (
    <AuthenticatedWorkspace
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
    />
  );
}

export default function App() {
  return (
    <FirestoreErrorBoundary>
      <AuthProvider>
        <AppGate />
      </AuthProvider>
    </FirestoreErrorBoundary>
  );
}
