import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowUp, Plus } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import { useNames } from "@/hooks/use-names"
import { shortenAddress } from "@/lib/address"
import { mentionOf } from "@/lib/mentions"
import { labelIn } from "@/lib/names"
import { cn } from "@/lib/utils"

/** Matches the relay's `max_body_len`, so the UI stops before the server does. */
const MAX_BODY_BYTES = 4096
/** How long to wait after a keystroke before asking who is in the room. */
const SETTLE_MS = 200
/**
 * How many people to offer at once. A picker is a shortlist, not the room, and
 * few enough that the list never has to scroll — see the tap below for why
 * scrolling it would be awkward.
 */
const MENTION_LIMIT = 4
/**
 * The longest thing that can still be somebody's name being typed. Past it the
 * `@` was part of a sentence and the list should get out of the way.
 */
const MAX_QUERY = 40

/**
 * Where a message is written.
 *
 * Not a `<textarea>`, because of mentions. A mention is an address (see
 * `lib/mentions`), and 36 characters of base32 in the middle of a sentence is
 * not something anybody should have to look at while writing it. So the box
 * holds what is *meant* — a name in a chip — and hands over what is *sent*,
 * with the address in place of the chip, at the moment of sending. Everything
 * about that trade lives in this file; nothing outside it sees a chip.
 */
export function Composer({
  onSend,
  onAttach,
  onMentionSearch,
  disabled,
}: {
  onSend: (body: string) => void
  /**
   * Opens the menu of things a message can be other than text.
   *
   * Optional, and the button is absent without it. A room has nothing to attach
   * today, and a `+` that opened something else instead would be worse than no
   * `+` at all.
   */
  onAttach?: () => void
  /**
   * Who can be named here, searched by whatever has been typed after an `@`.
   *
   * Absent in a one-to-one chat, where `@` goes back to being a character: the
   * only person who could be meant is the one being spoken to, and pointing at
   * them by name in their own thread says nothing.
   *
   * Must be stable, or every keystroke starts the search over.
   */
  onMentionSearch?: (query: string) => Promise<string[]>
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const names = useNames()
  const box = useRef<HTMLDivElement>(null)
  /**
   * What the box currently says, in the form it would be sent in.
   *
   * A mirror, never written back: the box owns its own content, because putting
   * React in charge of a `contenteditable` subtree means fighting it for the
   * caret on every keystroke. This is read out of the DOM after each change and
   * exists so that the byte count, the placeholder and the send button have
   * something to look at.
   */
  const [body, setBody] = useState("")
  /** An input method is mid-word, so Enter belongs to it rather than to us. */
  const composing = useRef(false)

  /** What has been typed after an `@`, or null when nothing is being named. */
  const [query, setQuery] = useState<string | null>(null)
  const [found, setFound] = useState<string[]>([])
  const [active, setActive] = useState(0)
  /**
   * The list was dismissed for the mention being typed right now.
   *
   * Escape has to mean something more lasting than one keystroke, or the next
   * letter brings the list straight back.
   */
  const hushed = useRef(false)

  const read = useCallback(() => {
    setBody(box.current ? serialize(box.current) : "")
  }, [])

  /** Notice whether the caret is sitting in a name being typed. */
  const scan = useCallback(() => {
    const root = box.current
    const here = root && onMentionSearch ? queryAt(root) : null
    if (!here) hushed.current = false
    setQuery(here && !hushed.current ? here.text : null)
  }, [onMentionSearch])

  // Held back for a moment: a request per keystroke would spend four on a
  // three-letter name and answer them out of order.
  useEffect(() => {
    if (query === null || !onMentionSearch) {
      setFound([])
      return
    }
    let live = true
    const timer = window.setTimeout(() => {
      onMentionSearch(query)
        .then((members) => {
          if (!live) return
          setFound(members.slice(0, MENTION_LIMIT))
          setActive(0)
        })
        .catch(() => live && setFound([]))
    }, SETTLE_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [query, onMentionSearch])

  const close = () => {
    setQuery(null)
    setFound([])
  }

  /**
   * Put somebody in the box, in place of the `@…` that was being typed.
   *
   * The chip is `contenteditable=false`, which is what makes it behave like one
   * thing: a backspace takes the whole person out rather than a letter off the
   * end of their name, which would leave a mention pointing at nobody.
   */
  const pick = (address: string) => {
    const root = box.current
    if (!root) return
    const here = queryAt(root)
    if (!here) return

    const range = document.createRange()
    // The `@` as well as what follows it — the chip carries its own.
    range.setStart(here.node, here.start)
    range.setEnd(here.node, here.start + here.text.length + 1)
    range.deleteContents()

    const chip = document.createElement("span")
    chip.dataset.mention = address
    chip.contentEditable = "false"
    chip.className = CHIP
    // The name as it reads *here*, and only here: this is a draft, and what
    // travels is the address on `data-mention`. A reader who calls them
    // something else will see their own name for them.
    chip.textContent = `@${labelIn(names, address)}`
    range.insertNode(chip)

    // Somewhere to put the caret that is outside the chip, and a space nobody
    // has to type before the next word.
    const after = document.createTextNode(" ")
    chip.after(after)
    const caret = document.createRange()
    caret.setStart(after, after.length)
    caret.collapse(true)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(caret)

    root.focus()
    close()
    read()
  }

  const bytes = new TextEncoder().encode(body).length
  const overLimit = bytes > MAX_BODY_BYTES
  const text = body.trim()
  const canSend = text.length > 0 && !overLimit && !disabled
  const picking = query !== null && found.length > 0

  const submit = () => {
    if (!canSend) return
    onSend(text)
    if (box.current) box.current.innerHTML = ""
    setBody("")
    close()
  }

  return (
    <div className="bg-background/85 relative border-t backdrop-blur-xl">
      {picking && (
        <div
          className={cn(
            "bg-popover text-popover-foreground absolute inset-x-3 bottom-full z-20 mb-2",
            "overflow-hidden rounded-2xl border shadow-lg",
          )}
        >
          <ul className="max-h-56 overflow-y-auto py-1">
            {found.map((address, index) => (
              <li key={address}>
                <button
                  type="button"
                  // The box must not lose the caret on the way to this click,
                  // or there is no longer an `@…` to put anybody in place of.
                  onMouseDown={(event) => event.preventDefault()}
                  // And on a touch keyboard the box blurs the instant a finger
                  // lands, which would take this list away before any click
                  // could arrive. So the tap is taken here, and the blur — and
                  // the click that would have followed it — never happens.
                  onTouchStart={(event) => {
                    event.preventDefault()
                    pick(address)
                  }}
                  onClick={() => pick(address)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                    index === active && "bg-muted",
                  )}
                >
                  <AddressAvatar address={address} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">
                      {labelIn(names, address)}
                    </span>
                    {/* Not decoration. Two members can call themselves the same
                        thing, and this is the line that says which is which. */}
                    <span className="text-muted-foreground block truncate font-mono text-[11px]">
                      {shortenAddress(address)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-2.5">
        {/* Disabled alongside the composer, not independently: a transfer would
            still go through with the door shut, but the note about it would
            not, leaving money moved and no record of it in the thread. */}
        {onAttach && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onAttach}
            disabled={disabled}
            aria-label={t("composer.attach")}
            className="text-muted-foreground size-11 shrink-0 rounded-full"
          >
            <Plus className="size-5" />
          </Button>
        )}

        <div className="relative min-w-0 flex-1">
          {/* Drawn rather than left to `:empty::before`, which lies: deleting
              the last letter can leave a `<br>` behind, and an empty box is
              then not empty as far as CSS is concerned. */}
          {body.trim().length === 0 && (
            <span className="text-muted-foreground pointer-events-none absolute top-2.5 left-4 leading-snug">
              {t("composer.message")}
            </span>
          )}
          <div
            ref={box}
            contentEditable={!disabled}
            role="textbox"
            aria-multiline="true"
            aria-label={t("composer.message")}
            onInput={() => {
              read()
              scan()
            }}
            // The caret can move without anything being typed, and where it
            // sits is what decides whether somebody is being named.
            onKeyUp={scan}
            onMouseUp={scan}
            onBlur={close}
            onCompositionStart={() => (composing.current = true)}
            onCompositionEnd={() => {
              composing.current = false
              read()
              scan()
            }}
            onPaste={(event) => {
              // Whatever was copied, only its words come in. Pasting rich text
              // into a `contenteditable` otherwise brings its markup with it,
              // and a pasted `<span>` would be indistinguishable from a chip.
              event.preventDefault()
              insertText(event.clipboardData.getData("text/plain"))
              read()
              scan()
            }}
            onKeyDown={(event) => {
              if (picking) {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  setActive((at) => (at + 1) % found.length)
                  return
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  setActive((at) => (at - 1 + found.length) % found.length)
                  return
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault()
                  // Whoever is highlighted, and never nobody: a page landing
                  // between render and keystroke can leave the mark past the
                  // end of a shorter list.
                  pick(found[active] ?? found[0])
                  return
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  hushed.current = true
                  close()
                  return
                }
              }
              // Enter sends on a hardware keyboard; Shift+Enter always inserts a
              // newline. On touch keyboards Enter inserts a newline as usual.
              if (event.key === "Enter" && !event.shiftKey && !isTouch() && !composing.current) {
                event.preventDefault()
                submit()
              }
            }}
            className={cn(
              "bg-muted max-h-33 min-h-11 w-full overflow-y-auto whitespace-pre-wrap",
              "rounded-2xl px-4 py-2.5 leading-snug outline-none",
              "focus-visible:ring-ring/60 focus-visible:ring-2",
              disabled && "opacity-60",
              overLimit && "ring-destructive ring-2",
            )}
          />
        </div>

        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={!canSend}
          aria-label={t("composer.send")}
          className={cn(
            "size-11 shrink-0 rounded-full transition-transform",
            canSend ? "brand-gradient scale-100" : "scale-95",
          )}
        >
          <ArrowUp className="size-5" />
        </Button>
      </div>

      {overLimit && (
        <p className="text-destructive px-5 pb-2 text-xs">
          {bytes.toLocaleString()} of {MAX_BODY_BYTES.toLocaleString()} bytes — too long to send.
        </p>
      )}
      <div className="pb-safe" />
    </div>
  )
}

/**
 * How a person looks while a message about them is still being written: the
 * same weight and colour the sent message will draw them in, so what is typed
 * and what is read are the same thing.
 *
 * `whitespace-nowrap` stays because it is not decoration — it keeps a name, or
 * the address a nameless one falls back to, from breaking across two lines and
 * reading as two people.
 */
const CHIP = "text-mention font-semibold whitespace-nowrap"

/** Tags a browser wraps a line in when Enter is pressed. Each one starts a line. */
const BLOCK = new Set(["DIV", "P", "LI"])

/**
 * What the box would send: its words, with each chip written back out as the
 * address it stands for.
 *
 * Read from the DOM rather than kept alongside it, because the DOM is what the
 * person is actually editing. A parallel model would have to survive every way
 * a `contenteditable` can change under you — a drag, an autocorrect, an input
 * method, a paste — and would be wrong the first time it didn't.
 */
function serialize(root: HTMLElement): string {
  let out = ""

  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        // Browsers write a non-breaking space where a typed space would
        // otherwise collapse. It was a space when it was typed.
        out += (child.nodeValue ?? "").replace(/\u00a0/g, " ")
        continue
      }
      if (!(child instanceof HTMLElement)) continue

      const address = child.dataset.mention
      if (address) {
        out += mentionOf(address)
        continue
      }
      if (child.tagName === "BR") {
        out += "\n"
        continue
      }
      if (BLOCK.has(child.tagName) && out && !out.endsWith("\n")) out += "\n"
      walk(child)
    }
  }

  walk(root)
  return out
}

/** Put plain text in at the caret, replacing whatever was selected. */
function insertText(text: string): void {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  range.deleteContents()
  // Newlines survive as themselves because the box is `whitespace-pre-wrap`;
  // turning them into elements would only give `serialize` more to undo.
  const node = document.createTextNode(text.replace(/\r\n?/g, "\n"))
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * The `@…` the caret is sitting in, if it is sitting in one.
 *
 * Only ever one text node's worth, which is all a name being typed can be: a
 * chip is its own node, and a space ends the search. Anything longer than a
 * name could be was an `@` in a sentence rather than the start of one.
 */
function queryAt(root: HTMLElement): { node: Text; start: number; text: string } | null {
  const selection = document.getSelection()
  if (!selection?.isCollapsed) return null
  const node = selection.anchorNode
  if (!node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null

  const before = (node.nodeValue ?? "").slice(0, selection.anchorOffset)
  const start = before.lastIndexOf("@")
  if (start < 0) return null
  // A mention begins a word. Otherwise every email address in every message
  // would open a list of members.
  if (start > 0 && !/\s/.test(before[start - 1])) return null

  const text = before.slice(start + 1)
  if (text.length > MAX_QUERY || /\s/.test(text)) return null
  return { node: node as Text, start, text }
}

function isTouch(): boolean {
  return window.matchMedia("(pointer: coarse)").matches
}
