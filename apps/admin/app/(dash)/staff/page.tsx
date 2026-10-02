'use client';

import type { UserDTO, UserRole } from '@gcs/types';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useUser } from '@/components/AuthProvider';
import {
  Badge,
  Button,
  ConfirmButton,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  TableShell,
  Toggle,
} from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { errorMessage, useResource } from '@/lib/hooks';

export default function StaffPage() {
  const me = useUser();
  const { data, error, loading, reload } = useResource<UserDTO[]>('/users');
  const [editing, setEditing] = useState<UserDTO | 'new' | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setRowError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setRowError(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Admins manage the shop; staff use the kitchen display"
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
            Add staff
          </Button>
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void reload()} /> : null}
      {rowError ? <ErrorBanner message={rowError} /> : null}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[40rem]">
          <thead className="border-b border-line bg-canvas/60">
            <tr>
              <th className="th">Name</th>
              <th className="th">Role</th>
              <th className="th">Last login</th>
              <th className="th">Active</th>
              <th className="th" />
            </tr>
          </thead>
          <TableShell loading={loading && !data} empty={data?.length === 0} colSpan={5}>
            {data?.map((u) => (
              <tr key={u.id} className="hover:bg-canvas/60">
                <td className="td">
                  <p className="font-semibold">
                    {u.name}
                    {u.id === me?.id ? (
                      <span className="ml-2 text-xs text-ink-3">(you)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-ink-3">{u.email}</p>
                </td>
                <td className="td">
                  <Badge tone={u.role === 'ADMIN' ? 'brand' : 'info'}>{u.role}</Badge>
                </td>
                <td className="td text-ink-2">
                  {u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'}
                </td>
                <td className="td">
                  <Toggle
                    label={`${u.name} active`}
                    checked={u.active}
                    disabled={u.id === me?.id}
                    onChange={(v) => void run(() => api.put(`/users/${u.id}`, { active: v }))}
                  />
                </td>
                <td className="td text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => setEditing(u)}>
                      Edit
                    </Button>
                    {u.id !== me?.id ? (
                      <ConfirmButton onConfirm={() => void run(() => api.del(`/users/${u.id}`))} />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </TableShell>
        </table>
      </div>
      {editing ? (
        <UserForm
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      ) : null}
    </>
  );
}

function UserForm({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: UserDTO | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'STAFF');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const weak =
    password !== '' && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (weak || (!user && !password)) {
      setError('Password must be at least 8 characters with a letter and a number');
      return;
    }
    setBusy(true);
    setError(null);
    const body = { name, email, ...(isSelf ? {} : { role }), ...(password ? { password } : {}) };
    try {
      if (user) await api.put(`/users/${user.id}`, body);
      else await api.post('/users', body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={user ? `Edit ${user.name}` : 'Add staff member'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" busy={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4" autoComplete="off">
        {error ? <ErrorBanner message={error} /> : null}
        <Field label="Name">
          <input
            className="input"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Role" hint={isSelf ? 'You cannot change your own role' : undefined}>
          <select
            className="input"
            value={role}
            disabled={isSelf}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <option value="STAFF">Staff (kitchen)</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        <Field
          label={user ? 'New password (optional)' : 'Password'}
          error={weak ? 'At least 8 characters, with a letter and a number' : undefined}
          hint={user ? 'Changing the password signs the user out everywhere' : undefined}
        >
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!user}
          />
        </Field>
        <p className="text-xs text-ink-3">
          Tip: deactivating an account immediately revokes its sessions.
        </p>
      </form>
    </Modal>
  );
}
