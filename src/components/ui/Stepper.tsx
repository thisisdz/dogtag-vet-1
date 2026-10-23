import {CheckCircleIcon} from "@/components/ui/icons";

export interface StepperStep {
  key: string;
  label: string;
}

/**
 * A real sequence, numbered because it is one (docs/BRAND.md: structure must say something true).
 * `reachedKey` is the last milestone reached: it and everything before it carry a check, and the
 * step after it is the current one (what is being waited on), marked with aria-current. State
 * never depends on color alone.
 */
export function Stepper({steps, reachedKey}: {steps: StepperStep[]; reachedKey: string}) {
  const reachedIndex = steps.findIndex((s) => s.key === reachedKey);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Progress">
      {steps.map((step, i) => {
        const done = i <= reachedIndex;
        const current = i === reachedIndex + 1;
        return (
          <li key={step.key} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
            {done ? (
              <CheckCircleIcon size={20} className="shrink-0 text-ok" />
            ) : (
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-caption font-semibold ${
                  current ? "border-brand bg-brand text-on-brand" : "border-border-strong text-ink-muted"
                }`}
              >
                {i + 1}
              </span>
            )}
            <span className={`text-body ${current ? "font-semibold text-ink" : done ? "text-ink" : "text-ink-muted"}`}>{step.label}</span>
            {i < steps.length - 1 && <span aria-hidden className="mx-1 hidden h-px w-6 bg-border-strong sm:inline-block" />}
          </li>
        );
      })}
    </ol>
  );
}
