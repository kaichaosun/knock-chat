import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { LegalDoc } from "@/lib/legal"

/**
 * The terms, or the privacy policy.
 *
 * One sheet for both, because they are the same shape and reading either is the
 * same act. Set in the app's own type rather than as a wall of legal boilerplate
 * — a document nobody can read is a document nobody has agreed to.
 */
export function LegalSheet({
  doc,
  open,
  onOpenChange,
}: {
  doc: LegalDoc | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open && doc !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{doc?.title}</SheetTitle>
        </SheetHeader>

        {doc && (
          /* Selectable, unlike most of the app: this is the one text somebody
             may reasonably want to quote back at us. */
          <div className="select-text space-y-6 pb-8">
            <div className="space-y-2">
              <p className="text-muted-foreground text-[11px]">Last updated {doc.updated}</p>
              <p className="text-[13px] leading-relaxed">{doc.intro}</p>
            </div>

            {doc.sections.map((section) => (
              <section key={section.heading} className="space-y-1.5">
                <h3 className="text-sm font-semibold">{section.heading}</h3>
                {section.body.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-muted-foreground text-[13px] leading-relaxed wrap-anywhere"
                  >
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
