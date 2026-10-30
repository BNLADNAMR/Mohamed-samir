import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
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
  normalizeEmailToKey,
  validateFirestoreConnection,
} from '../firebase';
import { PermissionKey, SecurityPolicySettings, UserProfile } from '../types';
import {
  BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
  DEFAULT_SECURITY_POLICY,
} from '../utils/rbac';
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

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  securityPolicy: SecurityPolicySettings;
  isAuthReady: boolean;
  isBusy: boolean;
  denyReason: AuthDenyReason;
  authError: string;
  clearAuthError: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmailPassword: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string>;
  updateOwnDisplayName: (newName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseUserProfileDoc(uid: string, raw: Record<string, unknown>): UserProfile {
  return {
    uid: String(raw.uid || uid),
    name: String(raw.name || 'مستخدم النظام'),
    email: String(raw.email || ''),
    emailKey: String(raw.emailKey || ''),
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
    createdAt: formatFirestoreTimestamp(raw.createdAt),
    updatedAt: formatFirestoreTimestamp(raw.updatedAt),
    lastLoginAt: formatFirestoreTimestamp(raw.lastLoginAt),
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
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

  useEffect(() => {
    validateFirestoreConnection();
  }, []);

  // إدارة تسجيل الدخول المغلق ومزامنة الملف الشخصي اللحظية
  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;
    let policyUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }
      if (policyUnsubscribe) {
        policyUnsubscribe();
        policyUnsubscribe = null;
      }

      setFirebaseUser(fbUser);

      if (!fbUser) {
        latestRawProfileRef.current = null;
        setUserProfile(null);
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
            const safeName = rawDisplay.length >= 2 ? rawDisplay.slice(0, 120) : 'مدير النظام';
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

              const invName = String(invData.name || fbUser.displayName || 'مستخدم النظام').trim();
              const safeName = invName.length >= 2 ? invName.slice(0, 120) : 'مستخدم النظام';

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

              // ربط سجل المندوب تلقائياً بحساب المستخدم عند أول دخول دون إنشاء سجل مكرر
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
              // التسجيل التلقائي الفوري بدون دعوة مسبقة حتى يتمكن مدير النظام (Super Admin) من تعديل صلاحياته مباشرة
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

        // متابعة لحظية لحالة الحساب في قاعدة البيانات (التعطيل الفوري عند تغيير الحالة من قبل الإدارة)
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

            // تسجيل الدخول وتحديث آخر ظهور مرة واحدة لكل جلسة
            if (loggedSessionUidRef.current !== fbUser.uid) {
              loggedSessionUidRef.current = fbUser.uid;
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

        // متابعة لحظية لإعدادات الأمان العامة وتطبيق أوامر الطوارئ فوراً
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
                  ['operations_manager', 'supervisor', 'delivery_rep', 'viewer'].includes(
                    String(d.autoProvisionDefaultRole || '')
                  )
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
            // الاحتفاظ بالسياسة الافتراضية في حال عدم تهيئة الوثيقة بعد
          }
        );
      } catch (err) {
        console.error('Auth verification error:', err);
        setAuthError(
          'تعذر التحقق من صلاحيات الحساب في قاعدة البيانات السحابية. يرجى المحاولة مجدداً.'
        );
        setUserProfile(null);
        setIsAuthReady(true);
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
      if (policyUnsubscribe) policyUnsubscribe();
    };
  }, []);

  // حماية انتهاء الجلسة تلقائياً بعد فترة الخمول المحددة في سياسة الأمان
  useEffect(() => {
    if (!userProfile) return;

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousedown', resetTimer, { passive: true });
    window.addEventListener('keydown', resetTimer, { passive: true });
    window.addEventListener('touchstart', resetTimer, { passive: true });

    const interval = setInterval(async () => {
      const timeoutMs =
        Math.max(5, securityPolicy.sessionTimeoutMinutes || 60) * 60 * 1000;
      if (Date.now() - lastActivityRef.current > timeoutMs) {
        await recordAuditLog({
          actor: userProfile,
          category: 'security',
          action: 'إنهاء الجلسة تلقائياً لانتهاء المهلة',
          targetType: 'session',
          targetId: userProfile.uid,
          reason: `تجاوز مهلة عدم النشاط (${securityPolicy.sessionTimeoutMinutes} دقيقة)`,
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
  }, [userProfile, securityPolicy.sessionTimeoutMinutes]);

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
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
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
      } catch (err: unknown) {
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
          setAuthError('تعذر إتمام تسجيل الدخول. يرجى التحقق من البيانات والمحاولة مرة أخرى.');
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
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        throw new Error(
          'هذا الحساب يستخدم مصادقة Google الآمنة ولا يتطلب كلمة مرور منفصلة، أو يلزم تفعيل مزود Email/Password في Firebase Console.'
        );
      }
      throw new Error('تعذر إرسال رابط إعادة التعيين. تحقق من صحة البريد الإلكتروني.');
    }
  }, []);

  const updateOwnDisplayName = useCallback(
    async (newName: string) => {
      if (!userProfile) return;
      const trimmed = newName.trim().slice(0, 120);
      if (trimmed.length < 2) {
        throw new Error('يجب أن يتكون الاسم من حرفين على الأقل.');
      }
      await updateDoc(doc(db, 'users', userProfile.uid), {
        name: trimmed,
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [userProfile]
  );

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
        isAuthReady,
        isBusy,
        denyReason,
        authError,
        clearAuthError,
        loginWithGoogle,
        loginWithEmailPassword,
        requestPasswordReset,
        updateOwnDisplayName,
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
