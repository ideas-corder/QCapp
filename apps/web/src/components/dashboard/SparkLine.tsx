/**
 * SparkLine — tiny line chart used inside KpiTile cards. No axes, no
 * legend; just a smoothed polyline, the area underneath it, and an
 * optional end-point dot. Width is fluid (`viewBox` + `preserveAspectRatio`).
 */
import * as React from 'react';

type Props = {
  /** Y values in order. Missing days should be 0, not null. */
  values: number[];
  /** Stroke colour. Default brand. */
  stroke?: string;
  /** Fill colour for the area. Defaults to stroke @ 12% alpha. */
  fill?: string;
  /** Chart height in px. Default 36. */
  height?: number;
  className?: string;
  /** Show dot at the last point. Default true. */
  endDot?: boolean;
};

export default function SparkLine({
  values,
  stroke = 'rgb(var(--brand))',
  fill,
  height = 36,
  className = '',
  endDot = true,
}: Props) {
  if (values.length === 0) {
    return <div style={{ height }} className={className} />;
  }
  const width = 200; // viewBox width; the SVG scales to its container
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const padY = 4;
  const innerH = height - padY * 2;
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = padY + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });
  const linePath = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const areaPath =
    `M${pts[0][0].toFixed(2)},${height} ` +
    pts.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(' ') +
    ` L${pts[pts.length - 1][0].toFixed(2)},${height} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={className}
    >
      <path d={areaPath} fill={fill ?? 'rgb(var(--brand) / 0.12)'} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {endDot && (
        <circle cx={last[0]} cy={last[1]} r={2.4} fill={stroke} />
      )}
    </svg>
  );
}