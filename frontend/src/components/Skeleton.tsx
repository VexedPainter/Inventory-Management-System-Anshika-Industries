import React from 'react';

interface SkeletonProps {
  className?: string;
  rounded?: 'card' | 'tile' | 'pill' | 'full' | 'md';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  rounded = 'card',
  width,
  height,
}) => {
  const roundedClass = {
    card: 'rounded-card',
    tile: 'rounded-tile',
    pill: 'rounded-pill',
    full: 'rounded-full',
    md: 'rounded-md',
  }[rounded];

  return (
    <div
      className={`bg-black/5 dark:bg-white/5 animate-shimmer ${roundedClass} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
};
