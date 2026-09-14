import { afterEach, describe, expect, it, vi } from "vitest"

import { requestedDevIdentity } from "./wallet"

/** Stand in for the one thing this reads: the query string of the page. */
function stubUrl(search: string) {
  vi.stubGlobal("window", { location: { search } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("requestedDevIdentity", () => {
  it("hands over the identity the URL asked for", () => {
    stubUrl("?as=bob")
    expect(requestedDevIdentity()).toBe("bob")
  })

  it("asks for nobody when the URL does not", () => {
    // The point of the whole function. Running the dev server is not itself a
    // request to be signed in as somebody else — without this, opening the app
    // in a desktop browser signed you in as alice, and reaching your own wallet
    // meant starting the server with `NODE_ENV=production`.
    stubUrl("")
    expect(requestedDevIdentity()).toBe(null)

    stubUrl("?something=else")
    expect(requestedDevIdentity()).toBe(null)
  })

  it("only knows the four fixtures, not whatever was typed", () => {
    // Each name is a seed for a real key. A name that is not on the list has no
    // seed, and inventing one would mint an account nothing else knows about.
    stubUrl("?as=eve")
    expect(requestedDevIdentity()).toBe(null)
  })

  it("hands over nobody at all in a shipped build", async () => {
    // The security boundary, and the reason the gate is `MODE` rather than
    // `DEV`: `DEV` follows `NODE_ENV` and is false on a dev server started with
    // `NODE_ENV=production`, which is a real way to run this. `MODE` is
    // `production` only for a build.
    //
    // Imported again under the stubbed env rather than stubbed in place:
    // `DEV_SERVER` is read once when `lib/env` is first evaluated, which is the
    // truth about it — `MODE` cannot change while the app is running, and in a
    // build the whole branch is folded away before it ever runs. So the only
    // honest way to ask this question is to load the module as a build would.
    vi.stubEnv("MODE", "production")
    vi.resetModules()
    const shipped = await import("./wallet")

    stubUrl("?as=alice")
    expect(shipped.requestedDevIdentity()).toBe(null)
  })
})
