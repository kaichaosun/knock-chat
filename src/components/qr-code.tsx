import { useMemo } from "react"
import qrcode from "qrcode-generator"

import { cn } from "@/lib/utils"

/**
 * A QR code, drawn as one path.
 *
 * Rendered rather than taken from the library's own SVG so it can inherit its
 * colour from CSS — a code with a baked-in black stays black on a dark
 * background, where it is unreadable to a camera and looks broken to a person.
 *
 * Error correction is set to M: a phone screen held up to another phone is not
 * a damaged surface, and the higher levels only make the pattern denser and
 * harder to read across a table.
 */
export function QrCode({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const { path, size } = useMemo(() => {
    const code = qrcode(0, "M")
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
  }, [value])

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Scan to join this group"
      // A quiet zone is required for a scanner to find the code at all, and the
      // white ground has to be explicit: on a dark background the page colour
      // would show through the gaps between modules.
      className={cn("bg-white p-3 text-black", className)}
      shapeRendering="crispEdges"
    >
      <path d={path} fill="currentColor" />
    </svg>
  )
}
