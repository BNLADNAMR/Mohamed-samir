import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Search,
  ChevronDown,
  ChevronLeft,
  LayoutDashboard,
  Calendar,
  BarChart3,
  UserCheck,
  FileCheck2,
  Layers,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Sliders,
  Users,
  Network,
  Globe,
  FileText,
  Lock,
  User,
  KeyRound,
  Activity,
  UserPlus,
  RefreshCw,
  Download,
  Printer,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import {
  AppRoutePage,
  SecurityPolicySettings,
  UserProfile,
} from '../types';
import { NavigationSnapshot } from '../utils/navigationHistory';
import { ROLE_SHORT_LABELS_AR } from '../utils/rbac';
import {
  buildDrawerSectionGroups,
  DrawerCountsInput,
  DrawerIconKey,
  DrawerQuickActionId,
  DrawerSectionGroupId,
  DrawerSectionItem,
  isDrawerItemActive,
} from '../utils/sectionsCatalog';

interface AppSectionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  currentSnapshot: NavigationSnapshot;
  counts: DrawerCountsInput;
  onNavigate: (
    targetSnapshot: Partial<NavigationSnapshot> & { route: AppRoutePage }
  ) => void;
  onRunQuickAction: (actionId: DrawerQuickActionId) => void;
}

export const AppSectionsDrawer: React.FC<AppSectionsDrawerProps> = ({
  isOpen,
  onClose,
  currentUser,
  securityPolicy,
  currentSnapshot,
  counts,
  onNavigate,
  onRunQuickAction,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const groups = useMemo(
    () =>
      buildDrawerSectionGroups({
        user: currentUser,
        policy: securityPolicy,
        counts,
      }),
    [currentUser, securityPolicy, counts]
  );

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.titleAr.toLowerCase().includes(q) ||
            item.subtitleAr.toLowerCase().includes(q) ||
            group.titleAr.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, searchQuery]);

  const totalItemsCount = useMemo(
    () => groups.reduce((acc, g) => acc + g.items.length, 0),
    [groups]
  );

  // إغلاق القائمة عند الضغط على زر Escape ومنع تمرير الخلفية أثناء الفتح
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 80);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const toggleGroupCollapse = (groupId: DrawerSectionGroupId) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const renderIcon = (iconKey: DrawerIconKey, isActive: boolean) => {
    const baseClass = `w-4 h-4 shrink-0 ${
      isActive ? 'text-white' : ''
    }`;

    switch (iconKey) {
      case 'home_overview':
        return (
          <LayoutDashboard
            className={`${baseClass} ${
              !isActive ? 'text-violet-600 dark:text-violet-400' : ''
            }`}
          />
        );
      case 'calendar_grid':
        return (
          <Calendar
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'analytics':
        return (
          <BarChart3
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'my_portal':
        return (
          <UserCheck
            className={`${baseClass} ${
              !isActive ? 'text-emerald-600 dark:text-emerald-400' : ''
            }`}
          />
        );
      case 'requests':
        return (
          <FileCheck2
            className={`${baseClass} ${
              !isActive ? 'text-amber-600 dark:text-amber-400' : ''
            }`}
          />
        );
      case 'case_all':
        return (
          <Layers
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'case_missed':
        return (
          <AlertTriangle
            className={`${baseClass} ${
              !isActive ? 'text-rose-600 dark:text-rose-400' : ''
            }`}
          />
        );
      case 'case_incomplete':
        return (
          <Clock
            className={`${baseClass} ${
              !isActive ? 'text-amber-600 dark:text-amber-400' : ''
            }`}
          />
        );
      case 'case_worked':
        return (
          <CheckCircle2
            className={`${baseClass} ${
              !isActive ? 'text-emerald-600 dark:text-emerald-400' : ''
            }`}
          />
        );
      case 'case_absent':
        return (
          <XCircle
            className={`${baseClass} ${
              !isActive ? 'text-rose-600 dark:text-rose-400' : ''
            }`}
          />
        );
      case 'sec_overview':
        return (
          <ShieldCheck
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'sec_matrix':
        return (
          <Sliders
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'users':
        return (
          <Users
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'teams':
        return (
          <Network
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'integration':
        return (
          <Globe
            className={`${baseClass} ${
              !isActive ? 'text-sky-600 dark:text-sky-400' : ''
            }`}
          />
        );
      case 'audit':
        return (
          <FileText
            className={`${baseClass} ${
              !isActive ? 'text-slate-600 dark:text-slate-300' : ''
            }`}
          />
        );
      case 'sec_settings':
        return (
          <Lock
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'profile_all':
        return (
          <Layers
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'profile_personal':
        return (
          <User
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'profile_password':
        return (
          <KeyRound
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'profile_security':
        return (
          <Lock
            className={`${baseClass} ${
              !isActive ? 'text-emerald-600 dark:text-emerald-400' : ''
            }`}
          />
        );
      case 'profile_activity':
        return (
          <Activity
            className={`${baseClass} ${
              !isActive ? 'text-slate-600 dark:text-slate-300' : ''
            }`}
          />
        );
      case 'tool_add_emp':
        return (
          <UserPlus
            className={`${baseClass} ${
              !isActive ? 'text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        );
      case 'tool_sync':
        return (
          <RefreshCw
            className={`${baseClass} ${
              !isActive ? 'text-sky-600 dark:text-sky-400' : ''
            }`}
          />
        );
      case 'tool_export':
        return (
          <Download
            className={`${baseClass} ${
              !isActive ? 'text-emerald-600 dark:text-emerald-400' : ''
            }`}
          />
        );
      case 'tool_print':
        return (
          <Printer
            className={`${baseClass} ${
              !isActive ? 'text-slate-600 dark:text-slate-300' : ''
            }`}
          />
        );
      case 'tool_theme':
        return counts.isDarkMode ? (
          <Sun className="w-4 h-4 shrink-0 text-amber-500 dark:text-amber-400" />
        ) : (
          <Moon className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        );
      case 'tool_logout':
        return <LogOut className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />;
      default:
        return <Layers className={baseClass} />;
    }
  };

  const handleSelectItem = (item: DrawerSectionItem) => {
    onClose();
    if (item.kind === 'navigation' && item.targetSnapshot) {
      onNavigate(item.targetSnapshot);
      return;
    }
    if (item.kind === 'action' && item.actionId) {
      onRunQuickAction(item.actionId);
    }
  };

  const isSuperAdmin = currentUser.role === 'super_admin';

  return (
    <div
      className={`fixed inset-0 z-50 no-print transition-opacity duration-200 ${
        isOpen
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      {/* خلفية معتمة خفيفة تغلق القائمة عند النقر خارجها */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/55"
        aria-label="إغلاق القائمة الجانبية"
      />

      {/* اللوحة المنبثقة الجانبية (من اليمين في واجهة RTL) */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="القائمة الجانبية لجميع أقسام النظام"
        className={`absolute inset-y-0 right-0 w-full max-w-[360px] sm:max-w-[390px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* رأس القائمة الجانبية + ملخص الحساب الحالي */}
        <div className="px-4 py-3.5 bg-slate-900 dark:bg-slate-950 text-white border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                <h2 className="text-sm font-extrabold text-white truncate">
                  دليل جميع أقسام النظام
                </h2>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  ({totalItemsCount})
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {currentUser.name} · {ROLE_SHORT_LABELS_AR[currentUser.role]}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="إغلاق القائمة الجانبية (Esc)"
              aria-label="إغلاق القائمة الجانبية"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* شريط البحث الفوري لتصفية أي قسم */}
          <div className="relative mt-3">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن أي قسم أو إعداد..."
              className="w-full text-xs bg-slate-800/90 border border-slate-700 text-white placeholder:text-slate-400 rounded-lg pr-8 pl-7 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2 top-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                aria-label="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* جسم القائمة الجانبية: جميع المجموعات والأقسام مرتبة ومبسطة */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {filteredGroups.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2.5">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                لا يوجد قسم مطابق لعبارة البحث &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                جرّب البحث بكلمة أخرى أو استعرض جميع المجموعات مباشرة.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                إظهار جميع الأقسام
              </button>
            </div>
          ) : (
            filteredGroups.map((group, groupIndex) => {
              const isCollapsed =
                !searchQuery.trim() && Boolean(collapsedGroups[group.id]);

              return (
                <section
                  key={group.id}
                  className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden"
                >
                  {/* عنوان المجموعة القابل للطي والتوسيع */}
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse(group.id)}
                    className="w-full px-3 py-2.5 text-right flex items-center justify-between gap-2 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                          {groupIndex + 1}.
                        </span>
                        <h3 className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {group.titleAr}
                        </h3>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                          ({group.items.length})
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {group.descriptionAr}
                      </p>
                    </div>

                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
                        isCollapsed ? 'rotate-90' : 'rotate-0'
                      }`}
                    />
                  </button>

                  {!isCollapsed && (
                    <div className="p-1.5 pt-0 space-y-1 border-t border-slate-200/70 dark:border-slate-800/80">
                      {group.items.map((item) => {
                        const isActive = isDrawerItemActive(
                          item,
                          currentSnapshot,
                          isSuperAdmin
                        );
                        const isDangerAction = item.tone === 'danger';

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectItem(item)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`w-full min-h-[44px] px-2.5 py-2 rounded-lg text-right flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : isDangerAction
                                ? 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                : 'text-slate-800 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span
                                className={`mt-0.5 w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                                  isActive
                                    ? 'bg-white/15'
                                    : isDangerAction
                                    ? 'bg-rose-100/80 dark:bg-rose-950/60'
                                    : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700'
                                }`}
                              >
                                {renderIcon(item.iconKey, isActive)}
                              </span>

                              <div className="min-w-0">
                                <div
                                  className={`text-xs truncate ${
                                    isActive ? 'font-extrabold' : 'font-bold'
                                  }`}
                                >
                                  {item.titleAr}
                                </div>
                                <div
                                  className={`text-[10px] truncate mt-0.5 ${
                                    isActive
                                      ? 'text-indigo-100'
                                      : isDangerAction
                                      ? 'text-rose-600/80 dark:text-rose-400/80'
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {item.subtitleAr}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {item.alertLabelAr && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                                    isActive
                                      ? 'bg-white/20 text-white'
                                      : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                                  }`}
                                >
                                  {item.alertLabelAr}
                                </span>
                              )}

                              {item.count !== undefined && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums font-bold ${
                                    isActive
                                      ? 'bg-white/20 text-white'
                                      : item.tone === 'warning'
                                      ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300'
                                      : 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                  }`}
                                >
                                  {item.count}
                                </span>
                              )}

                              <ChevronLeft
                                className={`w-3.5 h-3.5 ${
                                  isActive
                                    ? 'text-white'
                                    : 'text-slate-300 dark:text-slate-600'
                                }`}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        {/* تذييل مختصر يوضح اختصارات الوصول السريع */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          <span>اختصار الفتح: Alt + M</span>
          <span>إغلاق سريع: Esc</span>
        </div>
      </aside>
    </div>
  );
};
