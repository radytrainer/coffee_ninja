'use client';

import {
  Boxes,
  ChartColumn,
  ClipboardList,
  Coffee,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  SlidersHorizontal,
  Tags,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useUser } from './AuthProvider';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orders', label: 'Orders', icon: ClipboardList },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/categories', label: 'Categories', icon: Tags },
  { href: '/options', label: 'Options', icon: SlidersHorizontal },
  { href: '/inventory', label: 'Inventory', icon: Boxes },
  { href: '/staff', label: 'Staff', icon: Users },
  { href: '/reports', label: 'Reports', icon: ChartColumn },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Navigation. ≥1024px: fixed sidebar. Smaller screens: a top bar with a menu
 * button that opens the same navigation as a slide-in drawer.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const [open, setOpen] = useState(false);
  const current = NAV.find(({ href }) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href),
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Mobile / tablet top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 bg-espresso px-4 text-white lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="-ml-1 rounded-lg p-2 hover:bg-white/10"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Coffee className="size-5 text-[#e9a45a]" aria-hidden />
        <span className="font-display text-lg">PNC Coffee</span>
        <span className="ml-auto truncate text-sm text-white/60">{current?.label}</span>
      </header>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-espresso/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-espresso text-white/80 transition-[transform,visibility] duration-200 lg:visible lg:static lg:z-auto lg:w-60 lg:translate-x-0 ${
          open ? 'visible translate-x-0 shadow-2xl' : 'invisible -translate-x-full'
        }`}
        aria-label="Admin navigation"
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#e9a45a] text-espresso">
            <Coffee className="size-6" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="font-display text-lg text-white">PNC Coffee</p>
            <p className="text-xs text-white/50">Admin</p>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = current?.href === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition lg:py-2 ${
                  active ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="size-4.5" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm text-white">{user?.name}</p>
          <p className="truncate text-xs text-white/50">{user?.email}</p>
          <button
            type="button"
            onClick={() => void api.post('/auth/logout').finally(() => router.replace('/login'))}
            className="mt-3 flex items-center gap-2 text-sm text-white/70 hover:text-white"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
