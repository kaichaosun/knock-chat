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
 *
 * `corner` is applied to both kinds of face. It does nothing visible to an
 * identicon, whose hexagon never reaches its own corners, but applying it
 * unconditionally means the two cannot drift apart.
 */
function Face({ address, corner }: { address: string; corner: string }) {
  const directory = useNames()
  const face = faceIn(directory, address)
  const [broken, setBroken] = useState(false)

  if (!face || broken) {
    return (
      <img src={avatarUri(address)} alt="" className={cn("size-full object-cover", corner)} />
    )
  }
  return (
    <img
      src={faceSources(face).src}
      alt=""
      onError={() => setBroken(true)}
      className={cn("size-full object-cover", corner)}
    />
  )
}

/**
 * How far the faces sit inside the mosaic's own edge.
 *
 * Fixed pixels rather than a percentage, because percentage padding resolves
 * against the *containing block's* width — the row this mark happens to be
 * sitting in — rather than against the mark. One value per size is the only way
 * to keep it proportional to the thing it is insetting.
 */
const INSET = {
  sm: "p-[2px]",
  md: "p-[3px]",
  lg: "p-[4px]",
} as const

/**
 * Each tile's corners, as `border-radius`: top-left, top-right, bottom-right,
 * bottom-left.
 *
 * A tile's *outer* corner has to follow the curve of the mosaic it sits in, or
 * that curve cuts across it. Concentric rounding is the rule for two shapes
 * nested like this: the inner radius is the outer one minus the gap between
 * them. Here the mosaic is 22% of its width and the faces sit a little over 9%
 * inside it, which leaves about a third of a tile — and because every term
 * scales with the mark, 33% holds at all three sizes rather than needing one
 * number each.
 *
 * The other three corners stay nearly square. They meet the tiles beside them
 * rather than the outside world, and rounding those would open a hole in the
 * middle of the mark.
 *
 * This is what was wrong before: the faces were rounded uniformly and only 3px
 * inside a 10px curve, so the mosaic's own corners clipped them. It went
 * unnoticed while every face was an identicon — a hexagon leaves its corners
 * empty, so there was nothing there to clip — and became visible the moment a
 * photograph, which fills its square, arrived in one of these slots.
 */
const CORNERS = [
  "rounded-[33%_10%_10%_10%]",
  "rounded-[10%_33%_10%_10%]",
  "rounded-[10%_10%_10%_33%]",
  "rounded-[10%_10%_33%_10%]",
] as const

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
        // The radius stays proportional — border-radius percentages resolve
        // against the element's own box, so 22% is 22% of the mark at every
        // size. What it is inset by cannot be, hence [`INSET`].
        "rounded-[22%]",
        INSET[size],
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
          <div
            key={address ?? `empty-${slot}`}
            // Half the mark each way, then padded in. Two neighbouring cells
            // each pad by this much, so the gap between two faces is twice it —
            // which is what stops four photographs reading as one rectangle
            // with lines drawn on it. A percentage works here where it does not
            // on the container above: a cell's containing block *is* the mark.
            className="h-1/2 w-1/2 p-[4%]"
          >
            {address && <Face address={address} corner={CORNERS[slot]} />}
          </div>
        )
      })}
    </div>
  )
}
