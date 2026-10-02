'use client';

import type { ProductOptionDTO, ProductOptionGroupDTO } from '@gcs/types';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  ConfirmButton,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  Toggle,
} from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { errorMessage, useResource } from '@/lib/hooks';

const validPrice = (v: string) =>
  /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) >= 0 && Number(v) <= 10000;

export default function OptionsPage() {
  const { data, error, loading, reload } = useResource<ProductOptionGroupDTO[]>('/option-groups');
  const [editingGroup, setEditingGroup] = useState<ProductOptionGroupDTO | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Options"
        subtitle="Reusable option groups (Size, Milk, Extras…) shared by many products"
        actions={
          <Button
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => setEditingGroup('new')}
          >
            New group
          </Button>
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {loading && !data ? <p className="text-ink-3">Loading…</p> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {data?.map((g) => (
          <section key={g.id} className="card p-5" aria-label={g.name}>
            <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{g.name}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                  <Badge tone={g.selectionType === 'SINGLE' ? 'info' : 'brand'}>
                    {g.selectionType === 'SINGLE' ? 'Choose one' : `Up to ${g.maxSelect}`}
                  </Badge>
                  {g.required ? <Badge tone="warn">Required</Badge> : <Badge>Optional</Badge>}
                  Used by {g.productCount ?? 0} product(s)
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => setEditingGroup(g)}>
                  Edit
                </Button>
                <ConfirmButton
                  onConfirm={() => void run(() => api.del(`/option-groups/${g.id}`))}
                />
              </div>
            </header>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {g.options.map((o) => (
                <OptionRow
                  key={o.id}
                  option={o}
                  onSave={(body) => run(() => api.put(`/options/${o.id}`, body))}
                  onDelete={() => void run(() => api.del(`/options/${o.id}`))}
                />
              ))}
            </ul>
            <AddOption
              onAdd={(body) => run(() => api.post(`/option-groups/${g.id}/options`, body))}
            />
          </section>
        ))}
      </div>

      {editingGroup ? (
        <GroupForm
          group={editingGroup === 'new' ? null : editingGroup}
          onClose={() => setEditingGroup(null)}
          onSaved={() => {
            setEditingGroup(null);
            void reload();
          }}
        />
      ) : null}
    </>
  );
}

function OptionRow({
  option,
  onSave,
  onDelete,
}: {
  option: ProductOptionDTO;
  onSave: (b: Partial<ProductOptionDTO>) => Promise<void>;
  onDelete: () => void;
}) {
  const [price, setPrice] = useState(option.priceDelta.toFixed(2));
  const dirty = price !== option.priceDelta.toFixed(2);
  const invalid = !validPrice(price);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-sm">
      <span className="min-w-[8rem] flex-1 font-medium">
        {option.name}
        {option.isDefault ? <span className="ml-2 text-xs text-ink-3">(default)</span> : null}
      </span>
      <label className="flex items-center gap-1 text-ink-3">
        +
        <input
          aria-label={`${option.name} price`}
          className={`input w-20 py-1 text-right ${invalid ? 'border-bad' : ''}`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      {dirty ? (
        <Button
          className="py-1"
          disabled={invalid}
          onClick={() => void onSave({ priceDelta: Number(price) })}
        >
          Save
        </Button>
      ) : null}
      <Toggle
        label={`${option.name} available`}
        checked={option.available}
        onChange={(v) => void onSave({ available: v })}
      />
      <ConfirmButton label="Remove" onConfirm={onDelete} />
    </li>
  );
}

function AddOption({
  onAdd,
}: {
  onAdd: (b: { name: string; priceDelta: number }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('0.00');
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !validPrice(price)) return;
        void onAdd({ name: name.trim(), priceDelta: Number(price) }).then(() => {
          setName('');
          setPrice('0.00');
        });
      }}
    >
      <input
        className="input min-w-[10rem] flex-1 py-1.5"
        placeholder="New option name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="New option name"
      />
      <input
        className={`input w-24 py-1.5 text-right ${validPrice(price) ? '' : 'border-bad'}`}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        aria-label="New option price"
      />
      <Button
        type="submit"
        variant="secondary"
        disabled={!name.trim() || !validPrice(price)}
        icon={<Plus className="size-4" aria-hidden />}
      >
        Add
      </Button>
      <span className="sr-only">Prices like {money(0.5)}</span>
    </form>
  );
}

function GroupForm({
  group,
  onClose,
  onSaved,
}: {
  group: ProductOptionGroupDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group?.name ?? '');
  const [selectionType, setSelectionType] = useState<'SINGLE' | 'MULTIPLE'>(
    group?.selectionType ?? 'SINGLE',
  );
  const [required, setRequired] = useState(group?.required ?? false);
  const [maxSelect, setMaxSelect] = useState(String(group?.maxSelect ?? 1));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const max = selectionType === 'SINGLE' ? 1 : Math.max(1, Number(maxSelect) || 1);
    const body = { name, selectionType, required, minSelect: required ? 1 : 0, maxSelect: max };
    try {
      if (group) await api.put(`/option-groups/${group.id}`, body);
      else await api.post('/option-groups', body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={group ? `Edit ${group.name}` : 'New option group'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="group-form" busy={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="group-form" onSubmit={submit} className="space-y-4">
        {error ? <ErrorBanner message={error} /> : null}
        <Field label="Name">
          <input
            className="input"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Selection">
          <select
            className="input"
            value={selectionType}
            onChange={(e) => setSelectionType(e.target.value as 'SINGLE' | 'MULTIPLE')}
          >
            <option value="SINGLE">Customer chooses one</option>
            <option value="MULTIPLE">Customer may choose several</option>
          </select>
        </Field>
        {selectionType === 'MULTIPLE' ? (
          <Field label="Maximum choices">
            <input
              className="input"
              type="number"
              min={1}
              max={20}
              value={maxSelect}
              onChange={(e) => setMaxSelect(e.target.value)}
            />
          </Field>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Toggle label="Required" checked={required} onChange={setRequired} /> Customer must choose
        </label>
      </form>
    </Modal>
  );
}
