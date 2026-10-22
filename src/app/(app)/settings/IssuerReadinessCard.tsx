"use client";

import Link from "next/link";
import {useBrand} from "@/components/BrandProvider";
import {CheckCircleIcon, EmptyCircleIcon} from "@/components/ui/icons";
import {ISSUER_READY_MESSAGE, issuerReadiness, type IssuerReadinessInput} from "@/lib/issuerReadiness";

/**
 * The settings page's attestation checklist. `current` is the form as typed right now, `saved` is
 * what the server holds - the green "ready" state needs both, so a correct-but-unsaved form says
 * "save to finish" instead of claiming readiness the attestation routes would not yet see.
 */
export function IssuerReadinessCard({current, saved}: {current: IssuerReadinessInput; saved: IssuerReadinessInput}) {
  const brand = useBrand();
  const live = issuerReadiness(current, brand);
  const persisted = issuerReadiness(saved, brand);

  if (live.ready && persisted.ready) {
    return (
      <div className="flex items-start gap-3 rounded-card border border-border bg-ok-soft px-4 py-3 text-ok" role="status">
        <CheckCircleIcon size={20} className="mt-px shrink-0" />
        <div>
          <p className="text-body font-semibold">{ISSUER_READY_MESSAGE}</p>
          <p className="text-caption">
            Credentials will be signed as {current.name?.trim()} ({current.domain?.trim()}).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3" role="status">
      <p className="mb-2 text-body font-semibold text-ink">
        {live.ready ? "Save settings to finish - then you can perform issuer attestations." : "Before you can perform issuer attestations"}
      </p>
      <ul className="space-y-1.5">
        {live.items.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            {item.done ? (
              <CheckCircleIcon size={16} className="mt-0.5 shrink-0 text-ok" />
            ) : (
              <EmptyCircleIcon size={16} className="mt-0.5 shrink-0 text-ink-faint" />
            )}
            <span className="text-body">
              <span className={item.done ? "text-ink-muted" : "font-medium text-ink"}>{item.label}</span>
              {!item.done && item.hint && (
                <span className="text-ink-muted">
                  {" - "}
                  {item.hint}{" "}
                  {item.href && (
                    <Link href={item.href} className="font-medium text-link hover:underline">
                      {item.key === "clone" ? "Open setup" : "Go there"}
                    </Link>
                  )}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
