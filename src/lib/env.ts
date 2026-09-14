/**
 * Whether this is running against the dev server rather than a shipped build.
 *
 * One question asked in one place, because it was being asked in two with
 * opposite polarity — and the two could drift into disagreeing about what a
 * development build is.
 *
 * `MODE` rather than `DEV`, and the reason is one direction rather than both.
 * `DEV` is derived from `NODE_ENV`, so `NODE_ENV=development npm run build`
 * produces a **production build with `DEV` true** — which would ship the fixed
 * seeds in `lib/wallet` as real keys, and the dev controls with them, in a
 * bundle that otherwise works perfectly and gives no sign. `NODE_ENV` is exactly the kind
 * of thing a CI image, a Dockerfile or a deploy script sets in passing.
 *
 * `MODE` comes from the command instead: `development` for the dev server,
 * `production` for a build, and no environment variable moves it. What is being
 * asked here is which of those two this is, and only one of the flags answers
 * that question.
 *
 * Vite compiles `import.meta.env.MODE` to a literal, so this folds to `false`
 * in a build and whatever it guards is dropped rather than shipped switched
 * off. Two things depend on that: the fixed test identities in `lib/wallet`,
 * which are real keys from fixed seeds, and the reset in `ChangelogSheet`.
 */
export const DEV_SERVER = import.meta.env.MODE !== "production"
