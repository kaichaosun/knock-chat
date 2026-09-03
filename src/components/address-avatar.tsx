import { useState } from "react"

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
 * What each size actually measures, for `sizes`.
 *
 * The browser needs the CSS width to decide which rendition to fetch, and it
 * cannot read it off a Tailwind class. Kept beside `SIZES` so the two cannot
 * drift: `size-8` is 2rem, `size-11` is 2.75rem, `size-16` is 4rem.
 */
const WIDTHS = {
  sm: "2rem",
  md: "2.75rem",
  lg: "4rem",
} as const

/**
 * The face for an address: the picture it wears, or its Nimiq identicon.
 *
 * The identicon is the default and the fallback, never a placeholder waiting to
 * be replaced. It is derived from the address, so it is right the instant an
 * address is known, cannot be borrowed by anybody else, and is the same face the
 * rest of Nimiq draws for that address.
 *
 * The two are shaped differently on purpose. An identicon keeps its hexagon —
 * that is how Nimiq draws one everywhere else, and rounding it off would cut
 * away the silhouette that makes one recognisable before you have read a single
 * character of the address. A chosen picture is a circle, which is what a person
 * reads as in every other app, and which keeps it distinct from the rounded
 * square a room's mark uses.
 */
export function AddressAvatar({
  address,
  size = "md",
  className,
}: {
  address: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const directory = useNames()
  const face = faceIn(directory, address)
  // A fingerprint this device remembers can outlive the picture it names — one
  // taken down, a relay that lost it, a URL that will not load. Falling back to
  // the identicon is better than a broken image, and it is keyed by fingerprint
  // so a new picture gets its own chance rather than inheriting this one's.
  const [broken, setBroken] = useState<string | null>(null)

  if (!face || broken === face) {
    return (
      <img
        // Decorative: every avatar sits next to the address it was made from.
        alt=""
        src={avatarUri(address)}
        draggable={false}
        className={cn("shrink-0 select-none", SIZES[size], className)}
      />
    )
  }

  const { src, srcSet } = faceSources(face)
  return (
    <img
      alt=""
      src={src}
      srcSet={srcSet}
      sizes={WIDTHS[size]}
      draggable={false}
      onError={() => setBroken(face)}
      className={cn(
        "shrink-0 rounded-full object-cover select-none",
        // The ground shows through while the picture is still arriving, so a
        // row does not jump when it lands.
        "bg-foreground/10",
        SIZES[size],
        className,
      )}
    />
  )
}
