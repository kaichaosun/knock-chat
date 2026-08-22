import { cn } from "@/lib/utils"

/**
 * The app mark: an envelope whose flap doubles as Nimiq's hexagon silhouette,
 * on the brand gradient.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "brand-gradient flex items-center justify-center rounded-2xl text-white shadow-lg",
        "shadow-primary/25",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-1/2"
        aria-hidden
      >
        <path d="M3 7.5 12 13l9-5.5" />
        <rect x="3" y="5" width="18" height="14" rx="3" />
      </svg>
    </div>
  )
}
