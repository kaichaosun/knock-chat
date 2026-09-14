import { afterEach, describe, expect, it, vi } from "vitest"

import { discover, listContacts, removeContact, setAuthToken } from "./relay"

/** Capture what the client actually put on the wire. */
function stubFetch(response: { ok?: boolean; status?: number; body?: unknown }) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve({
        ok: response.ok ?? true,
        status: response.status ?? 200,
        json: () => Promise.resolve(response.body ?? {}),
      } as Response)
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  setAuthToken(null)
})

describe("removeContact", () => {
  it("deletes the contact by address", async () => {
    const calls = stubFetch({ body: { address: "NQ20NTLC" } })

    await removeContact("NQ20NTLCVQK9PVLQJB3GAN7KM9033EC237EK")

    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe("DELETE")
    expect(calls[0].url).toBe("/api/v1/contacts/NQ20NTLCVQK9PVLQJB3GAN7KM9033EC237EK")
  })

  it("escapes the address rather than pasting it into the path", async () => {
    // A formatted address carries spaces. Left raw they would break the URL, so
    // the caller must not have to remember to compact it first.
    const calls = stubFetch({ body: {} })

    await removeContact("NQ20 NTLC VQK9")

    expect(calls[0].url).toBe("/api/v1/contacts/NQ20%20NTLC%20VQK9")
  })

  it("surfaces the relay's reason when there is no such channel", async () => {
    stubFetch({ ok: false, status: 404, body: { error: "no open channel with that address" } })

    await expect(removeContact("NQ20NTLC")).rejects.toThrow(
      "no open channel with that address",
    )
  })

  it("sends the session token, since removal is scoped to the caller", async () => {
    const calls = stubFetch({ body: {} })
    setAuthToken("a-token")

    await removeContact("NQ20NTLC")

    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(
      "Bearer a-token",
    )
  })
})

describe("listContacts", () => {
  it("reads the contact list", async () => {
    const calls = stubFetch({ body: { contacts: [{ address: "NQ20", opened_at: "2026-01-01" }] } })

    const result = await listContacts()

    expect(calls[0].url).toBe("/api/v1/contacts")
    expect(result.contacts).toHaveLength(1)
  })
})

describe("discover", () => {
  it("browses when nothing is typed, rather than searching for nothing", async () => {
    // A blank `q` on the wire would be a search for the empty string, which is
    // a different question from "what is here" — and the answer the relay gives
    // it carries no featured list.
    const calls = stubFetch({ body: { featured: [], results: [], names: {} } })

    await discover("")
    await discover("   ")
    await discover()

    expect(calls.map((call) => call.url)).toEqual([
      "/api/v1/discover",
      "/api/v1/discover",
      "/api/v1/discover",
    ])
  })

  it("trims the search and escapes it into the query", async () => {
    const calls = stubFetch({ body: { featured: [], results: [], names: {} } })

    await discover("  nimiq builders  ")

    expect(calls[0].url).toBe("/api/v1/discover?q=nimiq+builders")
  })

  it("puts a wildcard on the wire as itself", async () => {
    // The relay takes `%` literally; what this checks is that the client does
    // not mangle it on the way there.
    const calls = stubFetch({ body: { featured: [], results: [], names: {} } })

    await discover("100%")

    expect(calls[0].url).toBe("/api/v1/discover?q=100%25")
  })
})
