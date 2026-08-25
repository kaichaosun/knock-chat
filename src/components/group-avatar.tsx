import { Users } from "lucide-react"

import { avatarUri } from "@/lib/avatar"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: "size-8",
  md: "size-11",
  lg: "size-16",
} as const

/**
 * How many faces a mosaic draws.
 *
 * Four, matching what the relay sends. A 3×3 grid at the 44px a list gives you
 * is 13px a face, which is past the point where an identicon is a shape and
 * into the point where it is a coloured smudge — distinctive per room, but no
 * longer anybody in particular.
 */
const MOST = 4

/**
 * A room's mark: the faces of the people in it.
 *
 * A single identicon is deliberately not used — those stand for a person, and a
 * room is not a person. A mosaic reads differently at a glance, which is what
 * keeps a room from being mistaken for somebody in a list where telling the two
 * apart is the first thing you do.
 *
 * Always four quarters, filled top-left to bottom-right, with empty slots left
 * empty. A fixed frame is what makes the mosaic read as "a room" wherever it
 * appears; a one-member room and a four-member room having different silhouettes
 * would be a difference that means nothing to whoever is scanning the list.
 *
 * Drawn from the earliest members rather than any four, so the mark holds still.
 * Something built from whoever happens to be in the room today would rearrange
 * every time a person joined or left, and a mark that keeps changing is not one
 * you can recognise.
 *
 * Falls back to the glyph when nobody is known — a room whose membership has
 * not arrived, or one this list does not carry faces for.
 */
export function GroupAvatar({
  members,
  size = "md",
  className,
}: {
  /** The room's earliest members. Absent on screens that do not know them. */
  members?: string[]
  size?: keyof typeof SIZES
  className?: string
}) {
  const faces = (members ?? []).slice(0, MOST)

  if (faces.length === 0) {
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

  return (
    <div
      aria-hidden
      className={cn(
        "bg-accent grid shrink-0 gap-px overflow-hidden rounded-2xl",
        // Always four slots, filled from the top left. A grid that changed
        // shape with the number of faces would give two rooms two different
        // marks for no reason a reader could see — the quarters are what makes
        // it recognisable as a room at all. Rows and columns are both stated,
        // never left to auto: an auto row sizes to its content, and the content
        // is an image asking for 100% of that row, which resolves to nothing.
        "grid-cols-2 grid-rows-2",
        SIZES[size],
        className,
      )}
    >
      {faces.map((address) => (
        <img key={address} src={avatarUri(address)} alt="" className="size-full object-cover" />
      ))}
    </div>
  )
}
