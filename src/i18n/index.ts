/**
 * What language the app speaks.
 *
 * Three things can decide it, in order: what you chose here, what Nimiq Pay is
 * set to, and what the device asks for. The middle one is the one the host
 * wants honoured — somebody who set Nimiq Pay to German should not meet an
 * English mini app — so it wins over the device, and loses only to a choice
 * made in this app on purpose.
 *
 * That last part is not decoration. Nimiq Pay offers five languages, and
 * Chinese is not among them, so a Chinese speaker's host language arrives as
 * something else entirely. Without a way to say otherwise here, `zh` could
 * never be reached from inside the app it is meant for.
 */

import i18next from "i18next"
import { initReactI18next } from "react-i18next"

import { snapshot, subscribe } from "@/lib/prefs"
import { getHostLanguage } from "@nimiq/mini-app-sdk"

import { en } from "./en"
import { zh } from "./zh"

/**
 * What the app actually speaks — not what Nimiq Pay offers.
 *
 * The host has five languages and this has two, so a host set to German
 * resolves to English here: `isLanguage` turns it down, and the fallback runs.
 * A language belongs in this list once its dictionary is written, and shows up
 * in the picker by being in it.
 */
export const LANGUAGES = ["en", "zh"] as const
export type Language = (typeof LANGUAGES)[number]

/**
 * Each language named in itself.
 *
 * Somebody hunting for their own language is reading the list in a language
 * they may not have — "Chinese" is no help to the person who needs 中文.
 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  zh: "中文",
}

/** Any of those, or "follow whatever the host and the device say". */
export type LanguageChoice = Language | "host"

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value)
}

/**
 * Dictionaries, keyed the way i18next wants them.
 *
 * English is the fallback and so is always loaded. The rest are here in full
 * for now; when there are six of them worth shipping, this is the one place
 * that has to learn to fetch a language instead of holding all of them.
 */
const resources = {
  en: { translation: en },
  zh: { translation: zh },
}

/** The language in force, given a choice, a host and a device. */
export function resolve(choice: LanguageChoice): Language {
  if (choice !== "host") return choice
  const host = getHostLanguage()
  if (isLanguage(host)) return host
  const device = navigator.language.split("-")[0]
  return isLanguage(device) ? device : "en"
}

/** Set it up and keep it in step with the preference. Called once, before first render. */
export function start(): void {
  void i18next.use(initReactI18next).init({
    resources,
    lng: resolve(snapshot().language),
    fallbackLng: "en",
    // React escapes everything it renders already, and doing it twice turns an
    // apostrophe in somebody's name into `&#39;`.
    interpolation: { escapeValue: false },
  })

  subscribe(() => {
    const next = resolve(snapshot().language)
    if (next !== i18next.language) void i18next.changeLanguage(next)
  })
}
