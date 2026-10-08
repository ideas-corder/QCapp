/**
 * DonutChart — pure inline-SVG donut chart with a hollow centre that
 * can hold a label (e.g. "88%" or "Total 40").
 *
 * Implementation: each slice is an SVG `<path>` with two arc commands
 * (outer arc + inner arc) connecting the slice's start and end angles.
 * This avoids the well-known pitfalls of stroke-dasharray on circles
 * (start-angle ambiguity, gap-length math, rotation behaviour across
 * browsers). The math is plain polar → cartesian.
 */
import * as React from 'react';

export type DonutSlice = {
  label: string;
  value: number;
  /** Tailwind text colour class for the legend. */
  colorClass?: string;
  /** Hex / rgb string actually rendered into the SVG. */
  color: string;
};

type Props = {
  data: DonutSlice[];
  /** Diameter in px. Default 148. */
  size?: number;
  /** Stroke-equivalent ring width as a fraction of the radius.
   *  Default 0.17. */
  thicknessRatio?: number;
  /** Centre label, e.g. "88%". If omitted, total is shown. */
  centerLabel?: string;
  /** Centre sub-label, e.g. "Pass rate". */
  centerSubLabel?: string;
  className?: string;
};

export default function DonutChart({
  data,
  size = 148,
  thicknessRatio = 0.17,
  centerLabel,
  centerSubLabel,
  className = '',
}: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const displayCenterLabel = centerLabel ?? total.toString();
  // Long totals/percentages should never overwhelm the centre of the chart.
  // Scale down progressively while keeping ordinary two/three-digit values
  // at a restrained dashboard-display size.
  const centerFontSize = Math.max(
    size * 0.105,
    Math.min(size * 0.145, size * 0.62 / Math.max(displayCenterLabel.length, 3)),
  );
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - size * thicknessRatio / 2;
  const innerRadius = radius - size * thicknessRatio;
  // Start at the top (-90°) and sweep clockwise.
  const startAngleBase = -Math.PI / 2;

  let cumulativeFraction = 0;
  const slices = data.map((d) => {
    const fraction = total > 0 ? d.value / total : 0;
    const startAngle = startAngleBase + cumulativeFraction * 2 * Math.PI;
    const endAngle = startAngle + fraction * 2 * Math.PI;
    cumulativeFraction += fraction;
    const path =
      fraction >= 0.999
        ? // Single-slice shortcut: a full ring rather than two arcs
          // meeting at the same point (which would render as nothing).
          describeFullRing(cx, cy, radius, innerRadius)
        : describeAnnulusSlice(cx, cy, radius, innerRadius, startAngle, endAngle);
    return {
      ...d,
      fraction,
      path,
    };
  });

  return (
    <div
      className={`flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6 ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0 overflow-visible"
        role="img"
        aria-label={`Donut chart showing ${displayCenterLabel}${
          centerSubLabel ? ` ${centerSubLabel}` : ''
        }`}
      >
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgb(231 229 228)"
          strokeWidth={size * thicknessRatio}
        />
        {slices.map((seg) =>
          seg.fraction > 0 ? (
            <path
              key={seg.label}
              d={seg.path}
              fill={seg.color}
              stroke="white"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ) : null,
        )}
        {/* Centre labels */}
        <text
          x={cx}
          y={centerSubLabel ? cy - 7 : cy}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-stone-900 font-semibold"
          style={{ fontSize: centerFontSize, fontVariantNumeric: 'tabular-nums' }}
        >
          {displayCenterLabel}
        </text>
        {centerSubLabel && (
          <text
            x={cx}
            y={cy + 13}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-stone-500 font-medium"
            style={{
              fontSize: size * 0.072,
              letterSpacing: '0.04em',
            }}
          >
            {centerSubLabel}
          </text>
        )}
      </svg>
      {/* Legend */}
      <ul className="w-full min-w-0 flex-1 space-y-2 text-[13px] sm:w-auto">
        {slices.map((seg) => (
          <li
            key={seg.label}
            className="flex items-center gap-2.5 text-stone-600"
          >
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full ring-2 ring-white"
              style={{ backgroundColor: seg.color }}
            />
            <span className="flex-1 truncate">{seg.label}</span>
            <span className="font-semibold tabular-nums text-stone-800">
              {seg.value}
            </span>
            {total > 0 && (
              <span className="w-9 text-right text-[11px] tabular-nums text-stone-400">
                {Math.round(seg.fraction * 100)}%
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
}

/**
 * Build an SVG `d` string for a donut slice (annulus sector) between
 * `startAngle` and `endAngle`. We always use the two-arc pattern so
 * the fill is a single closed path that the renderer can anti-alias.
 */
function describeAnnulusSlice(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const [sx1, sy1] = polar(cx, cy, outerR, startAngle);
  const [sx2, sy2] = polar(cx, cy, outerR, endAngle);
  const [ex1, ey1] = polar(cx, cy, innerR, endAngle);
  const [ex2, ey2] = polar(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  // Outer arc clockwise (sweep=1), then line to inner, inner arc
  // counter-clockwise (sweep=0), close.
  return [
    `M ${sx1.toFixed(3)} ${sy1.toFixed(3)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${sx2.toFixed(3)} ${sy2.toFixed(3)}`,
    `L ${ex1.toFixed(3)} ${ey1.toFixed(3)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ex2.toFixed(3)} ${ey2.toFixed(3)}`,
    'Z',
  ].join(' ');
}

/** Full-ring path used when one slice owns 100% of the data. */
function describeFullRing(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): string {
  const o = outerR + 0.5;
  const i = innerR - 0.5;
  return [
    `M ${cx - o} ${cy}`,
    `A ${o} ${o} 0 1 1 ${cx + o} ${cy}`,
    `A ${o} ${o} 0 1 1 ${cx - o} ${cy}`,
    'Z',
    `M ${cx - i} ${cy}`,
    `A ${i} ${i} 0 1 0 ${cx + i} ${cy}`,
    `A ${i} ${i} 0 1 0 ${cx - i} ${cy}`,
    'Z',
  ].join(' ');
}
