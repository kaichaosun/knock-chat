import { useMemo, type ReactNode } from "react"
import qrcode from "qrcode-generator"

import { cn } from "@/lib/utils"

/**
 * A QR code, drawn as one path.
 *
 * Rendered rather than taken from the library's own SVG so it can inherit its
 * colour from CSS — a code with a baked-in black stays black on a dark
 * background, where it is unreadable to a camera and looks broken to a person.
 *
 * Error correction is M when nothing sits on the code: a phone screen held up
 * to another phone is not a damaged surface, and the higher levels only make
 * the pattern denser and harder to read across a table. A code with something
 * in the middle of it goes to Q, because covered modules are damage whether or
 * not they were covered on purpose.
 */
export function QrCode({
  value,
  label,
  center,
  className,
}: {
  value: string
  /** What scanning it does, for anyone who cannot see the code. */
  label: string
  /** Whose code this is, sat in the middle of it. */
  center?: ReactNode
  className?: string
}) {
  const { path, size } = useMemo(() => {
    const code = qrcode(0, center ? "Q" : "M")
    code.addData(value)
    code.make()

    const size = code.getModuleCount()
    // One path of little squares. Far fewer nodes than a rect per module, which
    // matters at 37×37 and up.
    let path = ""
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        if (code.isDark(row, column)) path += `M${column} ${row}h1v1h-1z`
      }
    }
    return { path, size }
  }, [value, center])

  return (
    // A quiet zone is required for a scanner to find the code at all, and the
    // white ground has to be explicit: on a dark background the page colour
    // would show through the gaps between modules.
    <div className={cn("relative bg-white p-3 text-black", className)}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
        className="size-full"
        shapeRendering="crispEdges"
      >
        <path d={path} fill="currentColor" />
      </svg>
      {/* On its own white ground rather than straight on the modules: it has to
          read as covering the code, not as part of the pattern. */}
      {center && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-lg bg-white p-1">{center}</span>
        </span>
      )}
    </div>
  )
}
