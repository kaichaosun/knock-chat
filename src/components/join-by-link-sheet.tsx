import { useEffect, useState } from "react"
import { ClipboardPaste } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { groupIdFrom } from "@/lib/group-link"
import { cn } from "@/lib/utils"

/**
 * Get into a room from a link somebody sent.
 *
 * Opening the link directly works — Nimiq Pay carries a query string through
 * its deeplink — and scanning the code works too. Pasting is the route that
 * needs neither a camera nor a link that survived being sent.
 */
export function JoinByLinkSheet({
  open,
  onOpenChange,
  onFound,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Hands off to the same door the link would have opened. */
  onFound: (id: string) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState("")

  useEffect(() => {
    if (open) setValue("")
  }, [open])

  const id = groupIdFrom(value)
  const typed = value.trim() !== ""

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>{t("joinByLink.title")}</SheetTitle>
          <SheetDescription>
            {t("joinByLink.note")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 pb-6">
          <textarea
            rows={3}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("joinByLink.placeholder")}
            aria-label={t("joinByLink.label")}
            aria-invalid={typed && id === null}
            className={cn(
              "bg-muted w-full resize-none rounded-2xl px-4 py-3 font-mono text-[13px] leading-snug outline-none",
              "placeholder:text-muted-foreground/70 placeholder:font-sans placeholder:text-base",
              "focus-visible:ring-ring/60 focus-visible:ring-2",
              typed && id === null && "ring-destructive ring-2",
            )}
          />

          {typed && id === null && (
            <p className="text-destructive px-1 text-[13px]">
              <Trans
                i18nKey="joinByLink.nothingFound"
                components={{ code: <span className="font-mono" /> }}
              />
            </p>
          )}

          <Button
            disabled={id === null}
            onClick={() => id && onFound(id)}
            className="brand-gradient h-13 w-full rounded-2xl text-base"
          >
            <ClipboardPaste className="size-4" />
            {t("joinByLink.find")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
