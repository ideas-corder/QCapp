/**
 * Panel — consistent card chrome across the dashboard. Title + optional
 * subtitle / right-aligned action slot / content. White background,
 * slate border, slightly larger radius than the legacy flat dashboard
 * for a more modern feel.
 */
import * as React from 'react';

type Props = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Padding around the content. Default `p-5`. */
  bodyClassName?: string;
};

export default function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = 'p-5',
}: Props) {
  return (
    <section
      className={`bg-white rounded-xl border border-stone-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-stone-100">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-stone-900 truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-stone-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}