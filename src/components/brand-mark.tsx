import { cn } from "@/lib/utils"

/**
 * The app mark: a door being knocked on.
 *
 * Drawn art rather than an icon on a coloured tile, so it carries its own
 * shape and its own blue. Nothing is layered behind it — the arch is the
 * silhouette people recognise, and a rounded square around it would only blunt
 * the one distinctive edge it has.
 *
 * Served from `public/` at its longest edge and scaled down by the browser: it
 * appears at a handful of sizes across the app, and one file that is always
 * sharp beats three that have to be kept in step.
 *
 * Wider than it is tall, and the real ratio is declared rather than squared off
 * — a square box would reserve height the art never uses, and every caller
 * would be centring against space that is not there. The two numbers below are
 * the file's own, so `scripts/icons.sh` — which writes it — is where they have
 * to be checked if the art is ever redrawn.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/knock-mark.png"
      alt=""
      aria-hidden
      width={512}
      height={495}
      className={cn("object-contain select-none", className)}
    />
  )
}
