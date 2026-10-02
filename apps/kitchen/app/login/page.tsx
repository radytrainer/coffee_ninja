'use client';

import { ChefHat, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
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
      await api.login(email, password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-md rounded-3xl p-10 shadow-2xl">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-caramel-400 text-espresso-950">
            <ChefHat className="size-8" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-3xl text-crema-50">Kitchen Display</h1>
            <p className="text-crema-400">Staff sign in</p>
          </div>
        </div>
        <label className="mb-2 block text-sm font-medium text-crema-300" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-5 w-full rounded-xl border border-crema-50/15 bg-espresso-900 px-4 py-3 text-lg text-crema-50 outline-none focus:border-caramel-400"
        />
        <label className="mb-2 block text-sm font-medium text-crema-300" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-xl border border-crema-50/15 bg-espresso-900 px-4 py-3 text-lg text-crema-50 outline-none focus:border-caramel-400"
        />
        {error ? (
          <p className="mb-4 rounded-xl bg-berry-500/15 px-4 py-3 text-berry-300" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="kbtn w-full bg-caramel-400 text-espresso-950 hover:bg-caramel-300"
        >
          {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
          Sign in
        </button>
      </form>
    </main>
  );
}
