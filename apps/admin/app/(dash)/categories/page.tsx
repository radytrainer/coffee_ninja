'use client';

import type { CategoryDTO } from '@gcs/types';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Button,
  ConfirmButton,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  TableShell,
  Toggle,
} from '@/components/ui';
import { api, assetUrl } from '@/lib/api';
import { errorMessage, useResource } from '@/lib/hooks';

export default function CategoriesPage() {
  const { data, error, loading, reload, setData } =
    useResource<CategoryDTO[]>('/categories?all=true');
  const [editing, setEditing] = useState<CategoryDTO | 'new' | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const toggle = async (c: CategoryDTO, active: boolean) => {
    try {
      const updated = await api.put<CategoryDTO>(`/categories/${c.id}`, { active });
      setData((list) => list?.map((x) => (x.id === c.id ? { ...x, ...updated } : x)) ?? null);
    } catch (e) {
      setRowError(errorMessage(e));
    }
  };
  const remove = async (c: CategoryDTO) => {
    setRowError(null);
    try {
      await api.del(`/categories/${c.id}`);
      await reload();
    } catch (e) {
      setRowError(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Inactive categories are hidden from the kiosk"
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
            New category
          </Button>
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void reload()} /> : null}
      {rowError ? <ErrorBanner message={rowError} /> : null}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[36rem]">
          <thead className="border-b border-line bg-canvas/60">
            <tr>
              <th className="th">Order</th>
              <th className="th">Category</th>
              <th className="th">Products</th>
              <th className="th">Active</th>
              <th className="th" />
            </tr>
          </thead>
          <TableShell loading={loading && !data} empty={data?.length === 0} colSpan={5}>
            {data?.map((c) => (
              <tr key={c.id} className="hover:bg-canvas/60">
                <td className="td tabular-nums text-ink-3">{c.sortOrder}</td>
                <td className="td">
                  <div className="flex items-center gap-3">
                    {assetUrl(c.image) ? (
                      <img src={assetUrl(c.image)!} alt="" className="size-9 rounded-lg" />
                    ) : (
                      <div className="size-9 rounded-lg bg-canvas" />
                    )}
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-ink-3">{c.description}</p>
                    </div>
                  </div>
                </td>
                <td className="td tabular-nums">{c.productCount ?? 0}</td>
                <td className="td">
                  <Toggle
                    label={`${c.name} active`}
                    checked={c.active}
                    onChange={(v) => void toggle(c, v)}
                  />
                </td>
                <td className="td text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                    <ConfirmButton onConfirm={() => void remove(c)} />
                  </div>
                </td>
              </tr>
            ))}
          </TableShell>
        </table>
      </div>
      {editing ? (
        <CategoryForm
          category={editing === 'new' ? null : editing}
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

function CategoryForm({
  category,
  onClose,
  onSaved,
}: {
  category: CategoryDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [image, setImage] = useState(category?.image ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [active, setActive] = useState(category?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name,
      description: description || null,
      image: image || null,
      sortOrder: Number(sortOrder) || 0,
      active,
    };
    try {
      if (category) await api.put(`/categories/${category.id}`, body);
      else await api.post('/categories', body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={category ? `Edit ${category.name}` : 'New category'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" busy={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-4">
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
        <Field label="Description">
          <input
            className="input"
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Image URL">
          <input className="input" value={image} onChange={(e) => setImage(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sort order">
            <input
              className="input"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <Toggle label="Active" checked={active} onChange={setActive} /> Active
          </label>
        </div>
      </form>
    </Modal>
  );
}
