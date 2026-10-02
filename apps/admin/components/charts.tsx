'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

/**
 * Single-series magnitude charts. One validated hue (#a0602c, ≥3:1 on white);
 * the chart title names the series, so no legend. Text uses ink tokens, never
 * the series colour. Recessive horizontal grid, no dual axes.
 */
const SERIES = '#a0602c';
const GRID = '#efe8df';
const INK_3 = '#8a7a6c';

function TooltipCard({
  active,
  payload,
  label,
  format,
}: TooltipContentProps<number, string> & { format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="font-semibold text-ink">{format(value)}</p>
    </div>
  );
}

export function ColumnChart<T extends object>({
  data,
  x,
  y,
  format,
  formatX,
  height = 260,
}: {
  data: T[];
  x: string;
  y: string;
  format: (v: number) => string;
  formatX?: (v: string) => string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey={x}
          tickLine={false}
          axisLine={false}
          tick={{ fill: INK_3, fontSize: 12 }}
          tickFormatter={formatX}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: INK_3, fontSize: 12 }}
          tickFormatter={(v: number) => format(v)}
          width={64}
        />
        <Tooltip
          cursor={{ fill: 'rgba(160, 96, 44, 0.08)' }}
          content={(props) => (
            <TooltipCard
              {...(props as TooltipContentProps<number, string>)}
              label={
                formatX && props.label !== undefined ? formatX(String(props.label)) : props.label
              }
              format={format}
            />
          )}
        />
        <Bar dataKey={y} fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RankedBars<T extends object>({
  data,
  label,
  value,
  format,
  height,
}: {
  data: T[];
  label: string;
  value: string;
  format: (v: number) => string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, data.length * 36 + 16)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 72, bottom: 0, left: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey={label}
          tickLine={false}
          axisLine={false}
          width={150}
          tick={{ fill: '#5b4a3d', fontSize: 13 }}
        />
        <Tooltip
          cursor={{ fill: 'rgba(160, 96, 44, 0.08)' }}
          content={(props) => (
            <TooltipCard {...(props as TooltipContentProps<number, string>)} format={format} />
          )}
        />
        <Bar
          dataKey={value}
          fill={SERIES}
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          label={{
            position: 'right',
            fill: '#5b4a3d',
            fontSize: 12,
            formatter: (v: unknown) => format(Number(v)),
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
