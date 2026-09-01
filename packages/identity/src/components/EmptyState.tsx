import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Primary action for the state, e.g. a create button. */
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="aiw-empty-state">
      <p className="aiw-empty-state-title">{title}</p>
      {description && (
        <p className="aiw-empty-state-description">{description}</p>
      )}
      {action && <div className="aiw-empty-state-action">{action}</div>}
    </div>
  );
}
