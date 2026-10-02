'use client';

import type { CategoryDTO, ProductDTO, ProductOptionGroupDTO } from '@gcs/types';
import { ArrowDown, ArrowUp, Plus, Star } from 'lucide-react';
import { useState, type FormEvent } from 'react';
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
import { api, assetUrl } from '@/lib/api';
import { money } from '@/lib/format';
import { errorMessage, useResource } from '@/lib/hooks';

export default function ProductsPage() {
  const products = useResource<ProductDTO[]>('/products?all=true');
  const categories = useResource<CategoryDTO[]>('/categories?all=true');
  const groups = useResource<ProductOptionGroupDTO[]>('/option-groups');
  const [editing, setEditing] = useState<ProductDTO | 'new' | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const patch = async (p: ProductDTO, body: Partial<ProductDTO>) => {
    setRowError(null);
    try {
      const updated = await api.put<ProductDTO>(`/products/${p.id}`, body);
      products.setData((list) => list?.map((x) => (x.id === p.id ? updated : x)) ?? null);
    } catch (e) {
      setRowError(errorMessage(e));
    }
  };

  const remove = async (p: ProductDTO) => {
    try {
      await api.del(`/products/${p.id}`);
      await products.reload();
    } catch (e) {
      setRowError(errorMessage(e));
    }
  };

  const visible =
    products.data?.filter((p) => !categoryFilter || p.categoryId === categoryFilter) ?? [];

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Menu items shown on the kiosk"
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
            New product
          </Button>
        }
      />
      {products.error ? (
        <ErrorBanner message={products.error} onRetry={() => void products.reload()} />
      ) : null}
      {rowError ? <ErrorBanner message={rowError} /> : null}

      <select
        className="input mb-4 w-full sm:w-56"
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value)}
        aria-label="Filter by category"
      >
        <option value="">All categories</option>
        {categories.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[46rem]">
          <thead className="border-b border-line bg-canvas/60">
            <tr>
              <th className="th">Product</th>
              <th className="th">Category</th>
              <th className="th text-right">Price</th>
              <th className="th max-xl:hidden">Options</th>
              <th className="th">Available</th>
              <th className="th">Featured</th>
              <th className="th" />
            </tr>
          </thead>
          <TableShell
            loading={products.loading && !products.data}
            empty={visible.length === 0}
            colSpan={7}
          >
            {visible.map((p) => (
              <tr key={p.id} className="hover:bg-canvas/60">
                <td className="td">
                  <div className="flex items-center gap-3">
                    {assetUrl(p.image) ? (
                      <img
                        src={assetUrl(p.image)!}
                        alt=""
                        className="size-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="size-10 rounded-lg bg-canvas" />
                    )}
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="line-clamp-1 text-xs text-ink-3">{p.description}</p>
                    </div>
                  </div>
                </td>
                <td className="td text-ink-2">{p.category?.name}</td>
                <td className="td text-right tabular-nums">{money(p.price)}</td>
                <td className="td text-xs text-ink-3 max-xl:hidden">
                  {p.optionGroups.map((g) => g.name).join(', ') || '—'}
                </td>
                <td className="td">
                  <Toggle
                    label={`${p.name} available`}
                    checked={p.available}
                    onChange={(v) => void patch(p, { available: v })}
                  />
                </td>
                <td className="td">
                  <button
                    type="button"
                    aria-label={p.featured ? 'Unfeature' : 'Feature'}
                    aria-pressed={p.featured}
                    onClick={() => void patch(p, { featured: !p.featured })}
                  >
                    <Star
                      className={`size-5 ${p.featured ? 'fill-warn text-warn' : 'text-line'}`}
                      aria-hidden
                    />
                  </button>
                </td>
                <td className="td text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    <ConfirmButton onConfirm={() => void remove(p)} />
                  </div>
                </td>
              </tr>
            ))}
          </TableShell>
        </table>
      </div>

      {editing ? (
        <ProductForm
          product={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          groups={groups.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void products.reload();
          }}
        />
      ) : null}
    </>
  );
}

function ProductForm({
  product,
  categories,
  groups,
  onClose,
  onSaved,
}: {
  product: ProductDTO | null;
  categories: CategoryDTO[];
  groups: ProductOptionGroupDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [image, setImage] = useState(product?.image ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [available, setAvailable] = useState(product?.available ?? true);
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [groupIds, setGroupIds] = useState<string[]>(product?.optionGroups.map((g) => g.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const priceNumber = Number(price);
  const priceError =
    price === ''
      ? undefined
      : !Number.isFinite(priceNumber) || priceNumber <= 0
        ? 'Price must be greater than 0'
        : !/^\d+(\.\d{1,2})?$/.test(price.trim())
          ? 'Use at most 2 decimals'
          : undefined;

  const move = (id: string, dir: -1 | 1) =>
    setGroupIds((ids) => {
      const i = ids.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ids.length) return ids;
      const next = [...ids];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (priceError || price === '') {
      setError(priceError ?? 'Price is required');
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      name,
      description: description || null,
      price: priceNumber,
      image: image || null,
      categoryId,
      available,
      featured,
      optionGroupIds: groupIds,
    };
    try {
      if (product) await api.put(`/products/${product.id}`, body);
      else await api.post('/products', body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={product ? `Edit ${product.name}` : 'New product'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" busy={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        {error ? (
          <div className="md:col-span-2">
            <ErrorBanner message={error} />
          </div>
        ) : null}
        <Field label="Name">
          <input
            className="input"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Category">
          <select
            className="input"
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <textarea
              className="input"
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Base price" error={priceError}>
          <input
            className="input"
            inputMode="decimal"
            required
            placeholder="2.50"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label="Image URL" hint="/static/products/latte.svg or https://…">
          <input className="input" value={image} onChange={(e) => setImage(e.target.value)} />
        </Field>
        <div className="flex items-center gap-6 md:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <Toggle label="Available" checked={available} onChange={setAvailable} /> Available
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Toggle label="Featured" checked={featured} onChange={setFeatured} /> Featured (Popular)
          </label>
        </div>
        <div className="md:col-span-2">
          <span className="label">Option groups (in display order)</span>
          <div className="grid gap-2 md:grid-cols-2">
            {groups.map((g) => {
              const index = groupIds.indexOf(g.id);
              const on = index >= 0;
              return (
                <div
                  key={g.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${on ? 'border-brand bg-brand-soft/50' : 'border-line'}`}
                >
                  <input
                    type="checkbox"
                    id={`g-${g.id}`}
                    checked={on}
                    onChange={() =>
                      setGroupIds((ids) => (on ? ids.filter((x) => x !== g.id) : [...ids, g.id]))
                    }
                  />
                  <label htmlFor={`g-${g.id}`} className="flex-1">
                    {on ? (
                      <span className="mr-1 font-semibold text-brand">{index + 1}.</span>
                    ) : null}
                    {g.name} <span className="text-ink-3">({g.options.length})</span>
                    {g.required ? <Badge tone="warn">required</Badge> : null}
                  </label>
                  {on ? (
                    <>
                      <button
                        type="button"
                        aria-label={`Move ${g.name} up`}
                        onClick={() => move(g.id, -1)}
                      >
                        <ArrowUp className="size-4 text-ink-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${g.name} down`}
                        onClick={() => move(g.id, 1)}
                      >
                        <ArrowDown className="size-4 text-ink-3" />
                      </button>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
