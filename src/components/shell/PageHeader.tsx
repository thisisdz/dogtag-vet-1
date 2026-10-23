import type {ReactNode} from "react";

export function PageHeader({title, description, action}: {title: string; description?: string; action?: ReactNode}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        <h1 className="text-page-title text-ink">{title}</h1>
        {description && <p className="mt-1 text-body text-ink-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0 self-start">{action}</div>}
    </div>
  );
}
