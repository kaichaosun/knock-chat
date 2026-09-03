/**
 * Getting a picture off the device and into a shape worth uploading.
 *
 * A phone camera produces something like 12 megapixels and four megabytes. What
 * the relay keeps is at most 384 pixels square, so sending the original would
 * spend most of an upload on detail that is discarded on arrival — over mobile
 * data, for a picture that ends up eight kilobytes.
 *
 * So the file is decoded here, cropped square, scaled to [`UPLOAD_SIDE`] and
 * re-encoded before it leaves. None of that is a security measure: the relay
 * decodes and re-encodes everything it is sent regardless, because a client is
 * not something to be trusted about its own upload. This is only about not
 * sending four megabytes.
 */

/**
 * The side of what gets uploaded, in pixels.
 *
 * Comfortably above the largest rendition the relay makes, so the picture it
 * scales down from is never the limit on how good the result looks — and far
 * enough above it that a later, larger rendition would not need everyone to
 * upload again.
 */
export const UPLOAD_SIDE = 512

/** JPEG quality for the upload. Higher than the relay's, since this one is scaled again. */
const QUALITY = 0.9

/** Why a file could not be turned into a picture. */
export class PictureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PictureError"
  }
}

/** Where to cut a square out of a rectangle, and how big to draw it. */
export type CropBox = {
  /** Left edge of the square in the source. */
  sx: number
  /** Top edge of the square in the source. */
  sy: number
  /** The square's side in the source. */
  side: number
  /** The side it is drawn at, which is the smaller of `side` and the ceiling. */
  target: number
}

/**
 * The centre square of a `width` × `height` picture, drawn no larger than `most`.
 *
 * Centred because that is where people put the subject, and because any other
 * choice is a guess about content this cannot see. Never scaled *up*: a 200px
 * picture uploaded as 512 would be the same picture with more bytes, and the
 * relay would scale it down again anyway.
 */
export function cropBox(width: number, height: number, most = UPLOAD_SIDE): CropBox {
  const side = Math.min(width, height)
  return {
    // Floored so the box lands on whole pixels; a half-pixel source rectangle
    // makes the browser resample a picture that did not need it.
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    side,
    target: Math.min(side, most),
  }
}

/**
 * Whether any pixel in RGBA `data` is see-through.
 *
 * Decides the upload's format, and mirrors what the relay asks of the result: a
 * photograph that happens to have been saved as a PNG has an alpha channel and
 * no transparency, and sending it as a PNG would multiply its size for nothing.
 * Only a picture that really is see-through — a logo, a cut-out — needs the
 * format that can say so.
 */
export function hasAlpha(data: Uint8ClampedArray): boolean {
  for (let at = 3; at < data.length; at += 4) {
    if (data[at] !== 255) return true
  }
  return false
}

/**
 * Turn a file the picker handed over into the bytes to upload.
 *
 * Throws [`PictureError`] for anything that will not decode, which is the same
 * answer the relay would give — reaching it here just saves the round trip.
 */
export async function prepare(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    // `from-image` applies the EXIF rotation a phone writes instead of turning
    // the pixels. Without it every portrait photo arrives on its side.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    throw new PictureError("that file isn't a picture")
  }

  try {
    const { sx, sy, side, target } = cropBox(bitmap.width, bitmap.height)
    const canvas = document.createElement("canvas")
    canvas.width = target
    canvas.height = target

    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new PictureError("this browser can't prepare a picture")
    // Scaling 4000px down to 512 in one step is where a browser's default
    // filtering shows; asking for the good one costs nothing at this size.
    context.imageSmoothingQuality = "high"
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target)

    const transparent = hasAlpha(context.getImageData(0, 0, target, target).data)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        resolve,
        transparent ? "image/png" : "image/jpeg",
        transparent ? undefined : QUALITY,
      )
    })
    if (!blob) throw new PictureError("this browser couldn't prepare that picture")
    return blob
  } finally {
    // The decoded frame can be several megabytes and is of no further use once
    // it has been drawn.
    bitmap.close()
  }
}
