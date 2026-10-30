import { describe, expect, it } from 'vitest';
import { UserProfile, UserRole } from '../types';
import { DEFAULT_SECURITY_POLICY } from '../utils/rbac';
import {
  buildDrawerSectionGroups,
  DrawerCountsInput,
  isDrawerItemActive,
} from '../utils/sectionsCatalog';
import { NavigationSnapshot } from '../utils/navigationHistory';

function makeMockUser(role: UserRole): UserProfile {
  return {
    uid: `uid_${role}`,
    name: `User ${role}`,
    email: `${role}@company.com`,
    emailKey: `${role}_company_com`,
    role,
    extraPermissions: [],
    revokedPermissions: [],
    teamId: role === 'supervisor' || role === 'delivery_rep' ? 'team_1' : '',
    employeeId: role === 'delivery_rep' ? 'emp_1' : '',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: '2026-01-01T00:00:00.000Z',
  };
}

const sampleCounts: DrawerCountsInput = {
  employeesCount: 42,
  pendingRequestsCount: 3,
  usersCount: 12,
  teamsCount: 4,
  auditLogsCount: 18,
  isDarkMode: false,
};

describe('sectionsCatalog — القائمة الجانبية الشاملة لجميع الأقسام', () => {
  it('تتضمن جميع الأقسام والمجموعات الخمس بلا استثناء لحساب مدير النظام (Super Admin)', () => {
    const groups = buildDrawerSectionGroups({
      user: makeMockUser('super_admin'),
      policy: DEFAULT_SECURITY_POLICY,
      counts: sampleCounts,
    });

    expect(groups.map((g) => g.id)).toEqual([
      'operations',
      'shift_cases',
      'administration_security',
      'profile_security',
      'quick_tools',
    ]);

    const allIds = groups.flatMap((g) => g.items.map((i) => i.id));

    // صفحات التشغيل الخمس المستقلة (الرئيسية لملخص البيانات + الجدول الشهري + التقارير + بوابتي + الطلبات)
    expect(allIds).toContain('nav_home_overview');
    expect(allIds).toContain('nav_dashboard_grid');
    expect(allIds).toContain('nav_dashboard_analytics');
    expect(allIds).toContain('nav_my_portal');
    expect(allIds).toContain('nav_requests');

    // صفحات حالات الشفتات الخمس بالكامل
    expect(allIds).toContain('nav_case_all_shifts');
    expect(allIds).toContain('nav_case_selected_not_worked');
    expect(allIds).toContain('nav_case_incomplete_schedule');
    expect(allIds).toContain('nav_case_worked_only');
    expect(allIds).toContain('nav_case_absent_only');

    // أقسام مركز التحكم الأمني الستة بالكامل
    expect(allIds).toContain('nav_sec_hub_overview');
    expect(allIds).toContain('nav_sec_hub_permissions_matrix');
    expect(allIds).toContain('nav_sec_hub_users');
    expect(allIds).toContain('nav_sec_hub_teams');
    expect(allIds).toContain('nav_sec_hub_integration');
    expect(allIds).toContain('nav_sec_hub_audit_and_simulator');

    // أقسام الملف الشخصي الخمسة (عرض الكل + 1..4)
    expect(allIds).toContain('nav_profile_all');
    expect(allIds).toContain('nav_profile_personal_info');
    expect(allIds).toContain('nav_profile_password_credentials');
    expect(allIds).toContain('nav_profile_security_procedures');
    expect(allIds).toContain('nav_profile_role_and_activity');

    // الأدوات السريعة الستة بالكامل
    expect(allIds).toContain('act_add_employee');
    expect(allIds).toContain('act_sync_json');
    expect(allIds).toContain('act_export_csv');
    expect(allIds).toContain('act_print');
    expect(allIds).toContain('act_toggle_theme');
    expect(allIds).toContain('act_logout');
  });

  it('تعزل الأقسام الإدارية عن حساب المندوب (Delivery Rep) وتعرض أقسامه المصرح بها فقط', () => {
    const groups = buildDrawerSectionGroups({
      user: makeMockUser('delivery_rep'),
      policy: DEFAULT_SECURITY_POLICY,
      counts: sampleCounts,
    });

    const groupIds = groups.map((g) => g.id);
    expect(groupIds).toEqual(['operations', 'profile_security', 'quick_tools']);

    const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(allIds).toContain('nav_my_portal');
    expect(allIds).toContain('nav_requests');
    expect(allIds).not.toContain('nav_dashboard_grid');
    expect(allIds).not.toContain('nav_users');
    expect(allIds).not.toContain('act_add_employee');
  });

  it('تعرض لمدير التشغيل أقسام الإدارة المصرح بها دون مركز الطوارئ الحصري لمدير النظام', () => {
    const groups = buildDrawerSectionGroups({
      user: makeMockUser('operations_manager'),
      policy: DEFAULT_SECURITY_POLICY,
      counts: sampleCounts,
    });

    const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(allIds).toContain('nav_teams');
    expect(allIds).toContain('nav_users');
    expect(allIds).toContain('nav_audit_logs');
    expect(allIds).not.toContain('nav_sec_hub_overview');
    expect(allIds).not.toContain('nav_security_settings');
  });

  it('تميّز القسم الفرعي النشط بدقة عبر isDrawerItemActive', () => {
    const groups = buildDrawerSectionGroups({
      user: makeMockUser('super_admin'),
      policy: DEFAULT_SECURITY_POLICY,
      counts: sampleCounts,
    });
    const allItems = groups.flatMap((g) => g.items);

    const caseSnap: NavigationSnapshot = {
      route: 'dashboard',
      viewTab: 'grid',
      casePage: 'selected_not_worked',
      securityTab: 'overview',
      profileSection: 'all',
    };

    const activeForCase = allItems
      .filter((i) => isDrawerItemActive(i, caseSnap, true))
      .map((i) => i.id);
    expect(activeForCase).toEqual(['nav_case_selected_not_worked']);

    const profileSnap: NavigationSnapshot = {
      route: 'profile',
      viewTab: 'grid',
      casePage: null,
      securityTab: 'overview',
      profileSection: 'password_credentials',
    };

    const activeForProfile = allItems
      .filter((i) => isDrawerItemActive(i, profileSnap, true))
      .map((i) => i.id);
    expect(activeForProfile).toEqual(['nav_profile_password_credentials']);

    const secSnap: NavigationSnapshot = {
      route: 'security_center',
      viewTab: 'grid',
      casePage: null,
      securityTab: 'permissions_matrix',
      profileSection: 'all',
    };

    const activeForSec = allItems
      .filter((i) => isDrawerItemActive(i, secSnap, true))
      .map((i) => i.id);
    expect(activeForSec).toEqual(['nav_sec_hub_permissions_matrix']);

    const homeOverviewSnap: NavigationSnapshot = {
      route: 'dashboard',
      viewTab: 'grid',
      casePage: null,
      securityTab: 'overview',
      profileSection: 'all',
    };
    const activeForHome = allItems
      .filter((i) => isDrawerItemActive(i, homeOverviewSnap, true))
      .map((i) => i.id);
    expect(activeForHome).toEqual(['nav_home_overview']);

    const monthlyGridSnap: NavigationSnapshot = {
      route: 'monthly_grid',
      viewTab: 'grid',
      casePage: null,
      securityTab: 'overview',
      profileSection: 'all',
    };
    const activeForGrid = allItems
      .filter((i) => isDrawerItemActive(i, monthlyGridSnap, true))
      .map((i) => i.id);
    expect(activeForGrid).toEqual(['nav_dashboard_grid']);

    const analyticsSnap: NavigationSnapshot = {
      route: 'analytics',
      viewTab: 'grid',
      casePage: null,
      securityTab: 'overview',
      profileSection: 'all',
    };
    const activeForAnalytics = allItems
      .filter((i) => isDrawerItemActive(i, analyticsSnap, true))
      .map((i) => i.id);
    expect(activeForAnalytics).toEqual(['nav_dashboard_analytics']);

    // التحقق أن كل عنصر تنقل في القائمة الجانبية يفتح صفحة مستقلة فريدة على حدة دون تداخل
    const navItems = allItems.filter((i) => i.kind === 'navigation');
    for (const navItem of navItems) {
      const snap: NavigationSnapshot = {
        route: navItem.targetSnapshot!.route,
        viewTab: navItem.targetSnapshot!.viewTab ?? 'grid',
        casePage: navItem.targetSnapshot!.casePage ?? null,
        securityTab: navItem.targetSnapshot!.securityTab ?? 'overview',
        profileSection: navItem.targetSnapshot!.profileSection ?? 'all',
      };
      const matched = navItems
        .filter((candidate) => isDrawerItemActive(candidate, snap, true))
        .map((c) => c.id);
      expect(matched).toEqual([navItem.id]);
    }
  });
});
