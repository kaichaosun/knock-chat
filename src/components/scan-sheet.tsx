import { useEffect, useRef, useState } from "react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { readCode, type Code } from "@/lib/knock-code"
import { cn } from "@/lib/utils"

/** What a frame is decoded with where the platform brings its own reader. */
type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }

declare global {
  interface Window {
    /** Present in Chrome and Android WebViews, absent on iOS. */
    BarcodeDetector?: new (options?: { formats?: string[] }) => Detector
  }
}

/** Frames are decoded at most this often. Faster reads nothing sooner and costs battery. */
const DECODE_EVERY_MS = 120

/** Frames are scaled down to this width before decoding, which is plenty for a code. */
const DECODE_WIDTH = 480

/**
 * Read somebody's code with the camera.
 *
 * The camera is only asked for while the sheet is open, and the track is
 * stopped on the way out — a mini app that leaves the indicator lit after you
 * have closed it has done something worse than fail to scan.
 *
 * Decoding goes through the platform's own reader where there is one and falls
 * back to a library where there is not, which on iOS is always: `BarcodeDetector`
 * has never shipped in WKWebView, and that is where Nimiq Pay runs.
 */
export function ScanSheet({
  open,
  onOpenChange,
  onFound,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The same door a pasted link opens. */
  onFound: (code: Code) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  /** Why there is no picture, when there is none. */
  const [error, setError] = useState<string | null>(null)
  /** Something was read and it was not a Knock code. Shown without stopping. */
  const [foreign, setForeign] = useState(false)
  /** Whether there are frames yet. Until there are, the element is hidden. */
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!open) return

    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    let lastDecode = 0
    let detector: Detector | null = null
    let canvas: HTMLCanvasElement | null = null

    setError(null)
    setForeign(false)
    setLive(false)

    const stop = () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }

    const read = async (video: HTMLVideoElement): Promise<string | null> => {
      if (detector) {
        const found = await detector.detect(video).catch(() => [])
        return found[0]?.rawValue ?? null
      }

      canvas ??= document.createElement("canvas")
      const scale = Math.min(1, DECODE_WIDTH / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) return null
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      const { default: jsQR } = await import("jsqr")
      // The code is on a screen or on paper, never inverted, and trying the
      // other polarity doubles the work of every frame that reads nothing.
      return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null
    }

    const tick = async (time: number) => {
      const video = videoRef.current
      if (stopped || !video) return
      if (time - lastDecode >= DECODE_EVERY_MS && video.readyState >= video.HAVE_CURRENT_DATA) {
        lastDecode = time
        const text = await read(video).catch(() => null)
        if (stopped) return
        if (text) {
          const code = readCode(text)
          if (code) {
            stop()
            onOpenChange(false)
            onFound(code)
            return
          }
          // Kept scanning: they are pointing at something, and the thing they
          // meant may be the next code along.
          setForeign(true)
        }
      }
      frame = requestAnimationFrame((next) => void tick(next))
    }

    const start = async () => {
      if (!window.isSecureContext) {
        setError("The camera needs a secure connection. Open Knock over https.")
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser won't hand over a camera.")
        return
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The one pointing away from you, which is the one a code is in front of.
          video: { facingMode: "environment" },
        })
      } catch (cause) {
        const name = cause instanceof Error ? cause.name : ""
        setError(
          name === "NotAllowedError"
            ? "Knock wasn't given the camera. You can allow it and try again."
            : name === "NotFoundError"
              ? "No camera on this device."
              : "The camera wouldn't start.",
        )
        return
      }

      if (stopped || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      if (window.BarcodeDetector) {
        try {
          detector = new window.BarcodeDetector({ formats: ["qr_code"] })
        } catch {
          // Present but without QR among its formats. The library covers it.
        }
      }

      videoRef.current.srcObject = stream
      await videoRef.current.play().catch(() => {})
      if (stopped) return
      setLive(true)
      frame = requestAnimationFrame((time) => void tick(time))
    }

    void start()
    return stop
  }, [open, onFound, onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Scan a code</SheetTitle>
          <SheetDescription>
            {error
              ? "Nothing to scan with."
              : foreign
                ? "That code isn't a Knock one. Still looking."
                : "Point it at someone's invite link or a group's code."}
          </SheetDescription>
        </SheetHeader>

        <div className="pb-8">
          {error ? (
            <p className="text-muted-foreground bg-muted rounded-2xl px-4 py-6 text-center text-[13px] leading-snug">
              {error}
            </p>
          ) : (
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                disablePictureInPicture
                // Hidden until it has frames. A media element with no source
                // yet draws the platform's own placeholder — on Android a play
                // triangle — and the wait here is however long the permission
                // prompt takes.
                className={cn(
                  // Filled rather than fitted: a letterboxed picture reads as a
                  // broken camera, and the code is held in the middle either way.
                  "size-full object-cover transition-opacity duration-200",
                  live ? "opacity-100" : "opacity-0",
                )}
              />
              {!live && (
                <p className="absolute inset-0 flex items-center justify-center text-[13px] text-white/70">
                  Starting the camera…
                </p>
              )}
              {/* Where to hold it. Nothing is cropped to this — the whole frame
                  is decoded — so it is a suggestion rather than a boundary. */}
              {live && (
                <span className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
