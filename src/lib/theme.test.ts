import { beforeEach, describe, expect, it, vi } from "vitest"

import { choose, snapshot, start, subscribe } from "./theme"

/** A localStorage that lives only as long as the test. */
function stubStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed))
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  return store
}

/** The phone's own setting, which a choice can be made to ignore. */
let systemDark = false

/**
 * Whoever is listening for the phone to change.
 *
 * Shared by every test rather than made fresh in each, because the module
 * subscribes once for the life of the page — a set made per test would be
 * listened to by nobody from the second test onwards.
 */
const watchers = new Set<() => void>()

function stubScreen() {
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return systemDark
    },
    addEventListener: (_: string, listener: () => void) => void watchers.add(listener),
  }))
}

function flipPhone(dark: boolean) {
  systemDark = dark
  for (const watcher of watchers) watcher()
}

/** Enough of a document to see what was painted on it. */
function stubDocument() {
  const classes = new Set<string>()
  const root = { classList: { toggle: toggle }, style: {} as { colorScheme?: string } }
  // index.html declares one per system setting; both are here to be corrected.
  const bars = ["#ffffff", "#101438"]

  function toggle(name: string, on: boolean) {
    if (on) classes.add(name)
    else classes.delete(name)
  }

  vi.stubGlobal("document", {
    documentElement: root,
    querySelectorAll: () =>
      bars.map((_, index) => ({
        setAttribute: (_name: string, value: string) => void (bars[index] = value),
      })),
  })
  // Standing in for the stylesheet, which is where the real colours come from.
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: () => (classes.has("dark") ? "#101438" : "#ffffff"),
  }))

  return { classes, root, bars }
}

let screen: ReturnType<typeof stubDocument>

beforeEach(() => {
  stubStorage()
  systemDark = false
  stubScreen()
  screen = stubDocument()
})

describe("with nothing chosen", () => {
  it("follows a light phone", () => {
    start()
    expect(snapshot()).toEqual({ theme: "system", palette: "light" })
    expect(screen.classes.has("dark")).toBe(false)
  })

  it("follows a dark phone", () => {
    systemDark = true
    start()
    expect(snapshot()).toEqual({ theme: "system", palette: "dark" })
    expect(screen.classes.has("dark")).toBe(true)
  })

  it("keeps following when the phone changes its mind", () => {
    start()
    flipPhone(true)
    expect(snapshot().palette).toBe("dark")
    expect(screen.classes.has("dark")).toBe(true)
  })

  it("treats anything else in storage as no choice", () => {
    // Storage is user-writable, and was written by an older build at least once.
    stubStorage({ "knock.theme": "solarized" })
    start()
    expect(snapshot().theme).toBe("system")
  })
})

describe("a theme you chose", () => {
  it("overrides a phone that disagrees", () => {
    systemDark = true
    start()
    choose("light")
    expect(snapshot()).toEqual({ theme: "light", palette: "light" })
    expect(screen.classes.has("dark")).toBe(false)
  })

  it("stops the phone from having a say", () => {
    start()
    choose("light")
    flipPhone(true)
    expect(snapshot().palette).toBe("light")
    expect(screen.classes.has("dark")).toBe(false)
  })

  it("can be given back to the phone", () => {
    systemDark = true
    start()
    choose("light")
    choose("system")
    expect(snapshot()).toEqual({ theme: "system", palette: "dark" })
  })

  it("survives a reload", () => {
    start()
    choose("dark")
    start()
    expect(snapshot().theme).toBe("dark")
  })
})

describe("what gets painted", () => {
  it("sets color-scheme, so native controls follow too", () => {
    start()
    expect(screen.root.style.colorScheme).toBe("light")
    choose("dark")
    expect(screen.root.style.colorScheme).toBe("dark")
  })

  it("corrects the browser's own bar, whichever one the phone is reading", () => {
    start()
    choose("dark")
    expect(screen.bars).toEqual(["#101438", "#101438"])
  })
})

describe("subscribers", () => {
  it("hear about a choice", () => {
    start()
    const heard = vi.fn()
    subscribe(heard)
    choose("dark")
    expect(heard).toHaveBeenCalled()
  })

  it("hear the phone change underneath them", () => {
    start()
    const heard = vi.fn()
    subscribe(heard)
    flipPhone(true)
    expect(heard).toHaveBeenCalled()
  })

  it("are not woken by a choice that changes nothing", () => {
    start()
    choose("dark")
    const settled = snapshot()
    choose("dark")
    expect(snapshot()).toBe(settled)
  })

  it("are not woken when the phone lands on what is already showing", () => {
    start()
    choose("light")
    const settled = snapshot()
    flipPhone(true)
    expect(snapshot()).toBe(settled)
  })
})

describe("without storage", () => {
  it("still changes the screen, it just cannot remember", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("denied")
      },
    })
    start()
    expect(() => choose("dark")).not.toThrow()
    expect(screen.classes.has("dark")).toBe(true)
  })
})
