import { avatarUri } from "@/lib/avatar"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: "size-8",
  md: "size-11",
  lg: "size-16",
} as const

/**
 * The Nimiq identicon for an address.
 *
 * Deliberately not cropped to a circle: the hexagon is how Nimiq draws
 * identicons everywhere else, and rounding it off would cut away the silhouette
 * that makes one recognizable before you have read a single character of the
 * address.
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
