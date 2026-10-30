import {
  AccountSecurityUpdateInput,
  PersonalInfoUpdateInput,
  ProfileSectionId,
  SecurityPolicySettings,
  UserProfile,
} from '../types';

export interface ProfileSectionMeta {
  id: Exclude<ProfileSectionId, 'all'>;
  orderNumber: number;
  titleAr: string;
  shortTitleAr: string;
  subtitleAr: string;
}

export const PROFILE_SECTIONS_ORDERED: ProfileSectionMeta[] = [
  {
    id: 'personal_info',
    orderNumber: 1,
    titleAr: 'القسم الأول: المعلومات الشخصية والبيانات الأساسية',
    shortTitleAr: 'المعلومات الشخصية',
    subtitleAr:
      'تعديل يدوي للاسم الكامل، رقم الهاتف، المسمى الوظيفي، القسم، والنبذة التعريفية للحساب.',
  },
  {
    id: 'password_credentials',
    orderNumber: 2,
    titleAr: 'القسم الثاني: تغيير كلمة المرور وبيانات الدخول',
    shortTitleAr: 'كلمة المرور والدخول',
    subtitleAr:
      'تغيير كلمة المرور يدوياً، أو تعيين كلمة مرور يدوية للحسابات المرتبطة بـ Google، واستعادة الدخول.',
  },
  {
    id: 'security_procedures',
    orderNumber: 3,
    titleAr: 'القسم الثالث: إجراءات أمان الحساب وحماية الجلسة',
    shortTitleAr: 'إجراءات الأمان والجلسة',
    subtitleAr:
      'ضبط مهلة القفل التلقائي للجلسة، اشتراط إعادة التحقق للعمليات الحساسة، التنبيهات الأمنية، وتأكيد البريد.',
  },
  {
    id: 'role_and_activity',
    orderNumber: 4,
    titleAr: 'القسم الرابع: الهوية الوظيفية والصلاحيات وسجل الأمان',
    shortTitleAr: 'الصلاحيات وسجل الأمان',
    subtitleAr:
      'استعراض الدور المعتمد ونطاق الفريق، مصفوفة الصلاحيات الممنوحة، وسجل النشاط الأمني الخاص بحسابك.',
  },
];

export const PROFILE_SECTION_LABELS_AR: Record<ProfileSectionId, string> = {
  all: 'جميع أقسام الملف الشخصي',
  personal_info: 'المعلومات الشخصية',
  password_credentials: 'تغيير كلمة المرور والدخول',
  security_procedures: 'إجراءات أمان الحساب والجلسة',
  role_and_activity: 'الصلاحيات وسجل الأمان',
};

export interface PasswordStrengthReport {
  score: 0 | 1 | 2 | 3 | 4;
  labelAr: 'فارغة' | 'ضعيفة' | 'متوسطة' | 'قوية' | 'قوية جداً';
  hasMinLength: boolean;
  hasMixedCaseOrLetters: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  isAcceptable: boolean;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthReport {
  if (!password) {
    return {
      score: 0,
      labelAr: 'فارغة',
      hasMinLength: false,
      hasMixedCaseOrLetters: false,
      hasNumber: false,
      hasSymbol: false,
      isAcceptable: false,
    };
  }

  const hasMinLength = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasArabicOrLetter = /[a-zA-Z\u0600-\u06FF]/.test(password);
  const hasMixedCaseOrLetters = (hasLower && hasUpper) || (hasArabicOrLetter && password.length >= 10);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9\s]/.test(password);

  let rawPoints = 0;
  if (hasMinLength) rawPoints += 1;
  if (hasMixedCaseOrLetters) rawPoints += 1;
  if (hasNumber) rawPoints += 1;
  if (hasSymbol) rawPoints += 1;

  const score = (hasMinLength ? Math.max(1, rawPoints) : Math.min(1, rawPoints)) as
    | 0
    | 1
    | 2
    | 3
    | 4;

  const labelMap: Record<0 | 1 | 2 | 3 | 4, PasswordStrengthReport['labelAr']> = {
    0: 'فارغة',
    1: 'ضعيفة',
    2: 'متوسطة',
    3: 'قوية',
    4: 'قوية جداً',
  };

  return {
    score,
    labelAr: labelMap[score],
    hasMinLength,
    hasMixedCaseOrLetters,
    hasNumber,
    hasSymbol,
    isAcceptable: hasMinLength && password.length <= 128 && (hasNumber || hasSymbol || hasArabicOrLetter),
  };
}

export function validateManualPasswordInput(params: {
  requiresCurrentPassword: boolean;
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}): { valid: boolean; errorAr?: string } {
  const { requiresCurrentPassword, currentPassword, newPassword, confirmPassword } = params;

  if (requiresCurrentPassword && (!currentPassword || !currentPassword.trim())) {
    return {
      valid: false,
      errorAr: 'يرجى إدخال كلمة المرور الحالية أولاً للتحقق من ملكية الحساب.',
    };
  }

  if (!newPassword || newPassword.length < 8) {
    return {
      valid: false,
      errorAr: 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف.',
    };
  }

  if (newPassword.length > 128) {
    return {
      valid: false,
      errorAr: 'يجب ألا تتجاوز كلمة المرور الجديدة 128 حرفاً.',
    };
  }

  if (requiresCurrentPassword && currentPassword === newPassword) {
    return {
      valid: false,
      errorAr: 'يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية.',
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      valid: false,
      errorAr: 'تأكيد كلمة المرور الجديدة غير مطابق للحقل الأول.',
    };
  }

  const strength = evaluatePasswordStrength(newPassword);
  if (!strength.isAcceptable) {
    return {
      valid: false,
      errorAr: 'يرجى تضمين أحرف وأرقام أو رموز لضمان قوة كلمة المرور.',
    };
  }

  return { valid: true };
}

export function validatePersonalInfoInput(
  input: PersonalInfoUpdateInput
): { valid: boolean; sanitized: PersonalInfoUpdateInput; errorAr?: string } {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const jobTitle = input.jobTitle.trim();
  const department = input.department.trim();
  const bio = input.bio.trim();

  if (name.length < 2 || name.length > 120) {
    return {
      valid: false,
      sanitized: { name, phone, jobTitle, department, bio },
      errorAr: 'يجب أن يتراوح الاسم الكامل بين حرفين و 120 حرفاً.',
    };
  }

  if (phone.length > 32 || (phone.length > 0 && !/^[0-9+\-()\s]{6,32}$/.test(phone))) {
    return {
      valid: false,
      sanitized: { name, phone, jobTitle, department, bio },
      errorAr: 'رقم الهاتف غير صالح. استخدم الأرقام وعلامة + فقط (6 إلى 32 خانة).',
    };
  }

  if (jobTitle.length > 100) {
    return {
      valid: false,
      sanitized: { name, phone, jobTitle, department, bio },
      errorAr: 'المسمى الوظيفي يجب ألا يتجاوز 100 حرف.',
    };
  }

  if (department.length > 100) {
    return {
      valid: false,
      sanitized: { name, phone, jobTitle, department, bio },
      errorAr: 'اسم القسم / الإدارة يجب ألا يتجاوز 100 حرف.',
    };
  }

  if (bio.length > 500) {
    return {
      valid: false,
      sanitized: { name, phone, jobTitle, department, bio },
      errorAr: 'النبذة التعريفية والملاحظات الشخصية يجب ألا تتجاوز 500 حرف.',
    };
  }

  return {
    valid: true,
    sanitized: {
      name: name.slice(0, 120),
      phone: phone.slice(0, 32),
      jobTitle: jobTitle.slice(0, 100),
      department: department.slice(0, 100),
      bio: bio.slice(0, 500),
    },
  };
}

export function sanitizeAccountSecurityInput(
  input: AccountSecurityUpdateInput
): AccountSecurityUpdateInput {
  const clampedTimeout = Math.max(
    5,
    Math.min(1440, Math.round(Number(input.personalSessionTimeoutMinutes) || 60))
  );
  return {
    personalSessionTimeoutMinutes: clampedTimeout,
    requireReauthForSensitiveActions: Boolean(input.requireReauthForSensitiveActions),
    securityAlertsEnabled: Boolean(input.securityAlertsEnabled),
  };
}

export function resolveEffectiveSessionTimeoutMinutes(
  user: Pick<UserProfile, 'role' | 'personalSessionTimeoutMinutes'> | null,
  policy: Pick<SecurityPolicySettings, 'sessionTimeoutMinutes'>
): number {
  const globalLimit = Math.max(5, Math.min(1440, Number(policy.sessionTimeoutMinutes) || 60));
  if (!user) return globalLimit;

  const personal = user.personalSessionTimeoutMinutes;
  if (typeof personal !== 'number' || Number.isNaN(personal) || personal < 5) {
    return globalLimit;
  }

  const clampedPersonal = Math.max(5, Math.min(1440, Math.round(personal)));
  if (user.role === 'super_admin') {
    return clampedPersonal;
  }
  // لغير مدير النظام: نطبق القيمة الأكثر أماناً (الأقل زمنياً) بين تفضيل المستخدم الشخصي والحد الأقصى العام للنظام
  return Math.min(clampedPersonal, globalLimit);
}
