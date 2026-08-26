import { Loader2 } from "lucide-react"

import { pullProgress, type Pull } from "@/hooks/use-pull-to-refresh"
import { cn } from "@/lib/utils"

/**
 * The mark that appears in the gap a pull opens.
 *
 * The same muted spinner every list in the app already shows while it is
 * loading — this is that moment, asked for by hand, and it should not arrive
 * dressed as something else. It sits in the gap rather than over the list, so
 * as far as it has come is how far the gesture has come: it fades and turns
 * with the pull, and once the pull is taken it turns on its own.
 */
export function PullIndicator({ pull }: { pull: Pull }) {
  const progress = pullProgress(pull.distance)

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center overflow-hidden"
      style={{ height: pull.distance }}
    >
      <Loader2
        className={cn("text-muted-foreground size-5", pull.refreshing && "animate-spin")}
        style={
          pull.refreshing
            ? undefined
            : {
                opacity: progress,
                transform: `rotate(${progress * 180}deg) scale(${0.7 + progress * 0.3})`,
              }
        }
      />
    </div>
  )
}
