import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/relay", async () => {
  const actual = await vi.importActual<typeof import("@/lib/relay")>("@/lib/relay")
  return { ...actual, request: vi.fn() }
})

// Imported after the mock is registered, not through a static import at the
// top: the module under test binds `request` when it is first evaluated, and
// a static import would bind the real one.
const { request, RelayError } = await import("@/lib/relay")
const { checkRegisteredKey, verifyCertificate } = await import("@/lib/keys")
const asked = vi.mocked(request)

/**
 * A certificate a real wallet produced, taken from a relay that accepted it.
 * The same identity signs the vector in `signed-message.test.ts`, so a change
 * that breaks verification fails in both places.
 */
const CERTIFICATE = {
  address: "NQ80 M6TC 2D6V 4H55 CBPF 9VQU CGFX HCYD 4RAB",
  statement:
    "Knock sign-in\n\n" +
    "Encryption key: b499fc3c7024cf863acaaf16b88c2b6c1f9ac3a912a659610023b2380360a96e\n" +
    "Nonce: 4fc7da4ac96a525a5cfd8e17c6ff7228fe780afe3fe073d359cc0b9617db5348\n" +
    "Expires: 2026-08-24T03:14:20.559108+00:00",
  public_key: "f6457bf0a79ce0248d78e5e392b3d20c6895e5c89b63f23ac3118c24a421f2a8",
  signature:
    "24456800afdec555a522ce16b09116166a38a4bf2be167beefa049d1fd378b2b" +
    "1923c7a3cbf87d20473a9723339e7bd44bd3051f747e500d76c9c40e53191c06",
}

/** The encryption key that certificate vouches for. */
const REGISTERED = "b499fc3c7024cf863acaaf16b88c2b6c1f9ac3a912a659610023b2380360a96e"

const bytes = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))

describe("verifyCertificate", () => {
  it("accepts one a wallet really signed", () => {
    expect(verifyCertificate(CERTIFICATE)).toBe(REGISTERED)
  })

  it("refuses one whose statement was edited", () => {
    // Swapping the key in the statement is the attack: the relay would be
    // vouching for a key its owner never signed for.
    const forged = {
      ...CERTIFICATE,
      statement: CERTIFICATE.statement.replace(REGISTERED, "00".repeat(32)),
    }
    expect(verifyCertificate(forged)).toBeNull()
  })

  it("refuses one signed for a different address", () => {
    expect(
      verifyCertificate({ ...CERTIFICATE, address: "NQ07 0000 0000 0000 0000 0000 0000 0000 0000" }),
    ).toBeNull()
  })
})

// No `beforeEach` clearing the mock here, deliberately: every test sets its
// own implementation, and `mockClear()` wipes `mock.results` — where Vitest
// keeps the handler that marks a rejected result as observed. Clearing it
// between tests orphans the previous rejection and reports it as unhandled,
// failing tests that are themselves correct.
describe("checkRegisteredKey", () => {
  it("matches when the relay vouches for this device", async () => {
    asked.mockResolvedValue(CERTIFICATE)
    expect(await checkRegisteredKey(CERTIFICATE.address, bytes(REGISTERED))).toBe("matches")
  })

  it("is stale when the relay vouches for some other key", async () => {
    // The case that leaves you unable to read anything: a device that re-keyed
    // without signing in again.
    asked.mockResolvedValue(CERTIFICATE)
    expect(await checkRegisteredKey(CERTIFICATE.address, bytes("11".repeat(32)))).toBe("stale")
  })

  it("is stale when nothing is registered at all", async () => {
    asked.mockImplementation(() => Promise.reject(new RelayError("no key", 404)))
    expect(await checkRegisteredKey(CERTIFICATE.address, bytes(REGISTERED))).toBe("stale")
  })

  it("says unknown rather than stale when the relay cannot be reached", async () => {
    // This distinction is the whole point: acting on "unknown" would sign
    // somebody out every time their network hiccuped.
    asked.mockImplementation(() => Promise.reject(new RelayError("offline", 0)))
    expect(await checkRegisteredKey(CERTIFICATE.address, bytes(REGISTERED))).toBe("unknown")
  })

  it("is stale when the certificate does not verify", async () => {
    asked.mockResolvedValue({ ...CERTIFICATE, signature: `00${CERTIFICATE.signature.slice(2)}` })
    expect(await checkRegisteredKey(CERTIFICATE.address, bytes(REGISTERED))).toBe("stale")
  })
})
