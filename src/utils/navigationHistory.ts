import { AppRoutePage } from '../types';
import { ShiftCasePageType } from '../components/ShiftCaseDetailPage';
import { SecurityHubTab } from '../components/SuperAdminSecurityHub';

export interface NavigationSnapshot {
  route: AppRoutePage;
  viewTab: 'grid' | 'analytics';
  casePage: ShiftCasePageType | null;
  securityTab: SecurityHubTab;
}

const ROUTE_LABELS_AR: Record<AppRoutePage, string> = {
  dashboard: 'الجدول الشهري للشفتات',
  analytics: 'ملخص الأداء والتقارير',
  my_portal: 'بوابتي الشخصية',
  requests: 'الطلبات والإجازات',
  security_center: 'مركز التحكم الأمني الشامل',
  users: 'إدارة المستخدمين',
  teams: 'الفرق والمشرفون',
  audit_logs: 'سجل العمليات الأمني',
  security_settings: 'إعدادات الأمان',
  profile: 'ملفي الشخصي',
};

const CASE_PAGE_LABELS_AR: Record<ShiftCasePageType, string> = {
  all_shifts: 'كل حالات الشفت',
  selected_not_worked: 'اختار الشفت ولم يعمل',
  incomplete_schedule: 'لم يكمل جدولة الشهر',
  worked_only: 'الحاضرون فعلياً',
  absent_only: 'حالات الغياب المسجلة',
};

const SECURITY_TAB_LABELS_AR: Record<SecurityHubTab, string> = {
  overview: 'غرفة القيادة والطوارئ',
  permissions_matrix: 'مصفوفة الصلاحيات التفاعلية',
  users: 'الحسابات والصلاحيات التلقائية',
  teams: 'الفرق ونطاق البيانات',
  integration: 'الربط والنسخ الاحتياطي',
  audit_and_simulator: 'السجل الأمني ومحاكي الصلاحيات',
};

export function areSnapshotsEqual(
  a: NavigationSnapshot,
  b: NavigationSnapshot
): boolean {
  return (
    a.route === b.route &&
    a.viewTab === b.viewTab &&
    a.casePage === b.casePage &&
    a.securityTab === b.securityTab
  );
}

export function pushNavigationSnapshot(
  stack: NavigationSnapshot[],
  current: NavigationSnapshot,
  next: NavigationSnapshot,
  maxDepth = 50
): NavigationSnapshot[] {
  if (areSnapshotsEqual(current, next)) {
    return stack;
  }
  const lastInStack = stack[stack.length - 1];
  const nextStack =
    lastInStack && areSnapshotsEqual(lastInStack, current)
      ? [...stack]
      : [...stack, current];

  if (nextStack.length > maxDepth) {
    return nextStack.slice(nextStack.length - maxDepth);
  }
  return nextStack;
}

export function isSecurityHubRouteForSuperAdmin(
  route: AppRoutePage,
  isSuperAdmin: boolean
): boolean {
  if (!isSuperAdmin) return false;
  return (
    route === 'security_center' ||
    route === 'users' ||
    route === 'teams' ||
    route === 'audit_logs' ||
    route === 'security_settings'
  );
}

export function resolveBackStep(params: {
  stack: NavigationSnapshot[];
  current: NavigationSnapshot;
  defaultRoute: AppRoutePage;
  isSuperAdmin: boolean;
}): {
  nextSnapshot: NavigationSnapshot | null;
  nextStack: NavigationSnapshot[];
  actionType: 'pop_history' | 'fallback_parent' | 'at_root';
} {
  const { stack, current, defaultRoute, isSuperAdmin } = params;

  // 1. إذا كان هناك سجل تنقل سابق في المكدس، نرجع للخطوة السابقة الفعلية
  const trimmedStack = [...stack];
  while (trimmedStack.length > 0) {
    const candidate = trimmedStack.pop()!;
    if (!areSnapshotsEqual(candidate, current)) {
      return {
        nextSnapshot: candidate,
        nextStack: trimmedStack,
        actionType: 'pop_history',
      };
    }
  }

  // 2. إذا كان المكدس فارغاً (مثل فتح رابط فرعي مباشرة)، نتدرج منطقياً للأب ثم الصفحة الرئيسية
  if (current.viewTab !== 'grid') {
    return {
      nextSnapshot: { ...current, viewTab: 'grid' },
      nextStack: [],
      actionType: 'fallback_parent',
    };
  }

  if (current.casePage !== null) {
    return {
      nextSnapshot: {
        route: 'dashboard',
        viewTab: 'grid',
        casePage: null,
        securityTab: current.securityTab,
      },
      nextStack: [],
      actionType: 'fallback_parent',
    };
  }

  if (
    isSecurityHubRouteForSuperAdmin(current.route, isSuperAdmin) &&
    current.securityTab !== 'overview'
  ) {
    return {
      nextSnapshot: {
        route: 'security_center',
        viewTab: 'grid',
        casePage: null,
        securityTab: 'overview',
      },
      nextStack: [],
      actionType: 'fallback_parent',
    };
  }

  if (current.route !== defaultRoute) {
    return {
      nextSnapshot: {
        route: defaultRoute,
        viewTab: 'grid',
        casePage: null,
        securityTab: 'overview',
      },
      nextStack: [],
      actionType: 'fallback_parent',
    };
  }

  return {
    nextSnapshot: null,
    nextStack: [],
    actionType: 'at_root',
  };
}

export function getSnapshotLabelAr(
  snapshot: NavigationSnapshot,
  isSuperAdmin: boolean
): string {
  if (snapshot.viewTab === 'analytics') {
    return 'ملخص الأداء والتقارير';
  }
  if (snapshot.route === 'dashboard' && snapshot.casePage) {
    return `تفاصيل: ${CASE_PAGE_LABELS_AR[snapshot.casePage]}`;
  }
  if (isSecurityHubRouteForSuperAdmin(snapshot.route, isSuperAdmin)) {
    return `مركز التحكم الأمني · ${SECURITY_TAB_LABELS_AR[snapshot.securityTab]}`;
  }
  return ROUTE_LABELS_AR[snapshot.route] || 'الصفحة الرئيسية';
}

export function getBackTargetHintAr(params: {
  stack: NavigationSnapshot[];
  current: NavigationSnapshot;
  defaultRoute: AppRoutePage;
  isSuperAdmin: boolean;
}): string | null {
  const res = resolveBackStep(params);
  if (!res.nextSnapshot) return null;
  return getSnapshotLabelAr(res.nextSnapshot, params.isSuperAdmin);
}
