import { describe, expect, it } from 'vitest';
import {
  NavigationSnapshot,
  getBackTargetHintAr,
  getSnapshotLabelAr,
  pushNavigationSnapshot,
  resolveBackStep,
} from '../utils/navigationHistory';

describe('Universal Back Button Navigation History Stack', () => {
  const rootDashboard: NavigationSnapshot = {
    route: 'dashboard',
    viewTab: 'grid',
    casePage: null,
    securityTab: 'overview',
  };

  it('tracks multi-step navigation across routes, case pages, analytics, and security tabs and steps back in exact reverse order', () => {
    let stack: NavigationSnapshot[] = [];
    let current = rootDashboard;

    // 1. الانتقال من الجدول الشهري إلى صفحة "اختار الشفت ولم يعمل"
    const step1: NavigationSnapshot = {
      ...current,
      casePage: 'selected_not_worked',
    };
    stack = pushNavigationSnapshot(stack, current, step1);
    current = step1;

    // 2. الانتقال إلى مركز التحكم الأمني (غرفة القيادة)
    const step2: NavigationSnapshot = {
      route: 'security_center',
      viewTab: 'grid',
      casePage: null,
      securityTab: 'overview',
    };
    stack = pushNavigationSnapshot(stack, current, step2);
    current = step2;

    // 3. التنقل داخل مركز التحكم الأمني إلى تبويب الحسابات والصلاحيات التلقائية
    const step3: NavigationSnapshot = {
      ...current,
      securityTab: 'users',
    };
    stack = pushNavigationSnapshot(stack, current, step3);
    current = step3;

    expect(stack).toHaveLength(3);
    expect(
      getBackTargetHintAr({
        stack,
        current,
        defaultRoute: 'dashboard',
        isSuperAdmin: true,
      })
    ).toContain('غرفة القيادة');

    // ضغطة رجوع 1: من تبويب الحسابات -> غرفة القيادة
    const back1 = resolveBackStep({
      stack,
      current,
      defaultRoute: 'dashboard',
      isSuperAdmin: true,
    });
    expect(back1.actionType).toBe('pop_history');
    expect(back1.nextSnapshot).toEqual(step2);
    stack = back1.nextStack;
    current = back1.nextSnapshot!;

    // ضغطة رجوع 2: من غرفة القيادة -> صفحة "اختار الشفت ولم يعمل"
    const back2 = resolveBackStep({
      stack,
      current,
      defaultRoute: 'dashboard',
      isSuperAdmin: true,
    });
    expect(back2.actionType).toBe('pop_history');
    expect(back2.nextSnapshot).toEqual(step1);
    stack = back2.nextStack;
    current = back2.nextSnapshot!;

    // ضغطة رجوع 3: من صفحة الحالة -> الجدول الشهري الأساسي
    const back3 = resolveBackStep({
      stack,
      current,
      defaultRoute: 'dashboard',
      isSuperAdmin: true,
    });
    expect(back3.actionType).toBe('pop_history');
    expect(back3.nextSnapshot).toEqual(rootDashboard);
    stack = back3.nextStack;
    current = back3.nextSnapshot!;

    // ضغطة رجوع 4: عند التواجد في الجذر الأساسي
    const back4 = resolveBackStep({
      stack,
      current,
      defaultRoute: 'dashboard',
      isSuperAdmin: true,
    });
    expect(back4.actionType).toBe('at_root');
    expect(back4.nextSnapshot).toBeNull();
  });

  it('falls back gracefully to parent view then defaultRoute when opened directly via URL hash with empty stack', () => {
    const directSecurityTab: NavigationSnapshot = {
      route: 'users',
      viewTab: 'grid',
      casePage: null,
      securityTab: 'users',
    };

    // Super Admin فتح #users مباشرة: الضغطة الأولى ترجعه لغرفة القيادة الرئيسية بمركز التحكم
    const firstBack = resolveBackStep({
      stack: [],
      current: directSecurityTab,
      defaultRoute: 'dashboard',
      isSuperAdmin: true,
    });
    expect(firstBack.actionType).toBe('fallback_parent');
    expect(firstBack.nextSnapshot?.route).toBe('security_center');
    expect(firstBack.nextSnapshot?.securityTab).toBe('overview');

    // الضغطة الثانية ترجعه للجدول الشهري الرئيسي
    const secondBack = resolveBackStep({
      stack: [],
      current: firstBack.nextSnapshot!,
      defaultRoute: 'dashboard',
      isSuperAdmin: true,
    });
    expect(secondBack.actionType).toBe('fallback_parent');
    expect(secondBack.nextSnapshot?.route).toBe('dashboard');
  });

  it('returns delivery_rep to my_portal when pressing Back from requests or profile with empty history', () => {
    const repOnRequests: NavigationSnapshot = {
      route: 'requests',
      viewTab: 'grid',
      casePage: null,
      securityTab: 'overview',
    };

    const res = resolveBackStep({
      stack: [],
      current: repOnRequests,
      defaultRoute: 'my_portal',
      isSuperAdmin: false,
    });
    expect(res.nextSnapshot?.route).toBe('my_portal');
    expect(getSnapshotLabelAr(res.nextSnapshot!, false)).toBe('بوابتي الشخصية');
  });
});
