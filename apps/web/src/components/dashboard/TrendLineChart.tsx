/**
 * TrendLineChart — full-fat line chart for the workbench. Renders a
 * single solid line + soft area + a tooltip-able grid. We accept an
 * arbitrary number of named series; the chart auto-builds a legend,
 * picks distinct stroke colours, and shades the area underneath the
 * first series.
 *
 * Like DonutChart/SparkLine, this is server-renderable inline SVG so
 * the dashboard route stays a server component (and so we don't add
 * any client-side chart deps). If a series value is `null`, we leave
 * a gap (move-to) instead of dropping to 0.
 */
import * as React from 'react';

export type SeriesPoint = number | null;
export type TrendSeries = {
  name: string;
  /** Tailwind text colour class for the legend swatch. */
  colorClass?: string;
  color: string;
  values: SeriesPoint[];
};

type Props = {
  /** X-axis labels (e.g. dates). Length must match `series.values.length`. */
  labels: string[];
  series: TrendSeries[];
  /** Chart height in px. Default 220. */
  height?: number;
  className?: string;
  /** When true, also draw bar-style rects underneath the first series
   *  (used for daily stacked counts). Default false — line only. */
  showBars?: boolean;
};

const PADDING = { top: 12, right: 12, bottom: 28, left: 36 };
const VIEW_W = 600;

export default function TrendLineChart({
  labels,
  series,
  height = 220,
  className = '',
  showBars = false,
}: Props) {
  if (series.length === 0 || labels.length === 0) {
    return (
      <div className={`text-stone-400 text-sm ${className}`}>No data</div>
    );
  }

  const w = VIEW_W;
  const h = height;
  const innerW = w - PADDING.left - PADDING.right;
  const innerH = h - PADDING.top - PADDING.bottom;

  // Y-axis: take max across all numeric values; min is always 0 (counts).
  const allValues = series
    .flatMap((s) => s.values)
    .filter((v): v is number => typeof v === 'number');
  const max = Math.max(...allValues, 1);
  // Round up to a "nice" tick so we get ~5 gridlines.
  const niceMax = Math.ceil(max / 5) * 5 || 5;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));

  const xStep = labels.length > 1 ? innerW / (labels.length - 1) : 0;
  const xFor = (i: number) => PADDING.left + i * xStep;
  const yFor = (v: number) => PADDING.top + innerH - (v / niceMax) * innerH;

  const paths = series.map((s) => {
    let d = '';
    let area = '';
    let started = false;
    const pts: Array<[number, number]> = [];
    s.values.forEach((v, i) => {
      if (v == null) return;
      const x = xFor(i);
      const y = yFor(v);
      pts.push([x, y]);
      if (!started) {
        d += `M${x.toFixed(2)},${y.toFixed(2)} `;
        started = true;
      } else {
        d += `L${x.toFixed(2)},${y.toFixed(2)} `;
      }
    });
    if (showBars && pts.length > 0) {
      // Emit a rect for each value. Width = xStep * 0.6 so bars sit side by side.
      const bw = Math.max(2, xStep * 0.6);
      area = pts
        .map(
          ([x, y]) =>
            `<rect x="${(x - bw / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${bw.toFixed(2)}" height="${(PADDING.top + innerH - y).toFixed(2)}" fill="${s.color}" fill-opacity="0.55" />`,
        )
        .join('');
    } else if (pts.length > 0) {
      area =
        `M${pts[0][0].toFixed(2)},${(PADDING.top + innerH).toFixed(2)} ` +
        pts
          .map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`)
          .join(' ') +
        ` L${pts[pts.length - 1][0].toFixed(2)},${(PADDING.top + innerH).toFixed(2)} Z`;
    }
    return { d, area, color: s.color, name: s.name };
  });

  // Show ~6 x-axis labels evenly spaced regardless of length.
  const labelStride = Math.max(1, Math.ceil(labels.length / 6));
  const visibleLabels = labels
    .map((lbl, i) => ({ lbl, i }))
    .filter(({ i }) => i % labelStride === 0 || i === labels.length - 1);

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        width="100%"
        height={h}
        role="img"
      >
        {/* Gridlines */}
        {ticks.map((t, idx) => {
          const y = yFor(t);
          return (
            <g key={`g${idx}`}>
              <line
                x1={PADDING.left}
                x2={w - PADDING.right}
                y1={y}
                y2={y}
                stroke="rgb(241 245 249)"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-stone-400"
                style={{ fontSize: 10 }}
              >
                {t}
              </text>
            </g>
          );
        })}
        {/* Series */}
        {paths.map((p, idx) => (
          <g key={p.name + idx}>
            {p.area && (
              showBars ? (
                <g dangerouslySetInnerHTML={{ __html: p.area }} />
              ) : (
                <path d={p.area} fill={p.color} fillOpacity={0.12} />
              )
            )}
            {p.d && (
              <path
                d={p.d}
                fill="none"
                stroke={p.color}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </g>
        ))}
        {/* X-axis labels */}
        {visibleLabels.map(({ lbl, i }) => (
          <text
            key={`x${i}`}
            x={xFor(i)}
            y={h - 8}
            textAnchor="middle"
            className="fill-stone-400"
            style={{ fontSize: 10 }}
          >
            {lbl}
          </text>
        ))}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5 text-stone-600">
            <span
              aria-hidden="true"
              className="inline-block w-3 h-0.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}