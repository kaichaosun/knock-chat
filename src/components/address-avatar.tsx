import { avatarGradient, avatarMonogram } from "@/lib/avatar"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: "size-8 text-[11px]",
  md: "size-11 text-[13px]",
  lg: "size-16 text-lg",
} as const

/** A stable, address-derived avatar: brand gradient plus a two-character monogram. */
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
    <div
      aria-hidden
      style={{ backgroundImage: avatarGradient(address) }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide text-white",
        "shadow-sm ring-1 ring-black/5 select-none",
        SIZES[size],
        className,
      )}
    >
      {avatarMonogram(address)}
    </div>
  )
}
