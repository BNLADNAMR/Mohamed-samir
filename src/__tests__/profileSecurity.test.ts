import { describe, expect, it } from 'vitest';
import {
  evaluatePasswordStrength,
  PROFILE_SECTIONS_ORDERED,
  resolveEffectiveSessionTimeoutMinutes,
  sanitizeAccountSecurityInput,
  validateManualPasswordInput,
  validatePersonalInfoInput,
} from '../utils/profileSecurity';
import {
  getBackTargetHintAr,
  getSnapshotLabelAr,
  NavigationSnapshot,
  pushNavigationSnapshot,
  resolveBackStep,
} from '../utils/navigationHistory';

describe('Manual Personal Profile & Account Security Procedures', () => {
  it('defines all 4 ordered profile sections sequentially (1 to 4)', () => {
    expect(PROFILE_SECTIONS_ORDERED).toHaveLength(4);
    expect(PROFILE_SECTIONS_ORDERED.map((s) => s.orderNumber)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(PROFILE_SECTIONS_ORDERED.map((s) => s.id)).toEqual([
      'personal_info',
      'password_credentials',
      'security_procedures',
      'role_and_activity',
    ]);
  });

  it('validates and sanitizes manual personal information inputs strictly', () => {
    const valid = validatePersonalInfoInput({
      name: '  أحمد محمود الشريف  ',
      phone: ' +20 101 234 5678 ',
      jobTitle: ' مشرف تشغيل الشفتات ',
      department: ' عمليات شرق القاهرة ',
      bio: ' متاح للتواصل خلال الشفت الصباحي ',
    });
    expect(valid.valid).toBe(true);
    expect(valid.sanitized.name).toBe('أحمد محمود الشريف');
    expect(valid.sanitized.phone).toBe('+20 101 234 5678');

    const invalidName = validatePersonalInfoInput({
      name: 'أ',
      phone: '',
      jobTitle: '',
      department: '',
      bio: '',
    });
    expect(invalidName.valid).toBe(false);

    const invalidPhone = validatePersonalInfoInput({
      name: 'أحمد محمود',
      phone: 'abc-invalid-phone',
      jobTitle: '',
      department: '',
      bio: '',
    });
    expect(invalidPhone.valid).toBe(false);
  });

  it('evaluates password strength and validates manual password change & linking', () => {
    expect(evaluatePasswordStrength('12345').isAcceptable).toBe(false);

    const strong = evaluatePasswordStrength('Shift@2026Secure');
    expect(strong.isAcceptable).toBe(true);
    expect(strong.score).toBe(4);
    expect(strong.labelAr).toBe('قوية جداً');

    // يتطلب كلمة المرور الحالية عند التغيير اليدوي لحساب يملك password provider
    const missingCurrent = validateManualPasswordInput({
      requiresCurrentPassword: true,
      currentPassword: '',
      newPassword: 'Shift@2026Secure',
      confirmPassword: 'Shift@2026Secure',
    });
    expect(missingCurrent.valid).toBe(false);

    // يرفض تكرار نفس كلمة المرور الحالية
    const samePw = validateManualPasswordInput({
      requiresCurrentPassword: true,
      currentPassword: 'Shift@2026Secure',
      newPassword: 'Shift@2026Secure',
      confirmPassword: 'Shift@2026Secure',
    });
    expect(samePw.valid).toBe(false);

    // يرفض عدم تطابق التأكيد
    const mismatch = validateManualPasswordInput({
      requiresCurrentPassword: false,
      newPassword: 'Shift@2026Secure',
      confirmPassword: 'Shift@2026Different',
    });
    expect(mismatch.valid).toBe(false);

    // يقبل التغيير الصحيح
    const accepted = validateManualPasswordInput({
      requiresCurrentPassword: true,
      currentPassword: 'OldPassword#123',
      newPassword: 'Shift@2026Secure',
      confirmPassword: 'Shift@2026Secure',
    });
    expect(accepted.valid).toBe(true);
  });

  it('computes effective idle session timeout respecting global security ceiling for non-admins', () => {
    const sanitized = sanitizeAccountSecurityInput({
      personalSessionTimeoutMinutes: 2,
      requireReauthForSensitiveActions: true,
      securityAlertsEnabled: false,
    });
    expect(sanitized.personalSessionTimeoutMinutes).toBe(5);

    // مستخدم عادي اختار 15 دقيقة بينما الحد العام 60 -> يطبق 15 دقيقة الأكثر أماناً
    expect(
      resolveEffectiveSessionTimeoutMinutes(
        { role: 'supervisor', personalSessionTimeoutMinutes: 15 },
        { sessionTimeoutMinutes: 60 }
      )
    ).toBe(15);

    // مستخدم عادي اختار 180 دقيقة بينما الحد العام 45 -> يطبق السقف الأمني 45 دقيقة
    expect(
      resolveEffectiveSessionTimeoutMinutes(
        { role: 'delivery_rep', personalSessionTimeoutMinutes: 180 },
        { sessionTimeoutMinutes: 45 }
      )
    ).toBe(45);

    // مدير النظام Super Admin يتحكم بمهلة جلسته بحرية ضمن الحدود المسموحة
    expect(
      resolveEffectiveSessionTimeoutMinutes(
        { role: 'super_admin', personalSessionTimeoutMinutes: 180 },
        { sessionTimeoutMinutes: 45 }
      )
    ).toBe(180);
  });

  it('integrates ordered profile sections with universal Back button navigation stack', () => {
    let stack: NavigationSnapshot[] = [];
    let current: NavigationSnapshot = {
      route: 'dashboard',
      viewTab: 'grid',
      casePage: null,
      securityTab: 'overview',
      profileSection: 'all',
    };

    const stepProfileAll: NavigationSnapshot = {
      ...current,
      route: 'profile',
      profileSection: 'all',
    };
    stack = pushNavigationSnapshot(stack, current, stepProfileAll);
    current = stepProfileAll;

    const stepPasswordSec: NavigationSnapshot = {
      ...current,
      profileSection: 'password_credentials',
    };
    stack = pushNavigationSnapshot(stack, current, stepPasswordSec);
    current = stepPasswordSec;

    expect(getSnapshotLabelAr(current, false)).toContain('تغيير كلمة المرور');
    expect(
      getBackTargetHintAr({
        stack,
        current,
        defaultRoute: 'dashboard',
        isSuperAdmin: false,
      })
    ).toContain('ملفي الشخصي');

    const backToProfileAll = resolveBackStep({
      stack,
      current,
      defaultRoute: 'dashboard',
      isSuperAdmin: false,
    });
    expect(backToProfileAll.nextSnapshot?.route).toBe('profile');
    expect(backToProfileAll.nextSnapshot?.profileSection).toBe('all');
  });
});
