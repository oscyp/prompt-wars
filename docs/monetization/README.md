# Prompt Wars store setup

Catalog source: `docs/prompt-wars-implementation-concept.md` §10 and `utils/revenuecat.ts`.

| Product | Store product ID | Type | US base price | Grant |
| --- | --- | --- | --- | --- |
| Starter | `credits_10` | Consumable | $1.99 | 10 credits |
| Standard | `credits_30` | Consumable | $4.99 | 30 credits |
| Big | `credits_80` | Consumable | $9.99 | 80 credits |
| Mega | `credits_200` | Consumable | $19.99 | 200 credits |
| Prompt Wars+ Monthly | `promptwars_plus_monthly` | Auto-renewing, P1M | $9.99 | Plus benefits |
| Prompt Wars+ Annual | `promptwars_plus_annual` | Auto-renewing, P1Y | $59.99 | Plus benefits, monthly allowance |

Plus grants 90 video rounds / a cap of 30 full-battle upgrades per month, plus the implemented badge and cosmetics. No competitive advantage, priority generation, or extra retention is advertised. Monthly and annual Apple subscriptions belong to the same `Prompt Wars+` subscription group. Google base plans are active as `monthly` and `annual`, producing RevenueCat identifiers `promptwars_plus_monthly:monthly` and `promptwars_plus_annual:annual`.

## Import files

- `app-store-products.csv`: six products with English metadata and US base prices.
- `play-base-plans-draft-request.json`: archival request successfully executed through Google API Explorer on 2026-09-22 after explicit user approval of its Terms and account authorization. The batch update returned HTTP 200 and created the exact `monthly` and `annual` draft plans with US and Polish prices. Regional prices were then expanded in Play Console and both plans activated. **Do not replay this request:** the `basePlans` update mask replaces the array and this initial request contains only two regions. Export the current records before any future change.
- `play-store-subscriptions.csv`: two subscription/base-plan combinations. RevenueCat Product Editor does not support Google one-time products; create the four consumables in Play Console.

The Apple file was **committed successfully** through RevenueCat Product Editor (plan `e96910fb-41f6-415c-9987-3acdc5ad295c`): five products created and `credits_10` updated. All six products were imported into RevenueCat. The CSV contains only the initial US prices; equivalent prices and availability for all 175 Apple regions were configured afterward in App Store Connect. Export the current store records before using this file for future changes.

The Google CSV was **not committed through RevenueCat Product Editor**. Both subscription records and benefits were created in Play Console; their base plans were created through Google API Explorer and then priced and activated in Play Console. All six Android products are now **Published** in RevenueCat. The first Android build is available to internal testers and RevenueCat credentials validate successfully.

The Google CSV was submitted for Product Editor validation after credentials were saved and again after the first build was published. Its plan shows the intended monthly/annual products and prices, but blocks commit with a `Manage store presence` permission warning. Direct inspection of the service account in Play Console confirmed that this permission is already saved, along with read app information, view financial data, and manage orders/subscriptions. No additional Play account permission was granted by this task. Use a fresh store export before retrying the CSV, because the subscription records now exist.

[Product Editor format](https://www.revenuecat.com/docs/offerings/product-editor-csv) · [Review and commit workflow](https://www.revenuecat.com/docs/offerings/product-editor-configure)

## Connections inspected on 2026-09-22

- App Store Connect app: `6788787677`; bundle `gg.promptwars.app`.
- Apple Paid Apps Agreement, banking, tax forms, and displayed compliance records are active.
- Google Play app: `4972578862027355782`; package `gg.promptwars.app`.
- RevenueCat project: `bb1f5081`.
- RevenueCat Apple app: `app82d8f891de`; purchase key and App Store Connect API key show valid credentials.
- RevenueCat Play app: `appcd741a8dd6`; the user supplied and saved Google service-account credentials. **Valid credentials** after the first Android build upload. Google developer notifications are connected and delivery was verified at **14:45 UTC**.
- Supabase project: `uoyjhudegdpanrgllfoj` (local CLI account; connected Supabase MCP has a different project).
- Webhook: `https://uoyjhudegdpanrgllfoj.supabase.co/functions/v1/revenuecat-webhook`.
- RevenueCat integration: `whintgr7f48e078a4`, active, HMAC signing enabled, all apps, all events, production + sandbox.
- Post-deployment RevenueCat dashboard TEST event `E8942D95-708C-4B2D-97D6-515FC20E743D` returned HTTP 200 on 2026-09-22 12:30 UTC with `{"action":"ignored","processed":true,"event_type":"TEST"}`. This verifies RevenueCat delivery and authentication, not a real purchase.
- EAS production has both native SDK keys configured. Local `.env` uses Test Store keys; do not use it as a production environment.

## Store progress and remaining work

- All six Apple products are created as drafts with English metadata, review notes, native review screenshots, and prices/availability across all 175 regions. No product or app was submitted for Apple review. The first products must be submitted with an app version.
- Apple subscription group `22404505` is named `Prompt Wars+`, localized in English (U.S.), and both plans are at service level 1. Family Sharing and billing grace period remain disabled. Annual is billed upfront; no installment plan was configured.
- Android **1.3.2 (5)** was built through EAS (`7ce1f013-da20-4bc7-aa76-4c11cc5b9fc0`), uploaded, and published to internal testing at approximately **14:30 UTC**. The user approved the existing `remedy-testers` list (two people). Google Play reports **Available to internal testers**. [Testing link](https://play.google.com/apps/internaltest/4699748352806262214) · [Build and release evidence](../deployments/2026-09-22-android-1.3.2.md).
- All four Google credit packs are **Active** with purchase option `standard`, **Buy**, **Backwards compatible**, availability in **173 regions**, and converted regional prices. US prices are $1.99 / $4.99 / $9.99 / $19.99; Polish prices are PLN 9.29 / 22.99 / 46.99 / 92.99. Multi-quantity purchasing remains disabled. RevenueCat reports all four **Published**.
- Both Google subscriptions are **Active** with English descriptions and benefits, backwards-compatible base plans `monthly` / `annual`, and **174 countries / regions**. Monthly: P1M, US $9.99 / PLN 46.99, seven-day grace and automatic 53-day account hold. Annual: P1Y, US $59.99 / PLN 279.99, 14-day grace and automatic 46-day account hold. Both allow resubscription and charge at the next billing date on a base-plan change. Other regional prices were converted from USD in Play Console. RevenueCat reports both **Published**, with one entitlement each. The Console creation form incorrectly rejected the valid ASCII IDs in both browsers; the approved Google API Explorer batch update accepted those unchanged IDs with HTTP 200. Saving regional prices and activation then succeeded through the Console. This bypasses the creation-form issue; its underlying cause is not established.
- RevenueCat default offering `ofrngdf3376e114` has corresponding Apple, Android, and Test Store products mapped to `$rc_monthly`, `$rc_annual`, and the `credits_10/30/80/200` packages. Existing FTUO package preserved. The 200-credit package display name is now Mega.
- Only the monthly/annual subscriptions for each store are attached to `plus` (`entl38dd2ea51c`); credit packs grant no entitlement.
- Verified in App Store Connect that production and sandbox server notifications both point to RevenueCat's configured Apple endpoint. Google Play notifications are enabled for subscriptions, voided purchases and all one-time products on `projects/prompt-wars-509413/topics/Play-Store-Notifications`. RevenueCat shows **Connected to Google** and **Last received 2026-09-22, 2:45 p.m. UTC**. The initial test failed because the topic lacked a publisher grant; topic-scoped **Pub/Sub Publisher** was added for Google's documented `google-play-developer-notifications@system.gserviceaccount.com` principal, then the test succeeded. RevenueCat's optional tracking of previously unknown purchases from server notifications remains disabled.
- RevenueCat restore behavior was saved as **Keep with original App User ID**. Players must sign in to their original Prompt Wars account to restore purchases; the backend does not implement cross-profile purchase transfer.
- RevenueCat sandbox access is currently **Anybody**. Review the sandbox allowlist for release testing.
- Native sandbox purchase, restoration, renewal, cancellation through paid expiry, duplicate webhook, and credit-ledger verification remain necessary before sale.

## Created product records

| Product ID | Apple ID | RevenueCat Apple | RevenueCat Android |
| --- | --- | --- | --- |
| `credits_10` | `6814775957` | `prod94ed33d94b` | `prod21c38f5a49` |
| `credits_30` | `6814814101` | `prod88dd0e715e` | `prod46239853dd` |
| `credits_80` | `6814814105` | `prode2c3e53094` | `prodd2ea3b2830` |
| `credits_200` | `6814814053` | `proda3a453bba5` | `prod0c731bb1bb` |
| `promptwars_plus_monthly` | `6814814521` | `prodcc515a1ac2` | `prodded82114bc` |
| `promptwars_plus_annual` | `6814814352` | `prodaeb6089094` | `prod9ed9a526b1` |

Android subscription identifiers include `:monthly` / `:annual`. These exact IDs are active and backwards compatible in Play Console and match the RevenueCat definitions. Android consumables use the exact product IDs above. All six Android entries show **Published** in RevenueCat, verified at approximately 15:55 UTC on 2026-09-22.

Original native review images and capture provenance are in [`review-screenshots/`](review-screenshots/README.md). The two 1206×2622 PNGs were uploaded to all matching Apple credit packs/subscriptions, replacing the Product Editor's blank fallback images.

## Backend deployed and verified on 2026-09-22

Applied `20260922093341_revenuecat_transactional_fulfillment.sql` to the linked Prompt Wars project before deploying `revenuecat-webhook` (version 28) and `request-video-upgrade` (version 26). Both functions are active. The webhook has JWT verification disabled and authenticates RevenueCat's HMAC signature instead.

The migration commits the event claim, purchase, subscription, and credit grant in one transaction, so a failed grant remains retryable. Subscription renewals use the original transaction identity, while preserving each full store product ID. Monthly plans reset on renewal; annual plans receive monthly allowance resets through `reset-subscription-allowances`. Canceled subscriptions retain access and allowances through the paid expiration date.

Verification completed:

- Live signed `TEST` returned HTTP 200; unsigned and altered-body requests returned HTTP 401. Event: `codex-auth-test-3a520f63-132d-4894-b348-6f0faaf919be`. No purchase or player grant was created.
- Live SQL exercised credit fulfillment, a duplicate delivery, subscription activation/renewal, and cancellation inside a transaction that was rolled back. No test purchases persisted.
- `anon` and `authenticated` cannot execute the fulfillment RPC; `service_role` can.
- The allowance reset cron job ran successfully at 09:53, 09:54, and 09:55 UTC.
- Targeted backend tests: 19 tests plus 18 SQL test steps passed. The implementation agent also ran the wider Edge Function suite: 381 passed, 7 skipped.
- Independent mobile verification: 43 tests across wallet subscriptions, purchase recovery, and renewal disclosures passed.

The live HTTP test establishes endpoint authentication, and the rollback SQL establishes database fulfillment. A real native sandbox purchase has **not** been verified yet. Android's billing-enabled build, Google credential validation, all six products, and notification delivery are complete. Apple catalog and RevenueCat mappings are prepared; native store purchase testing and Apple review submission remain separate release steps.

## Mobile changes included in Android 1.3.2 (5)

The wallet now offers both monthly and annual Plus packages using localized store prices and the correct renewal period. Purchase recovery recognizes Google subscription IDs with their base-plan suffix while preserving the complete product and transaction IDs for fulfillment matching. Credit grants and subscription state remain server-owned. These app changes are included in Android **1.3.2 (5)**, available to the approved internal testers. The 43 targeted wallet tests and TypeScript check passed again before submission. Both Google base plans are now active and ready for native sandbox purchase testing.
