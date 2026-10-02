'use client';

import type { KioskDTO, ShopSettingsDTO } from '@gcs/types';
import { Monitor, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, Button, ErrorBanner, Field, PageHeader, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { errorMessage, useResource } from '@/lib/hooks';

export default function SettingsPage() {
  const shop = useResource<ShopSettingsDTO>('/settings');
  const kiosks = useResource<KioskDTO[]>('/kiosks');
  const [newCode, setNewCode] = useState('');
  const [kioskError, setKioskError] = useState<string | null>(null);

  const addKiosk = async (e: FormEvent) => {
    e.preventDefault();
    setKioskError(null);
    try {
      await api.post('/kiosks', {
        code: newCode.trim().toUpperCase(),
        name: `Kiosk ${newCode.trim().toUpperCase()}`,
      });
      setNewCode('');
      await kiosks.reload();
    } catch (err) {
      setKioskError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Shop configuration and kiosk devices" />
      {shop.error ? <ErrorBanner message={shop.error} onRetry={() => void shop.reload()} /> : null}
      {shop.data ? <ShopForm initial={shop.data} onSaved={(s) => shop.setData(s)} /> : null}

      <section className="mt-8" aria-labelledby="kiosks">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="kiosks" className="font-display text-2xl">
            Kiosks
          </h2>
          <form onSubmit={addKiosk} className="flex w-full gap-2 sm:w-auto">
            <input
              className="input w-full min-w-0 sm:w-40"
              placeholder="KIOSK-02"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              aria-label="New kiosk code"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={!newCode.trim()}
              icon={<Plus className="size-4" aria-hidden />}
            >
              Add kiosk
            </Button>
          </form>
        </div>
        {kioskError ? <ErrorBanner message={kioskError} /> : null}
        <div className="grid gap-4 xl:grid-cols-2">
          {kiosks.data?.map((k) => (
            <KioskCard
              key={`${k.id}-${k.updatedAt}`}
              kiosk={k}
              onSaved={() => void kiosks.reload()}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function ShopForm({
  initial,
  onSaved,
}: {
  initial: ShopSettingsDTO;
  onSaved: (s: ShopSettingsDTO) => void;
}) {
  const [form, setForm] = useState({
    ...initial,
    taxPercent: String(Math.round(initial.taxRate * 10000) / 100),
    smilePercent: String(Math.round(initial.smileDiscountRate * 10000) / 100),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const taxRate = Number(form.taxPercent) / 100;
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 0.5) {
      setError('Tax rate must be between 0% and 50%');
      return;
    }
    const smileDiscountRate = Number(form.smilePercent) / 100;
    if (!Number.isFinite(smileDiscountRate) || smileDiscountRate < 0 || smileDiscountRate > 0.5) {
      setError('Smile discount must be between 0% and 50%');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.put<ShopSettingsDTO>('/settings', {
        shopName: form.shopName,
        currency: form.currency.toUpperCase(),
        taxRate: Math.round(taxRate * 10000) / 10000,
        orderNumberPrefix: form.orderNumberPrefix.toUpperCase(),
        timezone: form.timezone,
        requirePayment: form.requirePayment,
        allowCashPayment: form.allowCashPayment,
        smileDiscountRate: Math.round(smileDiscountRate * 10000) / 10000,
      });
      onSaved(result);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card grid gap-4 p-6 md:grid-cols-3">
      {error ? (
        <div className="md:col-span-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}
      <Field label="Shop name">
        <input
          className="input"
          required
          value={form.shopName}
          onChange={(e) => set('shopName', e.target.value)}
        />
      </Field>
      <Field label="Currency" hint="ISO code, e.g. USD or KHR">
        <input
          className="input"
          required
          maxLength={3}
          value={form.currency}
          onChange={(e) => set('currency', e.target.value)}
        />
      </Field>
      <Field label="Tax rate (%)">
        <input
          className="input"
          inputMode="decimal"
          required
          value={form.taxPercent}
          onChange={(e) => set('taxPercent', e.target.value)}
        />
      </Field>
      <Field label="Order number prefix" hint="Orders look like A1025">
        <input
          className="input"
          required
          maxLength={3}
          value={form.orderNumberPrefix}
          onChange={(e) => set('orderNumberPrefix', e.target.value)}
        />
      </Field>
      <Field label="Timezone" hint="Used for today's stats and daily reports">
        <input
          className="input"
          required
          value={form.timezone}
          onChange={(e) => set('timezone', e.target.value)}
        />
      </Field>
      <Field
        label="Smile discount (%)"
        hint="Customers who smile at the kiosk camera at checkout. 0 = off"
      >
        <input
          className="input"
          inputMode="decimal"
          required
          value={form.smilePercent}
          onChange={(e) => set('smilePercent', e.target.value)}
        />
      </Field>
      <div className="flex items-center gap-2 self-end rounded-lg border border-line px-3 py-2.5 text-sm md:col-span-2">
        <input
          type="checkbox"
          id="require-payment"
          checked={form.requirePayment}
          onChange={(e) => set('requirePayment', e.target.checked)}
        />
        <label htmlFor="require-payment" className="flex-1">
          <span className="font-semibold">Pay by QR before preparing</span>
          <span className="block text-ink-3">
            Orders reach the kitchen only after payment. Off = customers pay at the counter.
          </span>
        </label>
      </div>
      <div className="flex items-center gap-2 self-end rounded-lg border border-line px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          id="allow-cash"
          checked={form.allowCashPayment}
          disabled={!form.requirePayment}
          onChange={(e) => set('allowCashPayment', e.target.checked)}
        />
        <label htmlFor="allow-cash" className="flex-1">
          <span className="font-semibold">Also accept cash</span>
          <span className="block text-ink-3">
            Customers can choose to pay at the counter; staff press Cash received.
          </span>
        </label>
      </div>
      <div className="flex items-end gap-3">
        <Button type="submit" busy={busy}>
          Save settings
        </Button>
        {saved ? (
          <span className="text-sm font-semibold text-good" role="status">
            Saved ✓
          </span>
        ) : null}
      </div>
    </form>
  );
}

function KioskCard({ kiosk, onSaved }: { kiosk: KioskDTO; onSaved: () => void }) {
  const [form, setForm] = useState(kiosk);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const online = kiosk.lastSeenAt && now - new Date(kiosk.lastSeenAt).getTime() < 3 * 60_000;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/kiosks/${kiosk.id}`, {
        name: form.name,
        location: form.location,
        active: form.active,
        inputMode: form.inputMode,
        sessionTimeoutSeconds: Number(form.sessionTimeoutSeconds),
        successResetSeconds: Number(form.successResetSeconds),
        hoverDelayMs: Number(form.hoverDelayMs),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Monitor className="size-5 text-ink-3" aria-hidden />
        <h3 className="flex-1 font-semibold">{kiosk.code}</h3>
        <Badge tone={online ? 'good' : 'neutral'}>
          {online
            ? 'Online'
            : kiosk.lastSeenAt
              ? `Last seen ${dateTime(kiosk.lastSeenAt)}`
              : 'Never connected'}
        </Badge>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Location">
          <input
            className="input"
            value={form.location ?? ''}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </Field>
        <Field label="Input mode">
          <select
            className="input"
            value={form.inputMode}
            onChange={(e) =>
              setForm({ ...form, inputMode: e.target.value as KioskDTO['inputMode'] })
            }
          >
            <option value="GESTURE">Gesture (camera)</option>
            <option value="MOUSE">Mouse / touch (demo)</option>
          </select>
        </Field>
        <Field label="Hover delay (ms)" hint="Rest time before a pinch can select">
          <input
            className="input"
            type="number"
            min={0}
            max={3000}
            value={form.hoverDelayMs}
            onChange={(e) => setForm({ ...form, hoverDelayMs: Number(e.target.value) })}
          />
        </Field>
        <Field label="Inactivity timeout (s)">
          <input
            className="input"
            type="number"
            min={10}
            max={3600}
            value={form.sessionTimeoutSeconds}
            onChange={(e) => setForm({ ...form, sessionTimeoutSeconds: Number(e.target.value) })}
          />
        </Field>
        <Field label="Reset after order (s)">
          <input
            className="input"
            type="number"
            min={5}
            max={600}
            value={form.successResetSeconds}
            onChange={(e) => setForm({ ...form, successResetSeconds: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Toggle
            label="Kiosk active"
            checked={form.active}
            onChange={(v) => setForm({ ...form, active: v })}
          />{' '}
          Accepting orders
        </label>
        <Button busy={busy} onClick={() => void save()}>
          Save kiosk
        </Button>
      </div>
    </div>
  );
}
