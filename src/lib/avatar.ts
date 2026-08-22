/**
 * Deterministic avatars.
 *
 * Every address gets a stable gradient and monogram, so a conversation is
 * recognizable at a glance without anyone having to set a profile picture.
 * Colors are drawn from Nimiq's brand palette rather than generated freely, so
 * a screen full of avatars still looks like one product.
 */

import { compact } from "./address"

const GRADIENTS: Array<[string, string]> = [
  ["#265DD7", "#0582CA"],
  ["#41A38E", "#21BCA5"],
  ["#FC8702", "#E9B213"],
  ["#CC3047", "#FC8702"],
  ["#4D4C96", "#5F4B8B"],
  ["#0582CA", "#21BCA5"],
  ["#D94432", "#E9B213"],
  ["#5F4B8B", "#265DD7"],
  ["#1F2348", "#0582CA"],
  ["#21BCA5", "#E9B213"],
]

/** FNV-1a — small, fast, and stable across runs. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function avatarGradient(address: string): string {
  const [from, to] = GRADIENTS[hash(compact(address)) % GRADIENTS.length]
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`
}

/** Two characters from the address body — skips `NQ` and the check digits. */
export function avatarMonogram(address: string): string {
  return compact(address).slice(4, 6) || "??"
}
