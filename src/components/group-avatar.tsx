import { Users } from "lucide-react"

import { cn } from "@/lib/utils"

const SIZES = {
  sm: "size-8",
  md: "size-11",
  lg: "size-16",
} as const

/**
 * A room's mark.
 *
 * Deliberately not an identicon. Those are derived from an address and stand
 * for a person; a room is not a person and giving it a face would put the two
 * in the same visual language, in a list where telling them apart is the first
 * thing you do. A plain glyph on a flat tile reads as "a place", not "somebody".
 */
export function GroupAvatar({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "bg-accent text-accent-foreground flex shrink-0 items-center justify-center rounded-2xl",
        SIZES[size],
        className,
      )}
    >
      <Users className={size === "lg" ? "size-7" : "size-5"} strokeWidth={1.75} />
    </div>
  )
}
