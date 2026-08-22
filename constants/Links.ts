/**
 * Outbound links to the marketing/legal site (`landing/`, deployed separately).
 *
 * App Store guideline 3.1.2 requires functional Terms and Privacy links to be
 * reachable in-app, and specifically on any surface that sells a subscription.
 * Before this existed the sign-up screen mentioned Terms as plain, unlinked
 * text and the paywall had neither.
 *
 * Origin comes from `landing/sitemap.xml`. If the landing site moves, this is
 * the only place to change.
 */

export const LANDING_ORIGIN = 'https://promptwars.gg';

export const Links = {
  privacyPolicy: `${LANDING_ORIGIN}/privacy-policy.html`,
  termsAndConditions: `${LANDING_ORIGIN}/terms-and-conditions.html`,
  support: `${LANDING_ORIGIN}/#support`,
} as const;
