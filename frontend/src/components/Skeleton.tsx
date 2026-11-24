import React from 'react';

interface SkeletonProps {
  className?: string;
  rounded?: 'card' | 'tile' | 'pill' | 'full' | 'md' | 'modal';
  width?: string | number;
  height?: string | number;
  /** aria-label for the skeleton region (default: "Loading…") */
  label?: string;
}

/** Single shimmer block */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  rounded = 'card',
  width,
  height,
  label,
}) => {
  const roundedClass = {
    card: 'rounded-[20px]',
    modal: 'rounded-[20px]',
    tile: 'rounded-[14px]',
    pill: 'rounded-full',
    full: 'rounded-full',
    md: 'rounded-md',
  }[rounded];

  return (
    <div
      role="status"
      aria-label={label ?? 'Loading…'}
      className={`animate-shimmer ${roundedClass} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
};

/** Pre-built skeleton that matches the KPI stat card layout */
export const StatCardSkeleton: React.FC = () => (
  <div className="bg-card-light dark:bg-card-dark rounded-[20px] p-5 shadow-bento border border-hairline-light dark:border-hairline-dark space-y-3">
    {/* Icon + label row */}
    <div className="flex items-center justify-between">
      <Skeleton className="h-3 w-24" rounded="pill" label="Loading label…" />
      <Skeleton className="h-8 w-8" rounded="full" label="Loading icon…" />
    </div>
    {/* Hero number */}
    <Skeleton className="h-9 w-36 mt-1" rounded="pill" label="Loading value…" />
    {/* Trend chip */}
    <Skeleton className="h-5 w-20" rounded="pill" label="Loading trend…" />
  </div>
);

/** Pre-built skeleton that matches the chart card layout */
export const ChartCardSkeleton: React.FC<{ height?: string }> = ({ height = 'h-64' }) => (
  <div className={`bg-card-light dark:bg-card-dark rounded-[20px] p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col gap-4 ${height}`}>
    <div className="flex items-center justify-between">
      <Skeleton className="h-3.5 w-32" rounded="pill" label="Loading chart title…" />
      <Skeleton className="h-3 w-16" rounded="pill" label="Loading chart meta…" />
    </div>
    {/* Chart area */}
    <Skeleton className="flex-1 w-full" rounded="tile" label="Loading chart…" />
  </div>
);

/** Pre-built skeleton for table rows */
export const TableRowSkeleton: React.FC<{ cols?: number }> = ({ cols = 5 }) => (
  <tr aria-hidden="true">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="py-3 px-3">
        <Skeleton className="h-3" rounded="pill" width={i === 0 ? 80 : i === cols - 1 ? 48 : 120} />
      </td>
    ))}
  </tr>
);
