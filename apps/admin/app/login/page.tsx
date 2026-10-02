'use client';

import type { LoginResponseDTO } from '@gcs/types';
import { Coffee } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, ErrorBanner, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<LoginResponseDTO>('/auth/login', { email, password });
      if (res.user.role !== 'ADMIN') {
        await api.post('/auth/logout');
        setError('This account does not have admin access.');
        setBusy(false);
        return;
      }
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
      setBusy(false);
    }
  };

  return (
    <main className="flex h-full items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-espresso text-[#e9a45a]">
            <Coffee className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-2xl">PNC Coffee Admin</h1>
            <p className="text-sm text-ink-3">Sign in to manage the shop</p>
          </div>
        </div>
        {error ? <ErrorBanner message={error} /> : null}
        <div className="space-y-4">
          <Field label="Email">
            <input
              className="input"
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <input
              className="input"
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" busy={busy} className="w-full py-2.5">
            Sign in
          </Button>
        </div>
      </form>
    </main>
  );
}
