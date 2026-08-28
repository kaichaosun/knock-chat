/**
 * The English dictionary, and the shape every other one is checked against.
 *
 * Keys are named for where a string appears rather than for what it says, so
 * rewording the copy never means renaming the key — and a key that reads like
 * its English is a key that lies as soon as somebody improves the sentence.
 */
export const en = {
  tabs: {
    chats: "Chats",
    contacts: "Contacts",
    groups: "Groups",
  },
  welcome: {
    tagline: "Messages between Nimiq wallets, with spam priced out instead of guessed at.",
    points: {
      noSignup: {
        title: "No sign-up",
        body: "Your Nimiq address is your account. Nothing to create, nothing to remember.",
      },
      spamCosts: {
        title: "Spam costs money",
        body: "Strangers attach a small amount of NIM to reach you. Contacts never pay.",
      },
    },
    openInPay: "Open in Nimiq Pay",
    tryAgain: "Try again",
    looking: "Looking for your wallet",
    signIn: "Sign in with your wallet",
    oneSignature: "One signature. Nothing is spent.",
    agree: "By signing in you agree to our <terms>Terms of Service</terms> and <privacy>Privacy Policy</privacy>.",
  },
  settings: {
    title: "Settings",
    language: {
      title: "Language",
      host: "Follow system",
    },
  },
} as const

/**
 * The English one with its words taken out: every key it has, holding any
 * string rather than the exact English it happens to hold today.
 *
 * `as const` above is what makes the keys exhaustive. Left alone it would also
 * pin every value to the literal English, so a translation would be "not
 * assignable to type 'Settings'" — a shape that only English can satisfy.
 */
type Translated<T> = { [K in keyof T]: T[K] extends string ? string : Translated<T[K]> }

export type Dictionary = Translated<typeof en>
