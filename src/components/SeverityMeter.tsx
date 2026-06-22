import { severityLabel } from "@/lib/format";

// Restrained severity cue (PRD §7) — a calm 5-segment scale, never alarmist.
export function SeverityMeter({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  const segments = 5;
  const filled = Math.round((Math.max(0, Math.min(10, value)) / 10) * segments);
  const tone =
    value <= 3 ? "#94a3b8" : value <= 6 ? "#0f766e" : value <= 8 ? "#b45309" : "#b91c1c";
  return (
    <span className="inline-flex items-center gap-2" title={`Severity ${value}/10`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: segments }).map((_, i) => (
          <span
            key={i}
            className="h-2 w-3 rounded-sm"
            style={{ backgroundColor: i < filled ? tone : "#e2e8f0" }}
          />
        ))}
      </span>
      {showLabel && (
        <span className="text-xs text-slate-500">
          {severityLabel(value)} ({value}/10)
        </span>
      )}
    </span>
  );
}
