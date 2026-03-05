import { useMemo, useState, useRef, useCallback } from 'react';
import type { Expense } from '../types';
import { getAvatarColor } from '../utils/format';
import { format, parseISO } from 'date-fns';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface Props {
  expenses: Expense[];
  members: string[];
  currency: string;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL_W = 600;
const FULL_H = 280;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 40;

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
        const net = exp.splits[m] ?? 0;
        const paid = m === exp.paidBy ? exp.cost : 0;
        const share = paid - net;
        running[m] += share;
      }
      points.push({ date: exp.date, totals: { ...running } });
    }

    return points;
  }, [expenses, members]);

  const defaultVB: ViewBox = { x: 0, y: 0, w: FULL_W, h: FULL_H };
  const [viewBox, setViewBox] = useState<ViewBox>(defaultVB);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, vbx: 0, vby: 0 });
  const lastTouchDist = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);

  const clampVB = useCallback((vb: ViewBox): ViewBox => {
    const w = Math.max(100, Math.min(FULL_W, vb.w));
    const h = Math.max(60, Math.min(FULL_H, vb.h));
    const x = Math.max(0, Math.min(FULL_W - w, vb.x));
    const y = Math.max(0, Math.min(FULL_H - h, vb.y));
    return { x, y, w, h };
  }, []);

  const svgPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * viewBox.w + viewBox.x,
        y: ((clientY - rect.top) / rect.height) * viewBox.h + viewBox.y
      };
    },
    [viewBox]
  );

  const zoom = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      setViewBox((prev) => {
        const pivotX = cx ?? prev.x + prev.w / 2;
        const pivotY = cy ?? prev.y + prev.h / 2;
        const nw = prev.w * factor;
        const nh = prev.h * factor;
        return clampVB({
          x: pivotX - (pivotX - prev.x) * factor,
          y: pivotY - (pivotY - prev.y) * factor,
          w: nw,
          h: nh
        });
      });
    },
    [clampVB]
  );

  const resetView = useCallback(() => setViewBox(defaultVB), []);

  // Mouse wheel zoom
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const pt = svgPoint(e.clientX, e.clientY);
      const factor = e.deltaY > 0 ? 1.15 : 0.87;
      zoom(factor, pt.x, pt.y);
    },
    [svgPoint, zoom]
  );

  // Mouse drag
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      dragging.current = true;
      const pt = svgPoint(e.clientX, e.clientY);
      dragStart.current = { x: pt.x, y: pt.y, vbx: viewBox.x, vby: viewBox.y };
      e.preventDefault();
    },
    [svgPoint, viewBox]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging.current) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.movementX / rect.width) * viewBox.w;
      const dy = (e.movementY / rect.height) * viewBox.h;
      setViewBox((prev) =>
        clampVB({ ...prev, x: prev.x - dx, y: prev.y - dy })
      );
    },
    [viewBox, clampVB]
  );

  const onMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Touch pan & pinch-zoom
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        dragging.current = true;
        const pt = svgPoint(e.touches[0].clientX, e.touches[0].clientY);
        dragStart.current = {
          x: pt.x,
          y: pt.y,
          vbx: viewBox.x,
          vby: viewBox.y
        };
      }
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
        lastTouchCenter.current = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
      }
    },
    [svgPoint, viewBox]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && dragging.current) {
        if (!svgRef.current) return;
        const pt = svgPoint(e.touches[0].clientX, e.touches[0].clientY);
        const startPt = dragStart.current;
        setViewBox((prev) =>
          clampVB({
            ...prev,
            x: startPt.vbx + (startPt.x - pt.x),
            y: startPt.vby + (startPt.y - pt.y)
          })
        );
      }
      if (e.touches.length === 2 && lastTouchDist.current !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const factor = lastTouchDist.current / dist;
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const pt = svgPoint(cx, cy);
        zoom(factor, pt.x, pt.y);
        lastTouchDist.current = dist;
      }
    },
    [svgPoint, clampVB, zoom]
  );

  const onTouchEnd = useCallback(() => {
    dragging.current = false;
    lastTouchDist.current = null;
    lastTouchCenter.current = null;
  }, []);

  if (!cumulativeData || cumulativeData.length < 2 || members.length === 0) {
    return null;
  }

  const chartW = FULL_W - PAD_L - PAD_R;
  const chartH = FULL_H - PAD_T - PAD_B;

  let maxVal = 0;
  for (const pt of cumulativeData) {
    for (const m of members) {
      if (pt.totals[m] > maxVal) maxVal = pt.totals[m];
    }
  }
  maxVal = Math.ceil(maxVal * 1.1) || 1;

  const xScale = (i: number) =>
    PAD_L + (i / (cumulativeData.length - 1)) * chartW;
  const yScale = (v: number) => PAD_T + chartH - (v / maxVal) * chartH;

  const gridLines = 4;
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) =>
    Math.round((maxVal / gridLines) * i)
  );

  const labelCount = Math.min(5, cumulativeData.length);
  const labelIndices = Array.from({ length: labelCount }, (_, i) =>
    Math.round((i * (cumulativeData.length - 1)) / (labelCount - 1))
  );

  const isZoomed = viewBox.w < FULL_W - 1 || viewBox.h < FULL_H - 1;

  return (
    <div className="bg-bg-card border-border/50 rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-text-muted text-xs font-semibold tracking-wide uppercase">
          Spending Over Time
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => zoom(0.75)}
            className="text-text-muted hover:text-text-primary hover:bg-bg-surface rounded-md p-1 transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => zoom(1.33)}
            className="text-text-muted hover:text-text-primary hover:bg-bg-surface rounded-md p-1 transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          {isZoomed && (
            <button
              onClick={resetView}
              className="text-text-muted hover:text-text-primary hover:bg-bg-surface rounded-md p-1 transition-colors"
              title="Reset view"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="touch-none overflow-hidden rounded-lg select-none">
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className="w-full cursor-grab active:cursor-grabbing"
          style={{ minHeight: 200 }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Grid lines */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD_L}
                x2={FULL_W - PAD_R}
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
                y={FULL_H - 8}
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

      <p className="text-text-muted mt-1.5 text-[10px]">
        Scroll to zoom · Drag to pan
      </p>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
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
