import { cn } from "@/lib/utils"

/**
 * The app mark: a door being knocked on.
 *
 * Drawn art rather than an icon on a coloured tile, so it carries its own
 * shape and its own blue. Nothing is layered behind it — the arch is the
 * silhouette people recognise, and a rounded square around it would only blunt
 * the one distinctive edge it has.
 *
 * Served from `public/` at 512px and scaled down by the browser: it appears at
 * a handful of sizes across the app, and one file that is always sharp beats
 * three that have to be kept in step.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/knock-mark.png"
      alt=""
      aria-hidden
      width={512}
      height={512}
      className={cn("object-contain select-none", className)}
    />
  )
}
