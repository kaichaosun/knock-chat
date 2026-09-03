import { useState } from "react"
import { Users } from "lucide-react"

import { useNames } from "@/hooks/use-names"
import { avatarUri, faceSources } from "@/lib/avatar"
import { faceIn } from "@/lib/names"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: "size-8",
  md: "size-11",
  lg: "size-16",
} as const

/**
 * One quarter of the mosaic: whoever is in that slot, as they are drawn
 * everywhere else.
 *
 * Only the smallest rendition, and no `srcSet` — a quarter of a 44px tile is
 * eleven points, so even a phone's pixel ratio asks for less than the 96 this
 * fetches. Anything larger would be bytes spent on detail the tile cannot show.
 */
function Face({ address }: { address: string }) {
  const directory = useNames()
  const face = faceIn(directory, address)
  const [broken, setBroken] = useState(false)

  if (!face || broken) {
    return <img src={avatarUri(address)} alt="" className="size-full object-cover" />
  }
  return (
    <img
      src={faceSources(face).src}
      alt=""
      onError={() => setBroken(true)}
      className="size-full rounded-[18%] object-cover"
    />
  )
}

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
          // Drawn from the foreground rather than from a surface token, so it
          // holds against whatever is behind it. A fixed tint has to pick one
          // background to look right on, and this appears on three: a plain
          // row, a pinned row, and a sheet. `bg-accent` was one of them, and
          // dissolved into the other two.
          "bg-foreground/10 text-foreground/55 flex shrink-0 items-center justify-center rounded-2xl",
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
        // The ground behind the faces, seen through the quarters a room with
        // fewer than four members leaves empty. Same reasoning as above.
        "bg-foreground/10 shrink-0 overflow-hidden",
        // The inset keeps the faces off the tile's own edge — an identicon is a
        // hexagon running nearly the full width of its box, and without it the
        // outer faces are clipped by the rounding. Fixed pixels because two of
        // them read the same at all three sizes; the radius stays proportional
        // because border-radius percentages are not in dispute anywhere.
        "rounded-[22%] p-[2px]",
        //
        // Four cells at half the width and half the height, wrapped — not a
        // grid with two stated rows. That is what this was, and on WebKit the
        // rows collapsed anyway: two faces landed side by side in one row and
        // stretched to the full height of the tile, which is a pair of stripes
        // rather than a mark. A row template is a request. A cell that is
        // itself half as tall as its parent is a measurement, and there is
        // nothing left to interpret.
        //
        // `content-start` because a single wrapped line would otherwise be
        // stretched to fill, which puts one face in the middle of the tile
        // instead of in its corner.
        "flex flex-wrap content-start",
        SIZES[size],
        className,
      )}
    >
      {/* Four slots, always — the empty ones drawn as nothing rather than left
          out, so a room of two and a room of four are the same shape. */}
      {Array.from({ length: MOST }, (_, slot) => {
        const address = faces[slot]
        return (
          <div key={address ?? `empty-${slot}`} className="h-1/2 w-1/2 p-[1px]">
            {address && <Face address={address} />}
          </div>
        )
      })}
    </div>
  )
}
