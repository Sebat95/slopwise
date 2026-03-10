import { useMemo, useRef, useCallback } from 'react';
import type { Expense } from '../types';
import { format, parseISO } from 'date-fns';

const CHART_COLORS = [
  '#5bc5a7',
  '#e74c3c',
  '#3498db',
  '#f39c12',
  '#9b59b6',
  '#e67e22',
  '#e91e63',
  '#00bcd4',
  '#2ecc71',
  '#ff6b6b',
  '#4ecdc4',
  '#ffe66d',
  '#a29bfe',
  '#fd79a8',
  '#636e72',
];

interface Props {
  expenses: Expense[];
  members: string[];
  dateFrom: string;
  dateTo: string;
  onRangeChange: (from: string, to: string) => void;
}

const W = 600;
const H = 220;
const BRUSH_H = 40;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 12;
const PAD_B = 28;
const CHART_W = W - PAD_L - PAD_R;
const CHART_H = H - PAD_T - PAD_B;

export default function SpendingChart({
  expenses,
  members,
  dateFrom,
  dateTo,
  onRangeChange
}: Props) {
  const allData = useMemo(() => {
    const nonPayments = expenses
      .filter((e) => e.category !== 'Payment')
      .sort((a, b) => a.date.localeCompare(b.date));

    if (nonPayments.length === 0) return null;

    const running: Record<string, number> = {};
    for (const m of members) running[m] = 0;

    const points: { date: string; totals: Record<string, number> }[] = [];
    for (const exp of nonPayments) {
      for (const m of members) {
        const net = exp.splits[m] ?? 0;
        const paid = m === exp.paidBy ? exp.cost : 0;
        running[m] += paid - net;
      }
      points.push({ date: exp.date, totals: { ...running } });
    }
    return points;
  }, [expenses, members]);

  // Range indices derived from dateFrom/dateTo
  const [rangeStart, rangeEnd] = useMemo(() => {
    if (!allData) return [0, 0];
    let s = 0;
    let e = allData.length - 1;
    if (dateFrom) {
      const idx = allData.findIndex((p) => p.date >= dateFrom);
      if (idx >= 0) s = idx;
    }
    if (dateTo) {
      for (let i = allData.length - 1; i >= 0; i--) {
        if (allData[i].date <= dateTo) {
          e = i;
          break;
        }
      }
    }
    if (s > e) s = e;
    return [s, e];
  }, [allData, dateFrom, dateTo]);

  // Brush drag state
  const containerRef = useRef<HTMLDivElement>(null);
  const dragMode = useRef<'left' | 'right' | 'middle' | null>(null);
  const dragOrigin = useRef({ x: 0, startIdx: 0, endIdx: 0 });

  const idxFromClientX = useCallback(
    (clientX: number): number => {
      if (!allData || !containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const relX = clientX - rect.left;
      const pct = (relX - PAD_L) / CHART_W;
      return Math.round(
        Math.max(0, Math.min(allData.length - 1, pct * (allData.length - 1)))
      );
    },
    [allData]
  );

  const commitRange = useCallback(
    (s: number, e: number) => {
      if (!allData) return;
      const from = allData[Math.max(0, Math.min(s, allData.length - 1))].date;
      const to = allData[Math.max(0, Math.min(e, allData.length - 1))].date;
      onRangeChange(from, to);
    },
    [allData, onRangeChange]
  );

  const dragStarted = useRef(false);
  const DRAG_THRESHOLD = 4;

  const onPointerDown = useCallback(
    (e: React.PointerEvent, mode: 'left' | 'right' | 'middle') => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragMode.current = mode;
      dragStarted.current = false;
      dragOrigin.current = {
        x: e.clientX,
        startIdx: rangeStart,
        endIdx: rangeEnd
      };
    },
    [rangeStart, rangeEnd]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragMode.current || !allData) return;
      const origin = dragOrigin.current;

      if (!dragStarted.current) {
        if (Math.abs(e.clientX - origin.x) < DRAG_THRESHOLD) return;
        dragStarted.current = true;
      }

      const idx = idxFromClientX(e.clientX);

      if (dragMode.current === 'left') {
        const s = Math.min(idx, rangeEnd);
        commitRange(s, rangeEnd);
      } else if (dragMode.current === 'right') {
        const end = Math.max(idx, rangeStart);
        commitRange(rangeStart, end);
      } else {
        const delta = idx - idxFromClientX(origin.x);
        let s = origin.startIdx + delta;
        let end = origin.endIdx + delta;
        const span = end - s;
        if (s < 0) {
          s = 0;
          end = span;
        }
        if (end > allData.length - 1) {
          end = allData.length - 1;
          s = end - span;
        }
        commitRange(Math.max(0, s), Math.min(allData.length - 1, end));
      }
    },
    [allData, rangeStart, rangeEnd, idxFromClientX, commitRange]
  );

  const onPointerUp = useCallback(() => {
    dragMode.current = null;
  }, []);

  if (!allData || allData.length < 2 || members.length === 0) return null;

  // Visible slice for the main chart
  const visible = allData.slice(rangeStart, rangeEnd + 1);

  let maxVal = 0;
  for (const pt of visible) {
    for (const m of members) {
      if (pt.totals[m] > maxVal) maxVal = pt.totals[m];
    }
  }
  maxVal = Math.ceil(maxVal * 1.1) || 1;

  const xScale = (i: number) =>
    PAD_L +
    (visible.length > 1 ? (i / (visible.length - 1)) * CHART_W : CHART_W / 2);
  const yScale = (v: number) => PAD_T + CHART_H - (v / maxVal) * CHART_H;

  // Brush positions (full data range)
  const brushX = (i: number) => PAD_L + (i / (allData.length - 1)) * CHART_W;
  const leftX = brushX(rangeStart);
  const rightX = brushX(rangeEnd);

  // Mini chart for brush
  let brushMax = 0;
  for (const pt of allData) {
    for (const m of members) {
      if (pt.totals[m] > brushMax) brushMax = pt.totals[m];
    }
  }
  brushMax = brushMax || 1;
  const brushYScale = (v: number) =>
    BRUSH_H - 4 - (v / brushMax) * (BRUSH_H - 8);

  const gridLines = 4;
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) =>
    Math.round((maxVal / gridLines) * i)
  );

  const labelCount = Math.min(5, visible.length);
  const labelIndices = Array.from({ length: labelCount }, (_, i) =>
    Math.round((i * (visible.length - 1)) / Math.max(labelCount - 1, 1))
  );

  return (
    <div className="bg-bg-card border-border/50 rounded-2xl border p-4">
      <h2 className="text-text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
        Spending Over Time
      </h2>

      {/* Main chart — shows selected range */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
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

        {labelIndices.map((idx) => {
          const pt = visible[idx];
          if (!pt) return null;
          let label: string;
          try {
            label = format(parseISO(pt.date), "MMM d ''yy");
          } catch {
            label = pt.date;
          }
          return (
            <text
              key={idx}
              x={xScale(idx)}
              y={H - 4}
              textAnchor="middle"
              className="fill-text-muted"
              fontSize={10}
            >
              {label}
            </text>
          );
        })}

        {members.map((m, mi) => {
          const color = CHART_COLORS[mi % CHART_COLORS.length];
          const pathD = visible
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
              <circle
                cx={xScale(visible.length - 1)}
                cy={yScale(visible[visible.length - 1].totals[m] || 0)}
                r={3.5}
                fill={color}
              />
            </g>
          );
        })}
      </svg>

      {/* Brush range selector */}
      <div
        ref={containerRef}
        className="relative touch-none select-none"
        style={{ height: BRUSH_H }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Mini overview chart */}
        <svg
          viewBox={`0 0 ${W} ${BRUSH_H}`}
          className="absolute inset-0 h-full w-full"
        >
          <rect
            x={PAD_L}
            y={0}
            width={CHART_W}
            height={BRUSH_H}
            fill="var(--color-bg-surface)"
            rx={4}
          />
          {members.map((m, mi) => {
            const color = CHART_COLORS[mi % CHART_COLORS.length];
            const d = allData
              .map(
                (pt, i) =>
                  `${i === 0 ? 'M' : 'L'}${brushX(i).toFixed(1)},${brushYScale(pt.totals[m] || 0).toFixed(1)}`
              )
              .join(' ');
            return (
              <path
                key={m}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={1}
                opacity={0.5}
              />
            );
          })}

          {/* Dimmed regions outside selection */}
          <rect
            x={PAD_L}
            y={0}
            width={Math.max(0, leftX - PAD_L)}
            height={BRUSH_H}
            fill="var(--color-bg-dark)"
            opacity={0.5}
            rx={4}
          />
          <rect
            x={rightX}
            y={0}
            width={Math.max(0, PAD_L + CHART_W - rightX)}
            height={BRUSH_H}
            fill="var(--color-bg-dark)"
            opacity={0.5}
            rx={4}
          />
        </svg>

        {/* Draggable selection window */}
        <div
          className="absolute top-0 cursor-grab active:cursor-grabbing"
          style={{
            left: `${(leftX / W) * 100}%`,
            width: `${Math.max(((rightX - leftX) / W) * 100, 2)}%`,
            height: BRUSH_H
          }}
          onPointerDown={(e) => onPointerDown(e, 'middle')}
        >
          <div className="border-primary/60 h-full border-t-2 border-b-2" />
        </div>

        {/* Left handle */}
        <div
          className="absolute cursor-col-resize"
          style={{
            left: `${(leftX / W) * 100}%`,
            width: 36,
            top: -4,
            height: BRUSH_H + 8,
            transform: 'translateX(-18px)'
          }}
          onPointerDown={(e) => onPointerDown(e, 'left')}
        >
          <div className="bg-primary mx-auto mt-2.5 h-[calc(100%-16px)] w-1.5 rounded-full" />
        </div>

        {/* Right handle */}
        <div
          className="absolute cursor-col-resize"
          style={{
            left: `${(rightX / W) * 100}%`,
            width: 36,
            top: -4,
            height: BRUSH_H + 8,
            transform: 'translateX(-18px)'
          }}
          onPointerDown={(e) => onPointerDown(e, 'right')}
        >
          <div className="bg-primary mx-auto mt-2.5 h-[calc(100%-16px)] w-1.5 rounded-full" />
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {members.map((m, mi) => (
          <div key={m} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: CHART_COLORS[mi % CHART_COLORS.length] }}
            />
            <span className="text-text-secondary text-xs">{m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
