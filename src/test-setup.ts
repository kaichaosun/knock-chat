/**
 * English, for tests.
 *
 * Strings that reach a person are not all in components — a chat's summary
 * line is built in `payload.ts` — so those modules translate too, and without
 * this every assertion would be against a key rather than a sentence. The real
 * `start()` is not used: it reads preferences and asks the host what language
 * it is in, neither of which exists here.
 */
import i18next from "i18next"

import { en } from "@/i18n/en"

void i18next.init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})
