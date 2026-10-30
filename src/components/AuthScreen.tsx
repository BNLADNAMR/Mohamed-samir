import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  AlertTriangle,
  LogOut,
  KeyRound,
  Sun,
  Moon,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthScreenProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  isDarkMode,
  onToggleDarkMode,
}) => {
  const {
    firebaseUser,
    securityPolicy,
    isBusy,
    denyReason,
    authError,
    clearAuthError,
    loginWithGoogle,
    loginWithEmailPassword,
    requestPasswordReset,
    logout,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [resetStatus, setResetStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetStatus(null);
    if (!email.trim() || !password) return;
    await loginWithEmailPassword(email, password);
  };

  const handleResetPassword = async () => {
    clearAuthError();
    setResetStatus(null);
    try {
      const msg = await requestPasswordReset(email);
      setResetStatus({ type: 'success', message: msg });
    } catch (err) {
      setResetStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر إرسال رابط إعادة التعيين.',
      });
    }
  };

  const hasAuthSubState =
    showEmailForm ||
    Boolean(firebaseUser) ||
    Boolean(authError) ||
    Boolean(resetStatus);

  const handleAuthBack = async () => {
    if (showEmailForm) {
      setShowEmailForm(false);
      setResetStatus(null);
      clearAuthError();
      return;
    }
    if (resetStatus || authError) {
      setResetStatus(null);
      clearAuthError();
      return;
    }
    if (firebaseUser) {
      await logout();
      return;
    }
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      {/* شريط علوي متسق مع هوية التطبيق وزر الرجوع للخلف */}
      <header className="sticky top-0 z-30 bg-slate-900 dark:bg-slate-950 text-white border-b border-slate-800 px-6 py-3.5">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAuthBack}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="الرجوع للخلف"
            >
              <ArrowRight className="w-4 h-4 text-indigo-400" />
              <span>رجوع للخلف</span>
            </button>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span className="text-base font-extrabold tracking-tight">
                نظام متابعة الشفتات وأداء المندوبين
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="min-h-[40px] border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            {isDarkMode ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                الوضع الفاتح
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                الوضع الداكن
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-slate-900 dark:bg-slate-950 px-6 py-5 border-b border-slate-800 text-white">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold mb-1">
              <Lock className="w-3.5 h-3.5" />
              بوابة الدخول الآمن (RBAC)
            </div>
            <h1 className="text-lg font-extrabold">تسجيل الدخول إلى النظام</h1>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              سجّل دخولك مباشرة بحساب Google الموثق دون الحاجة إلى دعوة مسبقة، وتُضبط صلاحياتك ونطاق فريقك تلقائياً وبشكل فوري بواسطة مدير النظام.
            </p>
          </div>

          <div className="p-6 space-y-4 text-xs">
            {hasAuthSubState && (
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleAuthBack}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>رجوع للخلف</span>
                </button>
                <span className="text-[11px] text-slate-400">
                  العودة لشاشة الدخول الرئيسية
                </span>
              </div>
            )}
            {/* رسائل منع الوصول للحسابات غير المصرح بها أو المعطلة */}
            {denyReason === 'uninvited' && firebaseUser && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  التسجيل العام مغلق — حساب غير مصرح له
                </div>
                <p className="leading-relaxed">
                  البريد الإلكتروني{' '}
                  <strong className="font-mono" dir="ltr">
                    {firebaseUser.email}
                  </strong>{' '}
                  غير مدرج ضمن قائمة المستخدمين المعتمدين في النظام. يرجى مراجعة مدير النظام لإضافة حسابك وتحديد دورك الوظيفي أولاً.
                </p>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full py-2 px-3 bg-rose-700 hover:bg-rose-600 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  تسجيل الخروج والتبديل إلى حساب آخر
                </button>
              </div>
            )}

            {denyReason === 'disabled' && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  تم تعطيل هذا الحساب
                </div>
                <p className="leading-relaxed">
                  تم إيقاف صلاحية دخول هذا الحساب من قبل إدارة النظام. لا يمكنك استعراض أو تعديل أي بيانات حالياً.
                </p>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-2 px-3 bg-rose-700 hover:bg-rose-600 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    تسجيل الخروج
                  </button>
                )}
              </div>
            )}

            {denyReason === 'pending' && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-950 dark:text-amber-200 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  الحساب بانتظار التفعيل الإداري
                </div>
                <p className="leading-relaxed">
                  تم تسجيل بريدك الإلكتروني ولكن حالة الحساب لا تزال بانتظار التفعيل النهائي من مدير النظام.
                </p>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-2 px-3 bg-amber-700 hover:bg-amber-600 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    تسجيل الخروج
                  </button>
                )}
              </div>
            )}

            {denyReason === 'unverified' && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-950 dark:text-amber-200 space-y-2">
                <div className="font-bold text-sm">يرجى تأكيد البريد الإلكتروني أولاً</div>
                <p className="leading-relaxed">
                  يشترط النظام التحقق من ملكية البريد الإلكتروني قبل تفعيل صلاحيات الحساب.
                </p>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-2 px-3 bg-slate-800 text-white rounded-lg font-bold"
                  >
                    تسجيل الخروج
                  </button>
                )}
              </div>
            )}

            {denyReason === 'system_lockdown' && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  وضع القفل الأمني المؤقت نشط (System Lockdown)
                </div>
                <p className="leading-relaxed">
                  {securityPolicy.lockdownMessage ||
                    'النظام مغلق مؤقتاً لغير مدير النظام (Super Admin) لإجراء مراجعة أمنية.'}
                </p>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    تسجيل الخروج أو الدخول بحساب مدير النظام (Super Admin)
                  </button>
                )}
              </div>
            )}

            {denyReason === 'session_expired' && !firebaseUser && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 font-medium">
                انتهت جلستك السابقة تلقائياً بسبب عدم النشاط حفاظاً على أمان البيانات. يرجى تسجيل الدخول مجدداً.
              </div>
            )}

            {authError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 font-medium leading-relaxed">
                {authError}
              </div>
            )}

            {resetStatus && (
              <div
                className={`p-3 rounded-lg border font-medium leading-relaxed ${
                  resetStatus.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                }`}
              >
                {resetStatus.message}
              </div>
            )}

            {!firebaseUser && (
              <>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={loginWithGoogle}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 shadow-sm transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {isBusy ? 'جارٍ التحقق من الهوية...' : 'تسجيل الدخول بحساب Google المعتمد'}
                </button>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                  </div>
                  <div className="relative flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowEmailForm((prev) => !prev)}
                      className="bg-white dark:bg-slate-900 px-3 text-[11px] font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      {showEmailForm
                        ? 'إخفاء نموذج البريد وكلمة المرور'
                        : 'أو الدخول عبر البريد الإلكتروني وكلمة المرور'}
                    </button>
                  </div>
                </div>

                {showEmailForm && (
                  <form onSubmit={handleEmailLogin} className="space-y-3 pt-1">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        البريد الإلكتروني الوظيفي
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          required
                          dir="ltr"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (authError) clearAuthError();
                          }}
                          placeholder="name@company.com"
                          className="w-full border border-slate-300 dark:border-slate-700 rounded-lg pl-3 pr-9 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                        <Mail className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          كلمة المرور
                        </label>
                        <button
                          type="button"
                          onClick={handleResetPassword}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1"
                        >
                          <KeyRound className="w-3 h-3" />
                          إعادة تعيين كلمة المرور
                        </button>
                      </div>
                      <input
                        type="password"
                        required
                        dir="ltr"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (authError) clearAuthError();
                        }}
                        placeholder="••••••••"
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isBusy}
                      className="w-full py-2.5 px-4 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
                    >
                      دخول بالبريد وكلمة المرور
                    </button>
                  </form>
                )}
              </>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              محمي بواسطة قواعد أمان Cloud Firestore (Zero-Trust RBAC). جميع عمليات الدخول والعمليات الحساسة مسجلة في سجل المراجعة الأمني (Audit Log).
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
