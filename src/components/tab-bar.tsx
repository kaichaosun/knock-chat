import { MessageSquare, UserRound } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Three people, without drawing anybody.
 *
 * The tab beside this one is already a person, so a second person only says
 * "more of the same" — and at 20px the difference between one head and two is
 * a few grey pixels. A triangle of dots is a different shape rather than a
 * bigger crowd, which is what actually separates them at a glance.
 *
 * Filled rather than outlined: a 20px circle drawn with a 2px stroke is mostly
 * hole, and washes out next to two solid glyphs.
 */
function Huddle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="12" cy="6.2" r="3" />
      <circle cx="6.1" cy="16.4" r="3" />
      <circle cx="17.9" cy="16.4" r="3" />
    </svg>
  )
}

export type Tab = "chats" | "contacts" | "groups"

/** Bottom tabs, where a thumb can reach them. */
export function TabBar({
  active,
  onChange,
  unread,
}: {
  active: Tab
  onChange: (tab: Tab) => void
  unread: number
}) {
  const tabs = [
    { id: "chats" as const, label: "Chats", icon: MessageSquare, badge: unread },
    { id: "contacts" as const, label: "Contacts", icon: UserRound, badge: 0 },
    // Rooms, not people — a different glyph so the two are told apart at the
    // size a tab bar gives them.
    { id: "groups" as const, label: "Groups", icon: Huddle, badge: 0 },
  ]

  return (
    <nav className="bg-background/85 border-t backdrop-blur-xl pb-safe">
      <div className="flex">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active === id ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors",
              // Blue against grey is a difference in hue at nearly the same
              // lightness, and that is the one difference a glance across three
              // tabs does not register. So the gap is opened in lightness and in
              // weight instead — the resting tabs step back, the chosen one
              // keeps its colour and gains ink.
              active === id ? "text-primary" : "text-muted-foreground/75",
            )}
          >
            <span className="relative">
              <Icon className="size-5" />
              {badge > 0 && (
                <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums">
                  {badge}
                </span>
              )}
            </span>
            <span className={cn("text-[11px]", active === id ? "font-bold" : "font-medium")}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  )
}
