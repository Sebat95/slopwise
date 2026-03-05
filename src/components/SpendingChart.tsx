import { useMemo } from 'react';
import type { Expense } from '../types';
import { getAvatarColor } from '../utils/format';
import { format, parseISO } from 'date-fns';

interface Props {
  expenses: Expense[];
  members: string[];
  currency: string;
}

export default function SpendingChart({ expenses, members }: Props) {
  const cumulativeData = useMemo(() => {
    const nonPayments = expenses
      .filter((e) => e.category !== 'Payment')
      .sort((a, b) => a.date.localeCompare(b.date));

    if (nonPayments.length === 0) return null;

    const running: Record<string, number> = {};
    for (const m of members) running[m] = 0;

    const points: { date: string; totals: Record<string, number> }[] = [];

    for (const exp of nonPayments) {
      for (const m of members) {
        // Each person's share of this expense (what they owe/consumed)
        // net > 0 means they paid more than their share, net < 0 means they owe
        // Their share = paidAmount - net  (for payer: cost - net, for others: 0 - net = |net|)
        const net = exp.splits[m] ?? 0;
        const paid = m === exp.paidBy ? exp.cost : 0;
        const share = paid - net; // what this person consumed
        running[m] += share;
      }
      points.push({ date: exp.date, totals: { ...running } });
    }

    return points;
  }, [expenses, members]);

  if (!cumulativeData || cumulativeData.length < 2 || members.length === 0) {
    return null;
  }

  const W = 600;
  const H = 280;
  const PAD_L = 48;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 40;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  let maxVal = 0;
  for (const pt of cumulativeData) {
    for (const m of members) {
      if (pt.totals[m] > maxVal) maxVal = pt.totals[m];
    }
  }
  maxVal = Math.ceil(maxVal * 1.1) || 1;

  const xScale = (i: number) =>
    PAD_L + (i / (cumulativeData.length - 1)) * chartW;
  const yScale = (v: number) =>
    PAD_T + chartH - (v / maxVal) * chartH;

  const gridLines = 4;
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) =>
    Math.round((maxVal / gridLines) * i)
  );

  // Pick ~5 date labels spread evenly
  const labelCount = Math.min(5, cumulativeData.length);
  const labelIndices = Array.from({ length: labelCount }, (_, i) =>
    Math.round((i * (cumulativeData.length - 1)) / (labelCount - 1))
  );

  return (
    <div className="bg-bg-card border-border/50 rounded-2xl border p-4">
      <h2 className="text-text-muted mb-3 text-xs font-semibold tracking-wide uppercase">
        Spending Over Time
      </h2>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ minWidth: 320 }}
        >
          {/* Grid lines */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yScale(tick)}
                y2={yScale(tick)}
                stroke="var(--color-border)"
                strokeWidth={0.5}
              />
              <text
                x={PAD_L - 6}
                y={yScale(tick) + 4}
                textAnchor="end"
                className="fill-text-muted"
                fontSize={10}
              >
                {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick}
              </text>
            </g>
          ))}

          {/* X-axis date labels */}
          {labelIndices.map((idx) => {
            const pt = cumulativeData[idx];
            let label: string;
            try {
              label = format(parseISO(pt.date), 'MMM d');
            } catch {
              label = pt.date;
            }
            return (
              <text
                key={idx}
                x={xScale(idx)}
                y={H - 8}
                textAnchor="middle"
                className="fill-text-muted"
                fontSize={10}
              >
                {label}
              </text>
            );
          })}

          {/* Lines for each member */}
          {members.map((m) => {
            const color = getAvatarColor(m);
            const pathD = cumulativeData
              .map(
                (pt, i) =>
                  `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(pt.totals[m] || 0).toFixed(1)}`
              )
              .join(' ');

            return (
              <g key={m}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* End dot */}
                <circle
                  cx={xScale(cumulativeData.length - 1)}
                  cy={yScale(
                    cumulativeData[cumulativeData.length - 1].totals[m] || 0
                  )}
                  r={4}
                  fill={color}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {members.map((m) => (
          <div key={m} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: getAvatarColor(m) }}
            />
            <span className="text-text-secondary text-xs">{m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
