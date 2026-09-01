interface LoadingRowsProps {
  /** Number of skeleton rows to draw. */
  rows?: number;
  /** Accessible description of what is loading. */
  label: string;
}

/** Skeleton placeholder for list and table loads. */
export function LoadingRows({ rows = 3, label }: LoadingRowsProps) {
  return (
    <div className="aiw-loading-rows" role="status" aria-busy="true">
      <span className="aiw-visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="aiw-loading-row" aria-hidden="true" />
      ))}
    </div>
  );
}
