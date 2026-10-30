import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isBenignAbortError,
  normalizeEmailToKey,
  OperationType,
  validateFirestoreConnection,
} from '../firebase';
import {
  AccountSecurityUpdateInput,
  PermissionKey,
  PersonalInfoUpdateInput,
  SecurityPolicySettings,
  UserProfile,
} from '../types';
import {
  BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
  DEFAULT_SECURITY_POLICY,
} from '../utils/rbac';
import {
  resolveEffectiveSessionTimeoutMinutes,
  sanitizeAccountSecurityInput,
  validateManualPasswordInput,
  validatePersonalInfoInput,
} from '../utils/profileSecurity';
import {
  formatFirestoreTimestamp,
  recordAuditLog,
} from '../services/firestoreService';

export type AuthDenyReason =
  | null
  | 'uninvited'
  | 'disabled'
  | 'pending'
  | 'unverified'
  | 'session_expired'
  | 'system_lockdown';

export interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  securityPolicy: SecurityPolicySettings;
  linkedProviderIds: string[];
  isEmailVerified: boolean;
  lastIdentityVerifiedAt: number | null;
  isAuthReady: boolean;
  isBusy: boolean;
  denyReason: AuthDenyReason;
  authError: string;
  clearAuthError: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmailPassword: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string>;
  updateOwnDisplayName: (newName: string) => Promise<void>;
  updatePersonalProfileInfo: (input: PersonalInfoUpdateInput) => Promise<void>;
  changeOrSetManualPassword: (params: {
    currentPassword?: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<{ mode: 'updated' | 'linked'; message: string }>;
  updateAccountSecuritySettings: (
    settings: AccountSecurityUpdateInput,
    currentPasswordForReauth?: string
  ) => Promise<void>;
  reauthenticateAccountManually: (currentPassword?: string) => Promise<string>;
  refreshSecuritySessionToken: () => Promise<string>;
  sendVerificationEmailManually: () => Promise<string>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function parseUserProfileDoc(
  uid: string,
  raw: Record<string, unknown>
): UserProfile {
  return {
    uid: String(raw.uid || uid),
    name: String(raw.name || 'مستخدم النظام'),
    email: String(raw.email || ''),
    emailKey: String(raw.emailKey || ''),
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    jobTitle: typeof raw.jobTitle === 'string' ? raw.jobTitle : '',
    department: typeof raw.department === 'string' ? raw.department : '',
    bio: typeof raw.bio === 'string' ? raw.bio : '',
    role: (raw.role as UserProfile['role']) || 'viewer',
    extraPermissions: Array.isArray(raw.extraPermissions)
      ? (raw.extraPermissions as UserProfile['extraPermissions'])
      : [],
    revokedPermissions: Array.isArray(raw.revokedPermissions)
      ? (raw.revokedPermissions as UserProfile['revokedPermissions'])
      : [],
    employeeId: String(raw.employeeId || ''),
    teamId: String(raw.teamId || ''),
    status: (raw.status as UserProfile['status']) || 'pending',
    personalSessionTimeoutMinutes:
      typeof raw.personalSessionTimeoutMinutes === 'number'
        ? raw.personalSessionTimeoutMinutes
        : undefined,
    requireReauthForSensitiveActions:
      typeof raw.requireReauthForSensitiveActions === 'boolean'
        ? raw.requireReauthForSensitiveActions
        : true,
    securityAlertsEnabled:
      typeof raw.securityAlertsEnabled === 'boolean'
        ? raw.securityAlertsEnabled
        : true,
    lastPasswordChangedAt: formatFirestoreTimestamp(raw.lastPasswordChangedAt),
    createdAt: formatFirestoreTimestamp(raw.createdAt),
    updatedAt: formatFirestoreTimestamp(raw.updatedAt),
    lastLoginAt: formatFirestoreTimestamp(raw.lastLoginAt),
  };
}

function mapFirebasePasswordErrorAr(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return 'كلمة المرور الحالية غير صحيحة. يرجى التحقق منها والمحاولة مجدداً.';
  }
  if (code === 'auth/weak-password') {
    return 'كلمة المرور الجديدة ضعيفة. يرجى اختيار كلمة مرور من 8 أحرف على الأقل تتضمن أرقاماً أو رموزاً.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'لدواعي الأمان، يلزم إعادة تأكيد هويتك أولاً (بإدخال كلمة المرور الحالية أو تأكيد نافذة Google) قبل إتمام هذا الإجراء.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'مزود البريد وكلمة المرور (Email/Password) غير مفعل حالياً في إعدادات مشروع Firebase. لتفعيل التعيين اليدوي افتح Firebase Console ← Authentication ← Sign-in method ← فعّل Email/Password.';
  }
  if (code === 'auth/credential-already-in-use' || code === 'auth/provider-already-linked') {
    return 'كلمة المرور مربوطة بالفعل بهذا الحساب. يمكنك تغييرها مباشرة من نموذج التغيير اليدوي.';
  }
  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  ) {
    return 'تم إغلاق نافذة التحقق من الهوية قبل إتمام العملية.';
  }
  if (isBenignAbortError(err)) {
    return 'تم إلغاء الطلب مؤقتاً أثناء تحديث الجلسة. يرجى المحاولة مرة أخرى.';
  }
  if (code === 'auth/too-many-requests') {
    return 'تم إيقاف المحاولات مؤقتاً لحماية الحساب من المحاولات المتكررة. يرجى الانتظار بضع دقائق ثم المحاولة.';
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'تعذر تنفيذ إجراء الأمان المطلوب. يرجى التحقق من الاتصال والمحاولة مرة أخرى.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [linkedProviderIds, setLinkedProviderIds] = useState<string[]>([]);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean>(false);
  const [lastIdentityVerifiedAt, setLastIdentityVerifiedAt] = useState<
    number | null
  >(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [securityPolicy, setSecurityPolicy] = useState<SecurityPolicySettings>(
    DEFAULT_SECURITY_POLICY
  );
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [denyReason, setDenyReason] = useState<AuthDenyReason>(null);
  const [authError, setAuthError] = useState('');
  const loggedSessionUidRef = useRef<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const latestRawProfileRef = useRef<UserProfile | null>(null);
  const latestPolicyRef = useRef<SecurityPolicySettings>(DEFAULT_SECURITY_POLICY);

  const syncFirebaseUserMetadata = useCallback((fbUser: FirebaseUser | null) => {
    setFirebaseUser(fbUser);
    if (!fbUser) {
      setLinkedProviderIds([]);
      setIsEmailVerified(false);
      return;
    }
    const providers = (fbUser.providerData || [])
      .map((p) => p.providerId)
      .filter(Boolean);
    setLinkedProviderIds(providers);
    setIsEmailVerified(Boolean(fbUser.emailVerified));
  }, []);

  useEffect(() => {
    void validateFirestoreConnection().catch(() => {});
  }, []);

  // إدارة تسجيل الدخول المغلق ومزامنة الملف الشخصي اللحظية
  useEffect(() => {
    let isDisposed = false;
    let authCycleId = 0;
    let profileUnsubscribe: (() => void) | null = null;
    let policyUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      const currentCycle = ++authCycleId;
      const isCurrentCycle = () => !isDisposed && currentCycle === authCycleId;

      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }
      if (policyUnsubscribe) {
        policyUnsubscribe();
        policyUnsubscribe = null;
      }

      if (!isCurrentCycle()) return;
      syncFirebaseUserMetadata(fbUser);

      if (!fbUser) {
        latestRawProfileRef.current = null;
        setUserProfile(null);
        setLastIdentityVerifiedAt(null);
        setIsAuthReady(true);
        loggedSessionUidRef.current = null;
        return;
      }

      const rawEmail = (fbUser.email || '').trim();
      const lowerEmail = rawEmail.toLowerCase();
      const emailKey = normalizeEmailToKey(lowerEmail);

      if (!rawEmail) {
        setDenyReason('uninvited');
        setUserProfile(null);
        setIsAuthReady(true);
        return;
      }

      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const existingSnap = await getDoc(userRef);

        if (!existingSnap.exists()) {
          // الحالة 1: الحساب التأسيسي الأول لمدير النظام المعتمد
          if (lowerEmail === BOOTSTRAPPED_SUPER_ADMIN_EMAIL && fbUser.emailVerified) {
            const rawDisplay = (fbUser.displayName || 'مدير النظام الرئيسي').trim();
            const safeName =
              rawDisplay.length >= 2 ? rawDisplay.slice(0, 120) : 'مدير النظام';
            await setDoc(userRef, {
              uid: fbUser.uid,
              name: safeName,
              email: rawEmail,
              emailKey,
              role: 'super_admin',
              extraPermissions: [],
              revokedPermissions: [],
              employeeId: '',
              teamId: '',
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            });

            // تهيئة وثيقة إعدادات الأمان الافتراضية إن لم تكن موجودة
            const polRef = doc(db, 'securitySettings', 'global');
            const polSnap = await getDoc(polRef);
            if (!polSnap.exists()) {
              await setDoc(polRef, {
                policyId: 'global',
                allowSupervisorLeaveRecommendation: true,
                allowViewerExport: true,
                allowOpsIntegrationSync: false,
                enforceAdminMfaNotice: true,
                emergencyReadOnlyMode: false,
                systemLockdownMode: false,
                lockdownMessage: DEFAULT_SECURITY_POLICY.lockdownMessage,
                autoProvisionWithoutInvite: true,
                autoProvisionDefaultRole: 'viewer',
                autoProvisionDefaultStatus: 'active',
                opsGrantedPerms: [],
                opsRevokedPerms: [],
                supGrantedPerms: [],
                supRevokedPerms: [],
                repGrantedPerms: [],
                repRevokedPerms: [],
                viewerGrantedPerms: [],
                viewerRevokedPerms: [],
                sessionTimeoutMinutes: 60,
                externalSyncEndpoint: '',
                lastExternalSyncStatus: 'جاهز للمزامنة الآمنة',
                lastExternalSyncImported: 0,
                lastExternalSyncFailed: 0,
                lastExternalSyncTime: '—',
                updatedBy: fbUser.uid,
                updatedAt: serverTimestamp(),
              });
            }
          } else {
            // الحالة 2: التحقق من البريد ثم التخصيص المسبق أو التسجيل التلقائي المباشر بدون دعوة
            if (!fbUser.emailVerified) {
              setDenyReason('unverified');
              setUserProfile(null);
              setIsAuthReady(true);
              return;
            }

            const invRef = doc(db, 'preprovisionedUsers', emailKey);
            const invSnap = await getDoc(invRef);

            if (invSnap.exists()) {
              const invData = invSnap.data();
              if (invData.status === 'disabled') {
                setDenyReason('disabled');
                setUserProfile(null);
                setIsAuthReady(true);
                return;
              }
              if (invData.status === 'pending') {
                setDenyReason('pending');
                setUserProfile(null);
                setIsAuthReady(true);
                return;
              }

              const invName = String(
                invData.name || fbUser.displayName || 'مستخدم النظام'
              ).trim();
              const safeName =
                invName.length >= 2 ? invName.slice(0, 120) : 'مستخدم النظام';

              await setDoc(userRef, {
                uid: fbUser.uid,
                name: safeName,
                email: rawEmail,
                emailKey,
                role: invData.role,
                extraPermissions: Array.isArray(invData.extraPermissions)
                  ? invData.extraPermissions
                  : [],
                revokedPermissions: Array.isArray(invData.revokedPermissions)
                  ? invData.revokedPermissions
                  : [],
                employeeId: String(invData.employeeId || ''),
                teamId: String(invData.teamId || ''),
                status: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
              });

              if (invData.role === 'delivery_rep' && invData.employeeId) {
                try {
                  const empRef = doc(db, 'employees', String(invData.employeeId));
                  const empSnap = await getDoc(empRef);
                  if (empSnap.exists() && !empSnap.data().userId) {
                    await updateDoc(empRef, {
                      userId: fbUser.uid,
                      updatedAt: serverTimestamp(),
                    });
                  }
                } catch {
                  // الربط قد يكون تم مسبقاً من قبل مدير النظام
                }
              }
            } else {
              const polRef = doc(db, 'securitySettings', 'global');
              const polSnap = await getDoc(polRef);
              const polData = polSnap.exists() ? polSnap.data() : null;
              const autoAllowed =
                !polData || polData.autoProvisionWithoutInvite !== false;

              if (!autoAllowed) {
                setDenyReason('uninvited');
                setUserProfile(null);
                setIsAuthReady(true);
                return;
              }

              const allowedAutoRoles = [
                'operations_manager',
                'supervisor',
                'delivery_rep',
                'viewer',
              ];
              const defaultRole =
                polData &&
                typeof polData.autoProvisionDefaultRole === 'string' &&
                allowedAutoRoles.includes(polData.autoProvisionDefaultRole)
                  ? polData.autoProvisionDefaultRole
                  : 'viewer';

              const defaultStatus =
                polData && polData.autoProvisionDefaultStatus === 'pending'
                  ? 'pending'
                  : 'active';

              const rawDisplay = (
                fbUser.displayName ||
                rawEmail.split('@')[0] ||
                'مستخدم النظام'
              ).trim();
              const safeName =
                rawDisplay.length >= 2 ? rawDisplay.slice(0, 120) : 'مستخدم النظام';

              await setDoc(userRef, {
                uid: fbUser.uid,
                name: safeName,
                email: rawEmail,
                emailKey,
                role: defaultRole,
                extraPermissions: [],
                revokedPermissions: [],
                employeeId: '',
                teamId: '',
                status: defaultStatus,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
              });
            }
          }
        }

        profileUnsubscribe = onSnapshot(
          userRef,
          async (docSnap) => {
            if (!docSnap.exists()) {
              setDenyReason('uninvited');
              setUserProfile(null);
              setIsAuthReady(true);
              return;
            }

            const parsed = parseUserProfileDoc(fbUser.uid, docSnap.data());
            latestRawProfileRef.current = parsed;

            if (parsed.status === 'disabled') {
              setDenyReason('disabled');
              setUserProfile(null);
              setIsAuthReady(true);
              return;
            }
            if (parsed.status === 'pending') {
              setDenyReason('pending');
              setUserProfile(null);
              setIsAuthReady(true);
              return;
            }
            if (
              latestPolicyRef.current.systemLockdownMode &&
              parsed.role !== 'super_admin'
            ) {
              setDenyReason('system_lockdown');
              setUserProfile(null);
              setIsAuthReady(true);
              return;
            }

            setDenyReason(null);
            setUserProfile(parsed);
            setIsAuthReady(true);

            if (loggedSessionUidRef.current !== fbUser.uid) {
              loggedSessionUidRef.current = fbUser.uid;
              setLastIdentityVerifiedAt(Date.now());
              try {
                await updateDoc(userRef, {
                  name: parsed.name,
                  lastLoginAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } catch {
                // تجاهل خطأ التحديث المتزامن الطفيف
              }
              await recordAuditLog({
                actor: parsed,
                category: 'security',
                action: 'تسجيل دخول ناجح للنظام',
                targetType: 'session',
                targetId: fbUser.uid,
                afterSummary: `البريد: ${parsed.email} | الدور: ${parsed.role}`,
              });
            }
          },
          () => {
            setDenyReason('uninvited');
            setUserProfile(null);
            setIsAuthReady(true);
          }
        );

        policyUnsubscribe = onSnapshot(
          doc(db, 'securitySettings', 'global'),
          (polSnap) => {
            if (polSnap.exists()) {
              const d = polSnap.data();
              const parsePermArr = (val: unknown): PermissionKey[] =>
                Array.isArray(val) ? (val as PermissionKey[]) : [];

              const nextPolicy: SecurityPolicySettings = {
                policyId: 'global',
                allowSupervisorLeaveRecommendation:
                  d.allowSupervisorLeaveRecommendation !== false,
                allowViewerExport: d.allowViewerExport !== false,
                allowOpsIntegrationSync: Boolean(d.allowOpsIntegrationSync),
                enforceAdminMfaNotice: d.enforceAdminMfaNotice !== false,
                emergencyReadOnlyMode: Boolean(d.emergencyReadOnlyMode),
                systemLockdownMode: Boolean(d.systemLockdownMode),
                lockdownMessage: String(
                  d.lockdownMessage || DEFAULT_SECURITY_POLICY.lockdownMessage
                ),
                autoProvisionWithoutInvite: d.autoProvisionWithoutInvite !== false,
                autoProvisionDefaultRole: (
                  [
                    'operations_manager',
                    'supervisor',
                    'delivery_rep',
                    'viewer',
                  ].includes(String(d.autoProvisionDefaultRole || ''))
                    ? d.autoProvisionDefaultRole
                    : 'viewer'
                ) as SecurityPolicySettings['autoProvisionDefaultRole'],
                autoProvisionDefaultStatus:
                  d.autoProvisionDefaultStatus === 'pending' ? 'pending' : 'active',
                opsGrantedPerms: parsePermArr(d.opsGrantedPerms),
                opsRevokedPerms: parsePermArr(d.opsRevokedPerms),
                supGrantedPerms: parsePermArr(d.supGrantedPerms),
                supRevokedPerms: parsePermArr(d.supRevokedPerms),
                repGrantedPerms: parsePermArr(d.repGrantedPerms),
                repRevokedPerms: parsePermArr(d.repRevokedPerms),
                viewerGrantedPerms: parsePermArr(d.viewerGrantedPerms),
                viewerRevokedPerms: parsePermArr(d.viewerRevokedPerms),
                sessionTimeoutMinutes: Number(d.sessionTimeoutMinutes) || 60,
                externalSyncEndpoint: String(d.externalSyncEndpoint || ''),
                lastExternalSyncStatus: String(
                  d.lastExternalSyncStatus || 'جاهز للمزامنة الآمنة'
                ),
                lastExternalSyncImported: Number(d.lastExternalSyncImported) || 0,
                lastExternalSyncFailed: Number(d.lastExternalSyncFailed) || 0,
                lastExternalSyncTime: String(d.lastExternalSyncTime || '—'),
                updatedBy: String(d.updatedBy || 'system'),
                updatedAt: formatFirestoreTimestamp(d.updatedAt),
              };

              latestPolicyRef.current = nextPolicy;
              setSecurityPolicy(nextPolicy);

              const activeRaw = latestRawProfileRef.current;
              if (activeRaw && activeRaw.status === 'active') {
                if (
                  nextPolicy.systemLockdownMode &&
                  activeRaw.role !== 'super_admin'
                ) {
                  setDenyReason('system_lockdown');
                  setUserProfile(null);
                } else if (!nextPolicy.systemLockdownMode) {
                  setDenyReason((prev) =>
                    prev === 'system_lockdown' ? null : prev
                  );
                  setUserProfile(activeRaw);
                }
              }
            }
          },
          () => {
            // الاحتفاظ بالسياسة الافتراضية
          }
        );
      } catch (err) {
        if (isBenignAbortError(err) || !isCurrentCycle()) {
          return;
        }
        console.error('Auth verification error:', err);
        setAuthError(
          'تعذر التحقق من صلاحيات الحساب في قاعدة البيانات السحابية. يرجى المحاولة مجدداً.'
        );
        setUserProfile(null);
        setIsAuthReady(true);
      }
    });

    return () => {
      isDisposed = true;
      authCycleId++;
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
      if (policyUnsubscribe) policyUnsubscribe();
    };
  }, [syncFirebaseUserMetadata]);

  // حماية انتهاء الجلسة تلقائياً وفق المهلة الفعلية (تفضيل المستخدم الشخصي من داخل ملفه الشخصي + سقف الأمان العام)
  useEffect(() => {
    if (!userProfile) return;

    const effectiveMinutes = resolveEffectiveSessionTimeoutMinutes(
      userProfile,
      securityPolicy
    );

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousedown', resetTimer, { passive: true });
    window.addEventListener('keydown', resetTimer, { passive: true });
    window.addEventListener('touchstart', resetTimer, { passive: true });

    const interval = setInterval(async () => {
      const timeoutMs = effectiveMinutes * 60 * 1000;
      if (Date.now() - lastActivityRef.current > timeoutMs) {
        await recordAuditLog({
          actor: userProfile,
          category: 'security',
          action: 'إنهاء الجلسة تلقائياً لانتهاء المهلة',
          targetType: 'session',
          targetId: userProfile.uid,
          reason: `تجاوز مهلة عدم النشاط المعتمدة (${effectiveMinutes} دقيقة)`,
        });
        setDenyReason('session_expired');
        await signOut(auth);
      }
    }, 30_000);

    return () => {
      window.removeEventListener('mousedown', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
      clearInterval(interval);
    };
  }, [userProfile, securityPolicy]);

  const clearAuthError = useCallback(() => {
    setAuthError('');
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setIsBusy(true);
    setAuthError('');
    setDenyReason(null);
    try {
      await signInWithPopup(auth, googleProvider);
      lastActivityRef.current = Date.now();
      setLastIdentityVerifiedAt(Date.now());
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (isBenignAbortError(err) || code === 'auth/cancelled-popup-request') {
        return;
      }
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('تم إغلاق نافذة تسجيل الدخول قبل إتمام المصادقة.');
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          'النطاق الحالي غير مضاف بعد إلى النطاقات المصرح بها (Authorized Domains) في إعدادات Firebase Authentication.'
        );
      } else {
        setAuthError('تعذر تسجيل الدخول عبر Google. تحقق من اتصالك وحاول مجدداً.');
      }
    } finally {
      setIsBusy(false);
    }
  }, []);

  const loginWithEmailPassword = useCallback(
    async (email: string, password: string) => {
      setIsBusy(true);
      setAuthError('');
      setDenyReason(null);
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        lastActivityRef.current = Date.now();
        setLastIdentityVerifiedAt(Date.now());
      } catch (err: unknown) {
        if (isBenignAbortError(err)) {
          return;
        }
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/operation-not-allowed') {
          setAuthError(
            'تسجيل الدخول بالبريد وكلمة المرور غير مفعل حالياً في Firebase Console. يمكنك استخدام زر الدخول بحساب Google المعتمد أو تفعيل Email/Password من لوحة تحكم Firebase.'
          );
        } else if (
          code === 'auth/invalid-credential' ||
          code === 'auth/wrong-password' ||
          code === 'auth/user-not-found'
        ) {
          setAuthError('بيانات البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        } else if (code === 'auth/too-many-requests') {
          setAuthError(
            'تم إيقاف المحاولات مؤقتاً لحماية الحساب من التخمين المتكرر. يرجى المحاولة بعد دقائق.'
          );
        } else {
          setAuthError(
            'تعذر إتمام تسجيل الدخول. يرجى التحقق من البيانات والمحاولة مرة أخرى.'
          );
        }
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  const requestPasswordReset = useCallback(async (email: string): Promise<string> => {
    const clean = email.trim();
    if (!clean) {
      throw new Error('يرجى إدخال البريد الإلكتروني أولاً.');
    }
    try {
      await sendPasswordResetEmail(auth, clean);
      return 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح.';
    } catch (err: unknown) {
      if (isBenignAbortError(err)) {
        return 'تم إلغاء الطلب مؤقتاً. يرجى المحاولة مرة أخرى.';
      }
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        throw new Error(
          'مزود البريد وكلمة المرور غير مفعل حالياً في Firebase Console، أو أن الحساب يعتمد على مصادقة Google فقط.'
        );
      }
      throw new Error('تعذر إرسال رابط إعادة التعيين. تحقق من صحة البريد الإلكتروني.');
    }
  }, []);

  // 1. تحديث المعلومات الشخصية يدوياً من داخل الملف الشخصي
  const updatePersonalProfileInfo = useCallback(
    async (input: PersonalInfoUpdateInput) => {
      if (!userProfile) {
        throw new Error('لا توجد جلسة مستخدم نشطة.');
      }
      const check = validatePersonalInfoInput(input);
      if (!check.valid) {
        throw new Error(check.errorAr || 'البيانات الشخصية المدخلة غير صالحة.');
      }

      const path = `users/${userProfile.uid}`;
      const beforeSummary = `الاسم: ${userProfile.name} | الهاتف: ${userProfile.phone || '—'} | المسمى: ${userProfile.jobTitle || '—'}`;
      const afterSummary = `الاسم: ${check.sanitized.name} | الهاتف: ${check.sanitized.phone || '—'} | المسمى: ${check.sanitized.jobTitle || '—'}`;

      try {
        await updateDoc(doc(db, 'users', userProfile.uid), {
          name: check.sanitized.name,
          phone: check.sanitized.phone,
          jobTitle: check.sanitized.jobTitle,
          department: check.sanitized.department,
          bio: check.sanitized.bio,
          updatedAt: serverTimestamp(),
        });

        if (auth.currentUser && auth.currentUser.displayName !== check.sanitized.name) {
          try {
            await updateProfile(auth.currentUser, {
              displayName: check.sanitized.name,
            });
          } catch {
            // لا نمنع نجاح تحديث قاعدة البيانات إذا تعذر تحديث اسم العرض الاختياري في الرمز
          }
        }

        await recordAuditLog({
          actor: { ...userProfile, name: check.sanitized.name },
          category: 'security',
          action: 'تحديث المعلومات الشخصية يدوياً من الملف الشخصي',
          targetType: 'user_profile',
          targetId: userProfile.uid,
          beforeSummary,
          afterSummary,
          reason: 'تعديل يدوي بواسطة صاحب الحساب من داخل الملف الشخصي',
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [userProfile]
  );

  const updateOwnDisplayName = useCallback(
    async (newName: string) => {
      if (!userProfile) return;
      await updatePersonalProfileInfo({
        name: newName,
        phone: userProfile.phone || '',
        jobTitle: userProfile.jobTitle || '',
        department: userProfile.department || '',
        bio: userProfile.bio || '',
      });
    },
    [userProfile, updatePersonalProfileInfo]
  );

  // إعادة التحقق الأمني اليدوي من الهوية
  const reauthenticateAccountManually = useCallback(
    async (currentPassword?: string): Promise<string> => {
      const fbUser = auth.currentUser;
      if (!fbUser || !userProfile) {
        throw new Error('لا توجد جلسة مصادقة نشطة حالياً.');
      }

      const providers = (fbUser.providerData || []).map((p) => p.providerId);
      const hasPassword = providers.includes('password');

      try {
        if (hasPassword && currentPassword && currentPassword.trim()) {
          const cred = EmailAuthProvider.credential(
            fbUser.email || userProfile.email,
            currentPassword
          );
          await reauthenticateWithCredential(fbUser, cred);
        } else if (providers.includes('google.com')) {
          await reauthenticateWithPopup(fbUser, googleProvider);
        } else if (hasPassword) {
          throw new Error(
            'يرجى إدخال كلمة المرور الحالية لإتمام إعادة التحقق من الهوية.'
          );
        } else {
          await fbUser.getIdToken(true);
        }

        setLastIdentityVerifiedAt(Date.now());
        syncFirebaseUserMetadata(auth.currentUser);

        await recordAuditLog({
          actor: userProfile,
          category: 'security',
          action: 'إعادة التحقق الأمني من الهوية يدوياً',
          targetType: 'session',
          targetId: userProfile.uid,
          afterSummary: 'تم تأكيد ملكية الحساب بنجاح للعمليات الحساسة',
        });

        return 'تم تأكيد هويتك الأمنية بنجاح. يمكنك الآن تنفيذ الإجراءات الحساسة.';
      } catch (err) {
        throw new Error(mapFirebasePasswordErrorAr(err));
      }
    },
    [userProfile, syncFirebaseUserMetadata]
  );

  // 2. تغيير كلمة المرور يدوياً أو تعيين كلمة مرور يدوية جديدة لحساب Google
  const changeOrSetManualPassword = useCallback(
    async (params: {
      currentPassword?: string;
      newPassword: string;
      confirmPassword: string;
    }): Promise<{ mode: 'updated' | 'linked'; message: string }> => {
      const fbUser = auth.currentUser;
      if (!fbUser || !userProfile) {
        throw new Error('لا توجد جلسة مستخدم نشطة.');
      }

      const providers = (fbUser.providerData || []).map((p) => p.providerId);
      const hasPasswordProvider = providers.includes('password');

      const validation = validateManualPasswordInput({
        requiresCurrentPassword: hasPasswordProvider,
        currentPassword: params.currentPassword,
        newPassword: params.newPassword,
        confirmPassword: params.confirmPassword,
      });

      if (!validation.valid) {
        throw new Error(validation.errorAr || 'بيانات كلمة المرور غير صالحة.');
      }

      try {
        if (hasPasswordProvider) {
          const credential = EmailAuthProvider.credential(
            fbUser.email || userProfile.email,
            params.currentPassword || ''
          );
          await reauthenticateWithCredential(fbUser, credential);
          await updatePassword(fbUser, params.newPassword);
        } else {
          const credential = EmailAuthProvider.credential(
            fbUser.email || userProfile.email,
            params.newPassword
          );
          try {
            await linkWithCredential(fbUser, credential);
          } catch (linkErr: unknown) {
            const linkCode = (linkErr as { code?: string })?.code || '';
            if (
              linkCode === 'auth/requires-recent-login' &&
              providers.includes('google.com')
            ) {
              await reauthenticateWithPopup(fbUser, googleProvider);
              await linkWithCredential(fbUser, credential);
            } else {
              throw linkErr;
            }
          }
        }

        await fbUser.reload();
        syncFirebaseUserMetadata(auth.currentUser);
        setLastIdentityVerifiedAt(Date.now());

        const path = `users/${userProfile.uid}`;
        try {
          await updateDoc(doc(db, 'users', userProfile.uid), {
            lastPasswordChangedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.UPDATE, path);
        }

        await recordAuditLog({
          actor: userProfile,
          category: 'security',
          action: hasPasswordProvider
            ? 'تغيير كلمة المرور يدوياً من الملف الشخصي'
            : 'تعيين وربط كلمة مرور يدوية بالحساب',
          targetType: 'user_credentials',
          targetId: userProfile.uid,
          afterSummary: hasPasswordProvider
            ? 'تم تحديث كلمة المرور وتوثيق ختم التغيير بنجاح'
            : 'تم تفعيل الدخول بالبريد وكلمة المرور جنباً إلى جنب مع حساب Google',
          reason: 'إجراء أمني يدوي من داخل الملف الشخصي',
        });

        return {
          mode: hasPasswordProvider ? 'updated' : 'linked',
          message: hasPasswordProvider
            ? 'تم تغيير كلمة المرور يدوياً وتحديث بيانات الأمان بنجاح.'
            : 'تم تعيين كلمة مرور يدوية لحسابك بنجاح؛ يمكنك الآن الدخول بالبريد وكلمة المرور أو عبر Google.',
        };
      } catch (err) {
        throw new Error(mapFirebasePasswordErrorAr(err));
      }
    },
    [userProfile, syncFirebaseUserMetadata]
  );

  // 3. تحديث إجراءات أمان الحساب وحماية الجلسة يدوياً
  const updateAccountSecuritySettings = useCallback(
    async (
      settings: AccountSecurityUpdateInput,
      currentPasswordForReauth?: string
    ) => {
      const fbUser = auth.currentUser;
      if (!fbUser || !userProfile) {
        throw new Error('لا توجد جلسة مستخدم نشطة.');
      }

      const sanitized = sanitizeAccountSecurityInput(settings);
      const wasReauthRequired = userProfile.requireReauthForSensitiveActions !== false;
      const isLoweringProtection =
        (wasReauthRequired && !sanitized.requireReauthForSensitiveActions) ||
        (userProfile.securityAlertsEnabled !== false &&
          !sanitized.securityAlertsEnabled);

      const recentlyVerified =
        lastIdentityVerifiedAt !== null &&
        Date.now() - lastIdentityVerifiedAt < 10 * 60 * 1000;

      if (wasReauthRequired && isLoweringProtection && !recentlyVerified) {
        const providers = (fbUser.providerData || []).map((p) => p.providerId);
        if (providers.includes('password')) {
          if (!currentPasswordForReauth || !currentPasswordForReauth.trim()) {
            throw new Error(
              'لتخفيف قيود التحقق أو إيقاف التنبيهات الأمنية، يرجى إدخال كلمة المرور الحالية أو الضغط على زر إعادة التحقق من الهوية أولاً.'
            );
          }
          try {
            const cred = EmailAuthProvider.credential(
              fbUser.email || userProfile.email,
              currentPasswordForReauth
            );
            await reauthenticateWithCredential(fbUser, cred);
            setLastIdentityVerifiedAt(Date.now());
          } catch (reauthErr) {
            throw new Error(mapFirebasePasswordErrorAr(reauthErr));
          }
        } else if (providers.includes('google.com')) {
          try {
            await reauthenticateWithPopup(fbUser, googleProvider);
            setLastIdentityVerifiedAt(Date.now());
          } catch (reauthErr) {
            throw new Error(mapFirebasePasswordErrorAr(reauthErr));
          }
        }
      }

      const path = `users/${userProfile.uid}`;
      try {
        await updateDoc(doc(db, 'users', userProfile.uid), {
          personalSessionTimeoutMinutes: sanitized.personalSessionTimeoutMinutes,
          requireReauthForSensitiveActions:
            sanitized.requireReauthForSensitiveActions,
          securityAlertsEnabled: sanitized.securityAlertsEnabled,
          updatedAt: serverTimestamp(),
        });

        lastActivityRef.current = Date.now();

        await recordAuditLog({
          actor: userProfile,
          category: 'security',
          action: 'تعديل إجراءات أمان الحساب يدوياً من الملف الشخصي',
          targetType: 'user_security_preferences',
          targetId: userProfile.uid,
          beforeSummary: `مهلة الخمول: ${userProfile.personalSessionTimeoutMinutes ?? securityPolicy.sessionTimeoutMinutes} د | شرط التحقق: ${wasReauthRequired ? 'مفعل' : 'متوقف'}`,
          afterSummary: `مهلة الخمول: ${sanitized.personalSessionTimeoutMinutes} د | شرط التحقق: ${sanitized.requireReauthForSensitiveActions ? 'مفعل' : 'متوقف'} | التنبيهات: ${sanitized.securityAlertsEnabled ? 'مفعلة' : 'متوقفة'}`,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [userProfile, securityPolicy.sessionTimeoutMinutes, lastIdentityVerifiedAt]
  );

  // تحديث رمز الجلسة الأمني يدوياً
  const refreshSecuritySessionToken = useCallback(async (): Promise<string> => {
    const fbUser = auth.currentUser;
    if (!fbUser || !userProfile) {
      throw new Error('لا توجد جلسة نشطة لتحديث رمزها.');
    }
    try {
      await fbUser.reload();
      await fbUser.getIdToken(true);
      syncFirebaseUserMetadata(auth.currentUser);
      lastActivityRef.current = Date.now();

      await recordAuditLog({
        actor: userProfile,
        category: 'security',
        action: 'تحديث رمز المصادقة الأمني للجلسة يدوياً',
        targetType: 'session',
        targetId: userProfile.uid,
      });

      return 'تم تحديث رمز المصادقة الأمني ومزامنة حالة التحقق للجلسة الحالية بنجاح.';
    } catch (err) {
      throw new Error(mapFirebasePasswordErrorAr(err));
    }
  }, [userProfile, syncFirebaseUserMetadata]);

  // إرسال رسالة تأكيد البريد الإلكتروني يدوياً إن لم يكن موثقاً
  const sendVerificationEmailManually = useCallback(async (): Promise<string> => {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      throw new Error('لا توجد جلسة نشطة.');
    }
    if (fbUser.emailVerified) {
      return 'بريدك الإلكتروني موثق ومؤكد بالفعل.';
    }
    try {
      await sendEmailVerification(fbUser);
      return 'تم إرسال رابط تأكيد البريد الإلكتروني إلى صندوق الوارد الخاص بك.';
    } catch (err) {
      throw new Error(mapFirebasePasswordErrorAr(err));
    }
  }, []);

  const logout = useCallback(async () => {
    if (userProfile) {
      await recordAuditLog({
        actor: userProfile,
        category: 'security',
        action: 'تسجيل خروج من النظام',
        targetType: 'session',
        targetId: userProfile.uid,
      });
    }
    loggedSessionUidRef.current = null;
    setDenyReason(null);
    await signOut(auth);
  }, [userProfile]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        securityPolicy,
        linkedProviderIds,
        isEmailVerified,
        lastIdentityVerifiedAt,
        isAuthReady,
        isBusy,
        denyReason,
        authError,
        clearAuthError,
        loginWithGoogle,
        loginWithEmailPassword,
        requestPasswordReset,
        updateOwnDisplayName,
        updatePersonalProfileInfo,
        changeOrSetManualPassword,
        updateAccountSecuritySettings,
        reauthenticateAccountManually,
        refreshSecuritySessionToken,
        sendVerificationEmailManually,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
