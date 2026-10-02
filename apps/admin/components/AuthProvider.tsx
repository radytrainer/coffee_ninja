'use client';

import type { UserDTO } from '@gcs/types';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

const AuthContext = createContext<UserDTO | null>(null);

/** Requires an ADMIN session; otherwise redirects to /login. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserDTO | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    api
      .get<UserDTO>('/auth/me')
      .then((me) => (me.role === 'ADMIN' ? setUser(me) : setDenied(true)))
      .catch(() => router.replace('/login'));
  }, [router]);

  if (denied) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="font-display text-2xl">Admin access required</h1>
          <p className="mt-2 text-ink-3">
            Your account is a staff account. Use the kitchen display instead.
          </p>
          <button
            type="button"
            className="mt-6 font-semibold text-brand underline"
            onClick={() => void api.post('/auth/logout').finally(() => router.replace('/login'))}
          >
            Sign in with another account
          </button>
        </div>
      </div>
    );
  }
  if (!user) {
    return <div className="flex h-full items-center justify-center text-ink-3">Loading…</div>;
  }
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export const useUser = () => useContext(AuthContext);
