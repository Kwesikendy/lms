import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Bell,
  ClipboardCheck,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Moon,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { useTheme } from '../../lib/theme.js';
import { apiRequest, formatDateTime } from '../../lib/api.js';
import { Avatar, Badge, Button, LinkButton, Popover, cn } from '../ui/index.js';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const studentNav: NavItem[] = [
  { to: '/student/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/student/learning', label: 'My learning', icon: GraduationCap },
  { to: '/student/library', label: 'Library', icon: Library },
  { to: '/student/live', label: 'Live classes', icon: Radio },
  { to: '/student/assessments', label: 'Assessments', icon: ClipboardCheck },
  { to: '/student/account', label: 'Account', icon: Settings2 },
];

const instructorNav: NavItem[] = [
  { to: '/instructor/dashboard', label: 'Studio', icon: LayoutDashboard },
  { to: '/instructor/courses', label: 'Courses', icon: BookOpen },
  { to: '/instructor/resources', label: 'Resources', icon: FolderOpen },
  { to: '/instructor/live', label: 'Live classes', icon: Video },
  { to: '/instructor/students', label: 'Students', icon: Users },
];

function Logo({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-tr from-accent to-orange-400 text-white shadow-glow">
        <span className="font-display font-extrabold text-lg leading-none">{name.charAt(0).toUpperCase()}</span>
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-paper" />
      </span>
      <span className="font-display font-bold text-[1.2rem] tracking-tight leading-none text-ink">{name}</span>
    </span>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -40, opacity: 0, scale: 0.8 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 40, opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.18 }}
        >
          {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end className="relative block rounded-xl">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-xl bg-ink"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <span
            className={cn(
              'relative z-10 flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'text-on-ink' : 'text-ink-2 hover:text-ink'
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, settings, notifications, refreshAuth, logout } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname;
  const isClassroom = path.startsWith('/classroom/');
  const isPortal = /^\/(student|instructor|admin)/.test(path);
  const hasSidebar = isPortal && !!user && !path.startsWith('/admin');
  const isInstructorArea = path.startsWith('/instructor');
  const navItems = isInstructorArea ? instructorNav : studentNav;
  const unread = notifications.filter((n) => !n.is_read).length;

  if (isClassroom) {
    return (
      <>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-on-ink">
          Skip to main content
        </a>
        <main id="main-content">{children}</main>
      </>
    );
  }

  const openNotification = async (id: string, link?: string | null, close?: () => void) => {
    try {
      await apiRequest(`/api/auth/notifications/${id}/read`, { method: 'POST' });
      await refreshAuth();
    } catch {
      // read-state is best effort
    }
    close?.();
    if (link) navigate(link);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/courses${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
    setMenuOpen(false);
  };

  const topLinks = [
    { to: '/courses', label: 'Courses' },
    { to: '/resources', label: 'Library' },
    ...(user ? [{ to: '/student/live', label: 'Live classes' }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-on-ink">
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4 transition-all duration-300">
        <div className="glass-dock mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-4 rounded-full pl-5 pr-2.5">
          <div className="flex items-center gap-8">
            <Link to="/" aria-label={`${settings.org_name} home`} className="rounded-full">
              <Logo name={settings.org_name} />
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
              {topLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-ink/8 text-ink' : 'text-ink-2 hover:bg-ink/5 hover:text-ink'
                    )
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            <form onSubmit={submitSearch} role="search" className="relative hidden lg:block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search courses"
                aria-label="Search courses"
                className="h-10 w-48 rounded-full bg-ink/6 pl-10 pr-4 text-sm outline-none transition-[width,background-color] duration-300 placeholder:text-ink-3 focus:w-64 focus:bg-card focus:ring-2 focus:ring-ink/15"
              />
            </form>

            <ThemeToggle />

            {user ? (
              <>
                <Popover
                  trigger={({ toggle, open }) => (
                    <button
                      type="button"
                      onClick={toggle}
                      aria-expanded={open}
                      aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                      className="relative grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
                    >
                      <Bell className="size-[18px]" />
                      {unread > 0 && (
                        <span className="absolute right-2 top-2 size-2.5 rounded-full bg-accent ring-2 ring-card" />
                      )}
                    </button>
                  )}
                  className="w-[22rem] max-w-[calc(100vw-2rem)]"
                >
                  {({ close }) => (
                    <div>
                      <div className="flex items-center justify-between px-3 pb-2 pt-2">
                        <span className="text-sm font-semibold">Notifications</span>
                        {unread > 0 && <Badge tone="accent">{unread} new</Badge>}
                      </div>
                      {notifications.length === 0 ? (
                        <p className="px-3 py-8 text-center text-sm text-ink-3">You're all caught up.</p>
                      ) : (
                        <ul className="max-h-80 space-y-0.5 overflow-y-auto">
                          {notifications.map((n) => (
                            <li key={n.id}>
                              <button
                                type="button"
                                onClick={() => openNotification(n.id, n.link, close)}
                                className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ink/5"
                              >
                                <span
                                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-accent')}
                                  aria-hidden="true"
                                />
                                <span className="min-w-0">
                                  <span className={cn('block text-sm', !n.is_read && 'font-medium')}>{n.title}</span>
                                  <span className="mt-0.5 block line-clamp-2 text-[13px] text-ink-3">{n.message}</span>
                                  <span className="mt-1 block text-xs text-ink-3">{formatDateTime(n.created_at)}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Popover>

                <Popover
                  trigger={({ toggle, open }) => (
                    <button
                      type="button"
                      onClick={toggle}
                      aria-expanded={open}
                      aria-label="Account menu"
                      className="flex items-center gap-2 rounded-full p-1 pr-3 transition-colors hover:bg-ink/6"
                    >
                      <Avatar name={user.full_name} size={34} />
                      <span className="hidden text-sm font-medium sm:block">{user.full_name.split(' ')[0]}</span>
                    </button>
                  )}
                >
                  {({ close }) => (
                    <div className="space-y-0.5">
                      <div className="px-3 pb-3 pt-2">
                        <p className="text-sm font-semibold">{user.full_name}</p>
                        <p className="truncate text-[13px] text-ink-3">{user.email}</p>
                        <Badge tone="neutral" className="mt-2 capitalize">
                          {user.role}
                        </Badge>
                      </div>
                      <div className="border-t border-line pt-1.5">
                        {[
                          { to: '/student/dashboard', label: 'Student dashboard', show: true },
                          { to: '/instructor/dashboard', label: 'Instructor studio', show: user.role !== 'student' },
                          { to: '/admin/dashboard', label: 'Admin console', show: user.role === 'admin' },
                          { to: '/student/account', label: 'Account & receipts', show: true },
                        ]
                          .filter((i) => i.show)
                          .map((i) => (
                            <Link
                              key={i.to}
                              to={i.to}
                              onClick={close}
                              className="block rounded-xl px-3 py-2 text-sm transition-colors hover:bg-ink/5"
                            >
                              {i.label}
                            </Link>
                          ))}
                        <button
                          type="button"
                          onClick={() => {
                            close();
                            logout();
                            navigate('/');
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-soft"
                        >
                          <LogOut className="size-4" /> Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </Popover>
              </>
            ) : (
              <div className="hidden items-center gap-1.5 sm:flex">
                <LinkButton to="/auth" variant="ghost" size="sm">
                  Sign in
                </LinkButton>
                <LinkButton to="/auth?mode=signup" variant="primary" size="sm">
                  Get started
                </LinkButton>
              </div>
            )}

            <button
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-ink/6 md:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="glass mx-auto mt-2 max-w-[1360px] rounded-3xl p-3 md:hidden"
            >
              <form onSubmit={submitSearch} role="search" className="relative mb-2">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search courses"
                  aria-label="Search courses"
                  className="h-11 w-full rounded-full bg-ink/6 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-ink/15"
                />
              </form>
              {topLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-2xl px-4 py-3 text-[15px] font-medium transition-colors hover:bg-ink/5"
                >
                  {l.label}
                </Link>
              ))}
              {!user && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <LinkButton to="/auth" variant="secondary" onClick={() => setMenuOpen(false)}>
                    Sign in
                  </LinkButton>
                  <LinkButton to="/auth?mode=signup" onClick={() => setMenuOpen(false)}>
                    Get started
                  </LinkButton>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {hasSidebar ? (
        <div className="mx-auto flex w-full max-w-[1360px] flex-1 gap-8 px-4 pb-28 pt-8 sm:px-6 lg:pb-14">
          <aside aria-label="Section navigation" className="sticky top-28 hidden h-fit w-56 shrink-0 lg:block">
            {user && user.role !== 'student' && (
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-ink/6 p-1 text-center text-[13px] font-medium">
                <Link
                  to="/student/dashboard"
                  className={cn('rounded-full py-2 transition-colors', !isInstructorArea ? 'bg-card text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}
                >
                  Learn
                </Link>
                <Link
                  to="/instructor/dashboard"
                  className={cn('rounded-full py-2 transition-colors', isInstructorArea ? 'bg-card text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}
                >
                  Teach
                </Link>
              </div>
            )}
            <nav className="space-y-1">
              {navItems.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
              {user?.role === 'admin' && (
                <Link
                  to="/admin/dashboard"
                  className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-3.5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
                >
                  <ShieldCheck className="size-[18px]" /> Admin console
                </Link>
              )}
            </nav>
          </aside>
          <main id="main-content" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      ) : (
        <main id="main-content" className={cn('flex-1', isPortal && 'mx-auto w-full max-w-[1360px] px-4 pb-14 pt-8 sm:px-6')}>
          {children}
        </main>
      )}

      {hasSidebar && (
        <nav
          aria-label="Section navigation"
          className="glass fixed inset-x-3 bottom-3 z-40 grid rounded-3xl p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] lg:hidden"
          style={{ gridTemplateColumns: `repeat(${Math.min(navItems.length, 5)}, minmax(0, 1fr))` }}
        >
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 rounded-2xl py-2 text-[10.5px] font-medium transition-colors',
                    isActive ? 'bg-ink text-on-ink' : 'text-ink-3'
                  )
                }
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      )}

      {!isPortal && (
        <footer className="mt-24 border-t border-line">
          <div className="mx-auto grid max-w-[1360px] gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Logo name={settings.org_name} />
              <p className="mt-4 max-w-sm text-sm text-ink-3">{settings.org_tagline}</p>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold">Learn</p>
              <ul className="space-y-2 text-sm text-ink-3">
                <li><Link className="hover:text-ink" to="/courses">All courses</Link></li>
                <li><Link className="hover:text-ink" to="/resources">Digital library</Link></li>
                <li><Link className="hover:text-ink" to="/student/live">Live classes</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold">Help</p>
              <ul className="space-y-2 text-sm text-ink-3">
                <li><a className="hover:text-ink" href={`mailto:${settings.support_email}`}>{settings.support_email}</a></li>
                <li><Link className="hover:text-ink" to="/auth">Sign in</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-line py-5 text-center text-xs text-ink-3">
            © {new Date().getFullYear()} {settings.org_name}. All rights reserved.
          </div>
        </footer>
      )}
    </div>
  );
};

export { Button };
