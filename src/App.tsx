import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { ConnectScreen } from "@/components/connect-screen"
import { Conversation } from "@/components/conversation"
import { Inbox } from "@/components/inbox"
import { NewConversation } from "@/components/new-conversation"
import { ProfileSheet } from "@/components/profile-sheet"
import { Button } from "@/components/ui/button"
import { useMessages } from "@/hooks/use-messages"
import { useWallet } from "@/hooks/use-wallet"
import { compact } from "@/lib/address"
import { copyText } from "@/lib/clipboard"
import type { Message } from "@/lib/messages"
import { devIdentities } from "@/lib/wallet"

export default function App() {
  const { state, retry } = useWallet()
  const address = state.status === "connected" ? state.wallet.address : null

  const { conversations, threadWith, send, retry: retrySend, markRead, relayStatus } =
    useMessages(address)

  const [openPeer, setOpenPeer] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  // Let the hardware/gesture back control leave a thread instead of the app.
  useEffect(() => {
    if (!openPeer) return
    window.history.pushState({ thread: openPeer }, "")
    const onPop = () => setOpenPeer(null)
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [openPeer])

  const openThread = useCallback(
    (peer: string) => {
      setOpenPeer(peer)
      markRead(peer)
    },
    [markRead],
  )

  const closeThread = useCallback(() => {
    // Unwind the entry pushed above so back doesn't need two presses.
    if (window.history.state?.thread) window.history.back()
    else setOpenPeer(null)
  }, [])

  const copy = useCallback(async (text: string) => {
    const ok = await copyText(text)
    toast[ok ? "success" : "error"](ok ? "Address copied" : "Couldn't copy address")
  }, [])

  const onSend = useCallback(
    async (body: string) => {
      if (!openPeer) return
      try {
        await send(openPeer, body)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Message failed to send")
      }
    },
    [openPeer, send],
  )

  const onRetrySend = useCallback(
    async (message: Message) => {
      try {
        await retrySend(message)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Still couldn't send")
      }
    },
    [retrySend],
  )

  if (state.status !== "connected") {
    return (
      <ConnectScreen
        connecting={state.status === "connecting"}
        message={state.status === "unavailable" ? state.message : undefined}
        onRetry={retry}
      />
    )
  }

  const { wallet } = state

  if (openPeer) {
    return (
      <>
        <Conversation
          peer={openPeer}
          messages={threadWith(openPeer)}
          onBack={closeThread}
          onSend={onSend}
          onRetry={onRetrySend}
          onCopyAddress={copy}
        />
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="bg-background/85 sticky top-0 z-10 border-b backdrop-blur-xl pt-safe">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-extrabold tracking-tight">Messages</h1>
            {relayStatus === "offline" && (
              <span className="text-destructive text-[11px] font-semibold">offline</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setProfileOpen(true)}
            aria-label="Your address"
            className="size-10 rounded-full"
          >
            <AddressAvatar address={wallet.address} size="sm" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Inbox
          conversations={conversations}
          onOpen={openThread}
          onCompose={() => setComposing(true)}
        />
      </div>

      <NewConversation
        open={composing}
        onOpenChange={setComposing}
        onStart={openThread}
        myAddress={wallet.address}
        suggestions={
          wallet.mode === "dev"
            ? devIdentities.filter(
                ({ address }) => compact(address) !== compact(wallet.address),
              )
            : []
        }
      />

      <ProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        address={wallet.address}
        mode={wallet.mode}
        relayStatus={relayStatus}
        onCopy={copy}
      />
    </div>
  )
}
