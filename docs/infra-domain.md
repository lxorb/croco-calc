# Domain & Auth infrastructure — `crococalc.com`

Status of the `crococalc.com` domain, Cloudflare zone, Firebase Auth hardening, and email.

**Mail summary (decided 2026-08-02, user decision):** receiving = **Cloudflare Email Routing** (free,
`contact@` and `support@` forward to `me@emilvinu.de`, enabled manually by the user); sending = **Firebase
Auth only**, from its own domain. The backend sends no mail and no sending-related DNS record is needed.
See §4.

**This file contains no secrets.** API tokens, client secrets, refresh tokens and signer keys must never
be added to it. The Cloudflare API token is read at call time from `C:\Users\me\agent-secrets\cloudflare.txt`
(see INF-028); Firebase admin calls use an OAuth2 access token minted from the local `firebase-tools`
login. Neither value belongs in the repo.

Last updated: 2026-08-02. Every "verified" claim below came from an API response observed on that date.

---

## 1. Cloudflare zone — VERIFIED, ACTIVE

Registered through Cloudflare Registrar on 2026-08-02.

| Field | Value |
| --- | --- |
| Zone name | `crococalc.com` |
| Zone id | `16b25af306fcd3f45a28b54f65602e9a` |
| Account | `b0e98c15b1f905a394ecd6a849e8e99f` ("Emil Vinu") |
| Status | **`active`** (not pending) |
| Created / activated | `2026-08-02T06:59:05Z` / `2026-08-02T06:59:06Z` |
| Type | `full` |
| Paused | `false` |
| Plan | Free Website |
| Nameservers | `joan.ns.cloudflare.com`, `steven.ns.cloudflare.com` |
| Original nameservers | none (registered at Cloudflare, so never delegated elsewhere) |

Because the zone was registered *at* Cloudflare it was active immediately — there is no pending
nameserver-delegation wait. DNS changes take effect as soon as they are written.

### Current DNS records

**The zone has zero DNS records.** Verified twice via
`GET /zones/16b25af306fcd3f45a28b54f65602e9a/dns_records` — `result` was an empty array both times.

Nothing resolves on `crococalc.com` yet. This is a clean slate; there is nothing to migrate or work around.

---

## 2. Firebase Auth — authorized domains — DONE, VERIFIED

Project `croco-calc` (project number `993399579889`, authDomain `croco-calc.firebaseapp.com`).

`authorizedDomains` on `identitytoolkit.googleapis.com/admin/v2/projects/croco-calc/config` is a
**full-list replace**, not an append — a PATCH must always resend the existing entries or they are dropped.

| Before | After |
| --- | --- |
| `localhost` | `localhost` |
| `croco-calc.firebaseapp.com` | `croco-calc.firebaseapp.com` |
| `croco-calc.web.app` | `croco-calc.web.app` |
| — | **`crococalc.com`** |
| — | **`www.crococalc.com`** |

Applied with `PATCH .../config?updateMask=authorizedDomains`, then confirmed by an independent
`GET .../config`: the re-read returned exactly those five entries in that order. Google and GitHub sign-in
popups/redirects will now be accepted from the custom domain.

This satisfies INF-095 for the custom-domain hostnames. The `workers.dev` hostname (INF-024) is still
**not** in the list — add it if the workers.dev URL is ever used for real sign-in testing.

---

## 3. Firebase Auth — password hardening — DONE, VERIFIED

Passwordless / email-link sign-in was never intended for croco calc. It was implicitly **on**: the config
returned `signIn.email = { "enabled": true }` with no `passwordRequired` field, and an absent
`passwordRequired` defaults to `false`, which permits email-link sign-in.

| | Before | After |
| --- | --- | --- |
| `signIn.email.enabled` | `true` | `true` |
| `signIn.email.passwordRequired` | *(absent → false)* | **`true`** |

Applied with:

```
PATCH .../config?updateMask=signIn.email.passwordRequired
{"signIn":{"email":{"enabled":true,"passwordRequired":true}}}
```

Confirmed by an independent `GET .../config`, which returned
`"email": { "enabled": true, "passwordRequired": true }`. Email/password sign-in still works; email-link
(passwordless) sign-in is now refused.

> Note: the `GET .../config` response also contains `signIn.hashConfig`, which includes a `signerKey`.
> That value is a secret — do not paste config dumps into this repo or into issues.

---

## 4. Email on `crococalc.com` — architecture decided, enabling is a user action

> ### Decided 2026-08-02 by user decision
>
> Moving email to Azure was considered and **cancelled**. The architecture is:
>
> | Direction | Owner | Cost | What it needs on this zone |
> |---|---|---|---|
> | **Sending** — account verification, password reset | **Firebase Auth**, from its own Firebase-hosted domain | $0 | **nothing** — no SPF, no DKIM, no DMARC, no sending domain |
> | **Receiving** — `contact@crococalc.com`, `support@crococalc.com` → `me@emilvinu.de` | **Cloudflare Email Routing** | $0 | MX + SPF, which **Cloudflare creates itself** when routing is enabled |
>
> **The backend sends no email at all.** Audited 2026-08-02: `backend/src/init/email-client.ts` does not
> exist, `nodemailer` has zero references in `backend/src` and is absent from `backend/package.json`, and
> `backend/email-templates/`, `backend/src/queues/` and `backend/src/workers/` are all gone.
> `backend/src/utils/croco-mail.ts` remains, but it only builds the **in-app inbox** message — it sends
> nothing and imports no transport. So the old note at the end of this section about needing a transactional
> SMTP provider for `noreply@crococalc.com` is **obsolete**: nothing sends as that address, and nothing needs
> to.
>
> **Why not Azure Communication Services?** For sending it would be redundant — Firebase already does it,
> free, with no DNS work. For receiving it is not merely redundant but **incapable**: ACS Email has no
> inbound feature. Its Event Grid integration carries only delivery and engagement reports for *outbound*
> mail, so there is no inbound event type to route and no mailbox a person can open. The Azure-family answer
> to "a human must read `contact@`" is an Exchange Online mailbox at roughly $4/user/month — which buys
> nothing over Cloudflare's $0 forward and would eat ~10 % of the remaining budget headroom. Cloudflare Email
> Routing is therefore kept **deliberately**, not by inertia.
>
> **No mail-related DNS records have been created by tooling.** The zone was re-verified on 2026-08-02 and
> holds **zero DNS records of any type — zero MX, zero TXT**. This matters: when the user enables Email
> Routing, Cloudflare writes its own MX and SPF records into a completely clean zone, with nothing to
> conflict against.

### Original blocker record (still accurate on the token, retained for context)

**Not configured. Nothing was created.** The Cloudflare API token currently in
`agent-secrets\cloudflare.txt` is valid and active but is **not scoped for Email Routing**.

Verified: every Email Routing endpoint returned `HTTP 403 {"code":10000,"message":"Authentication error"}`:

| Call | Result |
| --- | --- |
| `GET /zones/{zone}/email/routing` | 403 |
| `GET /zones/{zone}/email/routing/dns` | 403 |
| `GET /zones/{zone}/email/routing/rules` | 403 |
| `POST /zones/{zone}/email/routing/enable` | 403 |
| `GET /accounts/{account}/email/routing/addresses` | 403 |
| `POST /accounts/{account}/email/routing/addresses` | 403 |

This is a scope problem, not a zone-state problem: the same token succeeds on
`GET /user/tokens/verify`, zone read, DNS record read, **and DNS record write** (proved by creating and
then deleting a throwaway TXT record — the zone was left at zero records). The Email Routing endpoints
also 403 on a *different* zone in the same account, so it is not specific to `crococalc.com`.

No MX or SPF records were hand-rolled. Writing Cloudflare's MX records without Email Routing actually
enabled on the zone would point the domain's mail at forwarders that reject it — worse than having no MX
at all. Enabling Email Routing creates those records itself, so the correct fix is to unblock the API.

### To unblock (human action)

Either add these permission groups to the existing token, or create a new one, at
Cloudflare dashboard → My Profile → API Tokens:

- **Account → Email Routing Addresses → Edit** — needed to add/verify destination addresses
- **Zone → Email Routing Rules → Edit** (zone `crococalc.com`) — needed to enable routing and add rules

Alternatively do the whole thing in the dashboard: **crococalc.com → Email → Email Routing**.

### What to configure once unblocked

1. Enable Email Routing on the zone — `POST /zones/16b25af306fcd3f45a28b54f65602e9a/email/routing/enable`.
   Prefer letting Cloudflare add the DNS records automatically rather than writing them by hand.
2. Add the destination address — `POST /accounts/{account}/email/routing/addresses` with
   `{"email":"me@emilvinu.de"}`.
3. Create rules — `POST /zones/{zone}/email/routing/rules`, one per address, matcher
   `{"type":"literal","field":"to","value":"<addr>"}` and action
   `{"type":"forward","value":["me@emilvinu.de"]}`:
   - `contact@crococalc.com` — the address the contact modal uses (CP-153, CP-155, CP-156)
   - `support@crococalc.com` — referenced by the warnings copy and the OpenAPI contact block
   - catch-all — `PUT /zones/{zone}/email/routing/rules/catch_all` with the same forward action

### ⚠ Destination verification is unavoidable human action

Cloudflare will not deliver to a destination address until it is verified. Adding
`me@emilvinu.de` triggers a confirmation email to that inbox, and **a human must click the link in it**.
Until that click happens, every routing rule exists but silently delivers nothing. This step cannot be
automated.

### Expected DNS records (from Cloudflare docs — NOT yet verified here)

Because `GET /email/routing/dns` returned 403, the exact record set could not be read. Cloudflare normally
creates, at the zone apex:

- three `MX` records → `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net`,
  with per-zone priorities that Cloudflare assigns (do not assume fixed numbers)
- one `TXT` SPF record → `v=spf1 include:_spf.mx.cloudflare.net ~all`

Re-read `GET /zones/{zone}/email/routing/dns` after enabling and replace this section with the real values.
Cloudflare does **not** create a DMARC record; consider adding `_dmarc` TXT `v=DMARC1; p=quarantine`
(the pattern already used on `emilvinu.de`).

### Email Routing cannot send mail — and nothing needs it to

Cloudflare Email Routing is **inbound forwarding only**. That is fine, because **nothing in croco calc sends
mail from `crococalc.com`**:

- Firebase Auth sends verification and password-reset mail itself, from its own Firebase domain. It needs no
  records on this zone.
- The backend's SMTP client is **gone** — see the audit in the decision box at the top of this section. The
  paragraph that used to sit here described `backend/src/init/email-client.ts` and its
  `EMAIL_HOST`/`EMAIL_USER`/`EMAIL_PASS`/`EMAIL_PORT`/`EMAIL_FROM` env vars, defaulting to
  `Monkeytype <noreply@monkeytype.com>`. That file no longer exists and those variables have no consumer.

Consequently **no SPF include, no DKIM selector and no DMARC record is required for sending**, and none
should be added. If a future feature genuinely needs the app to send mail, that is a new decision requiring
a sending domain and its own DNS records — do not assume the current setup supports it.

---

## 5. Pointing the domain at the Worker — PLAN ONLY, not executed

Deliberately **not** done: no Worker is deployed yet. Verified via
`GET /accounts/{account}/workers/scripts` — no `croco-calc` script exists. And
`GET /zones/{zone}/workers/routes` for `crococalc.com` returned an empty array.

Per INF-008 the Worker will be named **`croco-calc`**, deployed from `frontend/wrangler.jsonc` as an
assets-only Worker (INF-014).

### Use Workers Custom Domains, not Workers Routes

**The apex does not need a manual CNAME-flattening record.** A Workers Custom Domain makes Cloudflare
create and own the DNS record and issue the certificate itself, and it works at the zone apex.

This is confirmed by existing bindings in this same account, read from
`GET /accounts/b0e98c15b1f905a394ecd6a849e8e99f/workers/domains` — several apex + `www` pairs already work
this way, e.g. `modefold.com` and `www.modefold.com` → service `modefold`, and `kreuzhub.de` /
`www.kreuzhub.de` → `kreuzhubde`. Follow that pattern.

The alternative, a **Workers Route** (`POST /zones/{zone}/workers/routes` with pattern `crococalc.com/*`),
is *not* recommended: it does not create DNS, so it requires a proxied placeholder record to already exist
at the hostname (the usual trick is a proxied `AAAA` at `100::`), and it leans on Universal SSL rather than
provisioning a dedicated cert. Custom Domains avoid both.

### Option A (preferred) — declare it in wrangler and let `wrangler deploy` do it

Add to `frontend/wrangler.jsonc`:

```jsonc
"routes": [
  { "pattern": "crococalc.com",     "custom_domain": true },
  { "pattern": "www.crococalc.com", "custom_domain": true }
]
```

`wrangler deploy` then creates both custom domains and their DNS records. This keeps the domain binding in
version control alongside the rest of the Worker config, which is why it is preferred over ad-hoc API calls.

### Option B — direct API, if the binding must happen outside a deploy

Run once per hostname, after the `croco-calc` Worker exists:

```
PUT https://api.cloudflare.com/client/v4/accounts/b0e98c15b1f905a394ecd6a849e8e99f/workers/domains
Authorization: Bearer <CLOUDFLARE_API_TOKEN>
Content-Type: application/json

{
  "zone_id":     "16b25af306fcd3f45a28b54f65602e9a",
  "hostname":    "crococalc.com",
  "service":     "croco-calc",
  "environment": "production"
}
```

then the same body with `"hostname": "www.crococalc.com"`.

Verify with `GET /accounts/{account}/workers/domains` — each entry should come back with
`"service": "croco-calc"`, `"enabled": true` and a populated `cert_id`. Then confirm the DNS side with
`GET /zones/16b25af306fcd3f45a28b54f65602e9a/dns_records` (records should now exist where there were none)
and finally `curl -sI https://crococalc.com/`.

To undo: `DELETE /accounts/{account}/workers/domains/{domain_id}`.

### Notes

- Token scope for this step looks fine: the current token can already **read** Workers scripts and Workers
  domains. Write access to `workers/domains` was not tested (that would have meant creating a binding).
  INF-029 already requires *Account → Workers Scripts → Edit*.
- If `www` should redirect to the apex instead of serving the Worker directly, bind only the apex as a
  custom domain and add a Redirect Rule for `www`. Binding both, as above, serves the same Worker on both.
- Enabling Email Routing and binding the Worker do not conflict: Email Routing writes `MX`/`TXT` at the
  apex, the custom domain writes an address record. They coexist.
- **Requirements conflict to resolve:** INF-025 currently states "No custom domain, no Cloudflare zone, no
  DNS records are to be provisioned for v1". The domain purchase supersedes that. INF-025, and the INF-024
  claim that the production URL is `https://croco-calc.<subdomain>.workers.dev`, need updating.

---

## 6. Summary — done vs pending

### Done and verified

- `crococalc.com` zone confirmed active, id `16b25af306fcd3f45a28b54f65602e9a`, **zero DNS records** —
  re-verified 2026-08-02 via `GET /zones/{zone}/dns_records?per_page=100`: `result` was an empty array,
  **zero MX and zero TXT**. No mail-related record has been created by any tooling, so the zone is clean for
  the user to enable Email Routing into.
- Mail architecture decided (§4): receiving = Cloudflare Email Routing, sending = Firebase Auth only.
  Azure Communication Services evaluated and rejected — it cannot receive mail into a human-readable mailbox.
- Backend mail subsystem audited and confirmed **absent** (no `email-client.ts`, no `nodemailer`, no
  templates, no queues/workers); `croco-mail.ts` correctly survives as the in-app inbox builder.
- Firebase `authorizedDomains` extended to include `crococalc.com` and `www.crococalc.com`, re-read to confirm.
- Firebase `signIn.email.passwordRequired` set to `true`, re-read to confirm; email-link sign-in disabled.

### Pending — human action required

1. **Enable Cloudflare Email Routing** on `crococalc.com` — **the user has taken this on** and will do it in
   the dashboard (crococalc.com → Email → Email Routing). Either grant the API token the two missing
   permission groups (Account → Email Routing Addresses → Edit; Zone → Email Routing Rules → Edit) or skip
   the API entirely and use the dashboard. Add `contact@crococalc.com` and `support@crococalc.com` as
   forwards to `me@emilvinu.de`. Let Cloudflare write the MX/SPF records itself.
2. **Click the verification link** Cloudflare emails to `me@emilvinu.de` once it is added as a destination.
   Routing rules deliver nothing before this. Unavoidably human.
3. **Decide the contact address.** `docs/requirements/03-pages-core.md` §10 blocker **B-1** still has
   `<CONTACT_EMAIL>` set to the placeholder `me@emilvinu.de`. With the domain live, `contact@crococalc.com`
   is the natural value — update the build-time constant (CP-156) once routing forwards it.
4. ~~**Choose an outbound SMTP provider.**~~ **Struck 2026-08-02** — nothing sends from this domain. Firebase
   Auth owns all user-facing mail and sends from its own domain.
5. **Deploy the `croco-calc` Worker**, then apply §5 to bind apex and `www`.
6. **Update INF-024 / INF-025** in `docs/requirements/06-infra-and-ops.md` to reflect that a custom domain
   now exists.

### Failed

- All Cloudflare Email Routing API calls — `HTTP 403`, insufficient token scope. See §4.
