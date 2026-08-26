/**
 * The terms and the privacy policy, as text this app can draw.
 *
 * Kept here rather than on a website because a Mini App has no browser to send
 * anybody to: a link out of the WebView either fails or dumps the user in
 * another app mid sign-in. Both documents therefore ship with the build, which
 * also means what you agreed to and what the app does are the same version.
 *
 * ---------------------------------------------------------------------------
 * BEFORE RELEASE, three things below are placeholders and one is a guess:
 *
 *   • CONTACT     — no address of ours is in this repo. Set it.
 *   • JURISDICTION— assumed Singapore from "Pte. Ltd.". Confirm.
 *   • MINIMUM_AGE — assumed 18 because the app moves money. Confirm.
 *   • UPDATED     — bump whenever either document changes.
 *
 * And none of this has been read by a lawyer. It is written to be accurate
 * about what the code actually does, which is the part an engineer can get
 * right; whether it is *sufficient* is not.
 * ---------------------------------------------------------------------------
 */

const COMPANY = "KEYRING Pte. Ltd."
const CONTACT = "support@keyring.so"
const JURISDICTION = "Singapore"
const MINIMUM_AGE = 18
const UPDATED = "26 August 2026"

export type LegalSection = {
  heading: string
  /** Paragraphs, in order. */
  body: string[]
}

export type LegalDoc = {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
}

export const TERMS: LegalDoc = {
  title: "Terms of Service",
  updated: UPDATED,
  intro: `Knock is made by ${COMPANY}. By signing in you agree to these terms. If you do not, do not sign in.`,
  sections: [
    {
      heading: "What Knock is",
      body: [
        "A messenger that runs inside Nimiq Pay. Reaching someone who has never spoken to you costs postage, paid in NIM to them. Groups may charge to join. Gifts put NIM into a room for whoever gets there first.",
        `We run the relay that carries the messages. We do not run the Nimiq network, and we do not run Nimiq Pay.`,
      ],
    },
    {
      heading: "Your wallet is your account",
      body: [
        "There is no signup, no password and no recovery. Whoever controls the wallet controls the account.",
        "If you lose access to your wallet, we cannot restore your account, move it, or return anything held under it. We also cannot freeze an account at your request — nobody, including us, can sign for you.",
        `You must be at least ${MINIMUM_AGE} to use Knock.`,
      ],
    },
    {
      heading: "Money, and who holds it",
      body: [
        "Postage for a knock and the price of joining a group are ordinary Nimiq transactions, sent straight from your wallet to the recipient or the group's owner. We are not a party to them and never hold that money.",
        "Gifts work differently. The amount goes to a wallet we operate, and we pay out each share as it is claimed and return whatever is unclaimed when the gift expires. We hold it only for that, we do not lend or invest it, and it is not a deposit, a stored-value facility or e-money.",
        "Transactions on a blockchain are final. We cannot reverse, cancel or refund one. In particular: a knock that is declined, a group request that is refused, leaving or being removed from a group, and a group being disbanded do not entitle you to anything back.",
        "Network fees are set by the Nimiq network, not by us.",
      ],
    },
    {
      heading: "Our fees",
      body: [
        "Today we take nothing. Postage reaches the recipient in full, join prices reach the owner in full, and gifts pay out in full.",
        "We may introduce a service fee in future — deducted from postage or from a gift, or charged for services we have not built yet. If we do, the amount will be shown in the app before you pay it, and it will apply only to payments made after that.",
        "We will never take a fee out of something you have already paid for.",
      ],
    },
    {
      heading: "How you may use it",
      body: [
        "Do not use Knock for anything unlawful, and do not send content that is illegal where you or the recipient are.",
        "Do not harass, threaten or impersonate people. Postage is meant to make unwanted contact expensive, not permitted.",
        "Do not attack the relay, other people's accounts, or the payment mechanism — including automating knocks in bulk, or attempting to spend the same payment twice.",
        "We may suspend access to the relay for an address that breaks these rules. We cannot take back messages already delivered, and we cannot reverse payments.",
      ],
    },
    {
      heading: "What you write",
      body: [
        "What you write is yours, and you are responsible for it.",
        "Messages between two people are encrypted on your device and we cannot read them. Group messages in this version are not encrypted, and we can. See the Privacy Policy.",
        "We may remove group content or restrict an account where the law requires it or where it is necessary to protect the service or its users.",
      ],
    },
    {
      heading: "The service, as it is",
      body: [
        "The relay is provided as-is and as-available. We may change it, take parts of it away, or stop running it. We do not promise it will be reachable, or that anything held on it is backed up.",
        "Your conversation history is kept on your device. Clearing the app's data erases it, and we cannot send it back to you.",
        "To the extent the law allows, we are not liable for lost NIM, lost or undelivered messages, or any indirect or consequential loss. Nothing here excludes liability that cannot lawfully be excluded.",
      ],
    },
    {
      heading: "The code",
      body: [
        "Knock's client and relay are published under the Apache License 2.0. That licence covers the source code; it is not a licence to the service we operate, and running your own relay is not covered by these terms.",
      ],
    },
    {
      heading: "Changes, and where this applies",
      body: [
        "We may update these terms. The current version is always the one in the app, with its date at the top. Continuing to use Knock after a change means accepting it.",
        `These terms are governed by the laws of ${JURISDICTION}.`,
        `Questions: ${CONTACT}.`,
      ],
    },
  ],
}

export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  updated: UPDATED,
  intro: `${COMPANY} runs the Knock relay. This is what it holds, what it cannot see, and what never leaves your phone.`,
  sections: [
    {
      heading: "We never ask who you are",
      body: [
        "No name, no email, no phone number, no password. Your identity here is your Nimiq address, and you prove it by signing a challenge with your wallet.",
        "You may set a display name and a postage price. Both are public: anyone who looks up your address can read them.",
      ],
    },
    {
      heading: "What the relay holds",
      body: [
        "Your address, the encryption key your device published, and your sessions. A session lasts 30 days.",
        "Messages waiting to be delivered, and knocks waiting to be answered — as sealed text, with who sent them, who they are for, and when.",
        "Who may write to whom, the groups you are in and who else is in them, requests to join, and gifts with their shares and claims.",
        "The transaction hash of postage that has been spent, so the same payment cannot open two doors.",
      ],
    },
    {
      heading: "What we cannot read",
      body: [
        "Messages between two people are sealed on the sending device and opened on the receiving one. The keys never leave those devices, and the relay carries text it cannot open. Nor can we open it later: there is no copy of your keys to compel.",
      ],
    },
    {
      heading: "What we can read",
      body: [
        "Group messages, in this version, are not encrypted. The relay stores and can read them. Treat a group as a room we can hear.",
        "Metadata, necessarily, even where the message is sealed: which address wrote to which, and when. Carrying a message means knowing where to take it.",
      ],
    },
    {
      heading: "What stays on your phone",
      body: [
        "Your conversation history, the names you give people, which chats you have pinned, and your appearance settings. None of it is ever sent to us — the names in particular are yours alone, and the person you named is never told.",
        "Clearing the app's data erases all of it, and there is no copy anywhere else.",
      ],
    },
    {
      heading: "The blockchain is public, and permanent",
      body: [
        "Postage, group join prices and gifts are Nimiq transactions. The sender, the recipient, the amount and the time are public forever, to everyone, and neither you nor we can remove them.",
        "A knock's payment carries a value that ties it to that knock. Anyone reading the chain can see that your address paid that address.",
        "This is a property of paying on a public chain, not a choice we made about your data — but it is the part of Knock that is least private, and it is worth knowing before you knock.",
      ],
    },
    {
      heading: "Others in the path",
      body: [
        "Nimiq Pay hosts the app and tells it which language you have chosen. We do not ask it for a device identifier.",
        "The app loads its typeface from Google Fonts, which means Google's servers see your IP address when it starts.",
        "Our hosting provider, and the Nimiq network itself, necessarily see traffic in the ordinary course of carrying it.",
        "There is no analytics in Knock, no advertising, and no third party we sell or share anything with.",
      ],
    },
    {
      heading: "How long things are kept",
      body: [
        "A message is held only until the recipient's phone has it. Once collected, your device tells the relay to delete it, and the relay does.",
        "Sessions expire after 30 days. A challenge that is never signed expires in minutes.",
        "A knock is held until it is answered; a declined knock is deleted. A disbanded group takes its messages, membership and requests with it.",
        "Gift records are kept so that claims and refunds can be accounted for.",
      ],
    },
    {
      heading: "What you can do",
      body: [
        "Sign out, which ends the session and leaves the device's history untouched. Delete a chat, which removes it from this phone. Remove a contact, which closes the channel between you. Disband a group you own, which ends it for everyone.",
        `Write to ${CONTACT} to ask what is held for your address, or to ask us to delete it. We will need you to prove control of the address. We cannot delete anything that is on the blockchain, and we cannot delete a message already delivered to somebody else's phone.`,
      ],
    },
    {
      heading: "Children",
      body: [
        `Knock is not for anybody under ${MINIMUM_AGE}.`,
      ],
    },
    {
      heading: "Changes",
      body: [
        "We may update this policy. The current version is the one in the app, with its date at the top.",
        `Questions: ${CONTACT}.`,
      ],
    },
  ],
}
