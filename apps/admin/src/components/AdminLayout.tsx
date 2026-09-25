import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BrandIsoBadge } from './Brand';
import { NavIcon } from './admin/NavIcon';
import { NAV_GROUPS, pageTitleForPath } from './admin/navConfig';
import { useSidebarState } from '../hooks/useSidebarState';

function navLinkClass(isActive: boolean, expanded: boolean) {
  const base =
    'group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-200';
  const sizing = expanded ? 'px-3 py-2' : 'justify-center px-0 py-2.5';
  const state = isActive
    ? 'bg-white/10 text-white'
    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100';
  return `${base} ${sizing} ${state}`;
}

export function AdminLayout() {
  const { admin, logout } = useAuth();
  const location = useLocation();
  const { expanded, toggle } = useSidebarState();
  const isKitchen = location.pathname.startsWith('/kitchen');
  const isPos = location.pathname.startsWith('/pos');
  const pageTitle = pageTitleForPath(location.pathname);

  if (isKitchen || isPos) {
    return <Outlet />;
  }

  const sidebarWidth = expanded ? 'w-[15.5rem]' : 'w-[4.25rem]';

  return (
    <div className="flex min-h-screen bg-zinc-100 text-zinc-900">
      <aside
        className={`admin-sidebar fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950 text-zinc-100 transition-[width] duration-200 ease-out ${sidebarWidth}`}
      >
        <div
          className={`flex h-14 shrink-0 items-center border-b border-zinc-800/80 ${expanded ? 'justify-between px-3' : 'justify-center px-2'}`}
        >
          <Link
            to="/"
            className={`flex min-w-0 items-center gap-2.5 overflow-hidden ${expanded ? '' : 'justify-center'}`}
            title="Cero Tres Admin"
          >
            <BrandIsoBadge className="h-9 w-9 shrink-0 rounded-lg ring-1 ring-white/10" />
            {expanded && (
              <span className="min-w-0 truncate">
                <span className="block text-sm font-semibold tracking-tight text-white">
                  Cero Tres
                </span>
                <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                  Operations
                </span>
              </span>
            )}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="mb-4 last:mb-0">
              {expanded && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
                  {group.label}
                </p>
              )}
              {!expanded && <div className="mx-auto mb-2 h-px w-6 bg-zinc-800" aria-hidden />}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      {...(item.end ? { end: true } : {})}
                      title={!expanded ? item.label : undefined}
                      className={({ isActive }) => navLinkClass(isActive, expanded)}
                    >
                      <NavIcon
                        name={item.icon}
                        className={`h-[1.125rem] w-[1.125rem] shrink-0 ${expanded ? '' : 'mx-auto'}`}
                      />
                      {expanded && <span className="truncate">{item.label}</span>}
                      {!expanded && (
                        <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block">
                          {item.label}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-zinc-800/80 p-2">
          {expanded && admin && (
            <div className="mb-2 rounded-lg bg-zinc-900/60 px-3 py-2">
              <p className="truncate text-sm font-medium text-zinc-100">{admin.name}</p>
              <p className="truncate text-xs text-zinc-500">{admin.email}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {admin.role}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            title="Cerrar sesión"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100 ${expanded ? '' : 'justify-center px-0'}`}
          >
            <NavIcon name="logout" className="h-[1.125rem] w-[1.125rem] shrink-0" />
            {expanded && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-out ${expanded ? 'ml-[15.5rem]' : 'ml-[4.25rem]'}`}
      >
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
            aria-label={expanded ? 'Contraer menú' : 'Expandir menú'}
            aria-expanded={expanded}
          >
            <NavIcon
              name={expanded ? 'chevron-left' : 'menu'}
              className="h-[1.125rem] w-[1.125rem]"
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight text-zinc-900">
              {pageTitle}
            </p>
            <p className="hidden truncate text-xs text-zinc-500 sm:block">
              Panel de administración · Cero Tres
            </p>
          </div>
          {admin && (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                {admin.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </header>

        <main className="admin-main flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
