import { MessageSquare, UserRound, UsersRound } from "lucide-react"

import { cn } from "@/lib/utils"

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
    { id: "groups" as const, label: "Groups", icon: UsersRound, badge: 0 },
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
              active === id ? "text-primary" : "text-muted-foreground",
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
            <span className="text-[11px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
