'use client';

import type { InventoryItemDTO, ProductDTO } from '@gcs/types';
import { Minus, Plus, TriangleAlert } from 'lucide-react';
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
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage, useResource } from '@/lib/hooks';

export default function InventoryPage() {
  const { data, error, loading, reload, setData } = useResource<InventoryItemDTO[]>('/inventory');
  const products = useResource<ProductDTO[]>('/products?all=true');
  const [editing, setEditing] = useState<InventoryItemDTO | 'new' | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const low = data?.filter((i) => i.lowStock).length ?? 0;

  const adjust = async (item: InventoryItemDTO, delta: number) => {
    setRowError(null);
    try {
      const updated = await api.post<InventoryItemDTO>(`/inventory/${item.id}/adjust`, { delta });
      setData((list) => list?.map((x) => (x.id === item.id ? updated : x)) ?? null);
    } catch (e) {
      setRowError(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={low > 0 ? `${low} item(s) running low` : 'Stock levels'}
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
            New item
          </Button>
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void reload()} /> : null}
      {rowError ? <ErrorBanner message={rowError} /> : null}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[46rem]">
          <thead className="border-b border-line bg-canvas/60">
            <tr>
              <th className="th">Item</th>
              <th className="th">Linked product</th>
              <th className="th text-right">In stock</th>
              <th className="th text-right">Low at</th>
              <th className="th">Adjust</th>
              <th className="th" />
            </tr>
          </thead>
          <TableShell loading={loading && !data} empty={data?.length === 0} colSpan={6}>
            {data?.map((item) => (
              <tr
                key={item.id}
                className={item.lowStock ? 'bg-warn-soft/40' : 'hover:bg-canvas/60'}
              >
                <td className="td font-semibold">
                  {item.name}{' '}
                  {item.lowStock ? (
                    <Badge tone="warn">
                      <TriangleAlert className="size-3" aria-hidden /> Low stock
                    </Badge>
                  ) : null}
                </td>
                <td className="td text-ink-2">{item.product?.name ?? '—'}</td>
                <td className="td text-right tabular-nums">
                  {item.quantity} {item.unit}
                </td>
                <td className="td text-right tabular-nums text-ink-3">
                  {item.lowStockThreshold} {item.unit}
                </td>
                <td className="td">
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      className="px-2 py-1"
                      aria-label={`Remove one ${item.unit} of ${item.name}`}
                      disabled={item.quantity < 1}
                      onClick={() => void adjust(item, -1)}
                      icon={<Minus className="size-4" aria-hidden />}
                    />
                    <Button
                      variant="secondary"
                      className="px-2 py-1"
                      aria-label={`Add one ${item.unit} of ${item.name}`}
                      onClick={() => void adjust(item, 1)}
                      icon={<Plus className="size-4" aria-hidden />}
                    />
                    <Button
                      variant="secondary"
                      className="px-2 py-1"
                      onClick={() => void adjust(item, 10)}
                    >
                      +10
                    </Button>
                  </div>
                </td>
                <td className="td text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => setEditing(item)}>
                      Edit
                    </Button>
                    <ConfirmButton
                      onConfirm={() =>
                        void api
                          .del(`/inventory/${item.id}`)
                          .then(reload)
                          .catch((e) => setRowError(errorMessage(e)))
                      }
                    />
                  </div>
                </td>
              </tr>
            ))}
          </TableShell>
        </table>
      </div>
      {editing ? (
        <InventoryForm
          item={editing === 'new' ? null : editing}
          products={products.data ?? []}
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

function InventoryForm({
  item,
  products,
  onClose,
  onSaved,
}: {
  item: InventoryItemDTO | null;
  products: ProductDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 0));
  const [threshold, setThreshold] = useState(String(item?.lowStockThreshold ?? 0));
  const [productId, setProductId] = useState(item?.productId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name,
      unit,
      quantity: Number(quantity),
      lowStockThreshold: Number(threshold),
      productId: productId || null,
    };
    try {
      if (item) await api.put(`/inventory/${item.id}`, body);
      else await api.post('/inventory', body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={item ? `Edit ${item.name}` : 'New inventory item'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="inv-form" busy={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="inv-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        {error ? (
          <div className="col-span-2">
            <ErrorBanner message={error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Field label="Name">
            <input
              className="input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Quantity">
          <input
            className="input"
            type="number"
            min={0}
            step="0.001"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label="Unit">
          <input
            className="input"
            required
            maxLength={20}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </Field>
        <Field label="Low-stock threshold">
          <input
            className="input"
            type="number"
            min={0}
            step="0.001"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </Field>
        <Field label="Linked product">
          <select
            className="input"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">None</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}
