import type { TooltipRenderProps } from "react-joyride";
import { Button } from "@/components/ui/Button";

// Custom tour tooltip so the walkthrough uses our own Button + tokens instead of
// react-joyride's default chrome. react-joyride spreads the relevant a11y/click
// handlers onto each *Props bag; we just place them on our components.
export function TourTooltip({
  index,
  size,
  step,
  isLastStep,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      className="w-[20rem] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-4 shadow-lg"
    >
      {step.title ? <h3 className="text-h3 text-ink">{step.title}</h3> : null}
      <div className="mt-1 text-body text-muted">{step.content}</div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm tabular-nums text-faint">
          {index + 1} / {size}
        </span>

        <div className="flex items-center gap-2">
          {/* Skip is only worth showing while there are steps left to skip. */}
          {!isLastStep ? (
            <button
              {...skipProps}
              type="button"
              className="rounded-md px-2 py-1 text-sm text-muted transition hover:text-ink"
            >
              Skip
            </button>
          ) : null}
          {index > 0 ? (
            <Button {...backProps} variant="ghost" size="sm">
              Back
            </Button>
          ) : null}
          <Button {...primaryProps} variant="primary" size="sm">
            {isLastStep ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
