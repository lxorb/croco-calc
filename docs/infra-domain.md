# Domain & Auth infrastructure — `crococalc.com`

Status of the `crococalc.com` domain, Cloudflare zone, Firebase Auth hardening, and email.

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

## 4. Email on `crococalc.com` — BLOCKED on token permissions

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

### Email Routing cannot send mail

Cloudflare Email Routing is **inbound forwarding only**. The backend sends verification and
password-reset mail through nodemailer SMTP (`backend/src/init/email-client.ts`, env vars `EMAIL_HOST`,
`EMAIL_USER`, `EMAIL_PASS`, `EMAIL_PORT`, `EMAIL_FROM`; the hardcoded default is still
`Monkeytype <noreply@monkeytype.com>`). Sending as `noreply@crococalc.com` needs a separate transactional
SMTP provider plus its own SPF include and DKIM records on this zone. That is not covered by Email Routing
and is not set up.

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

- `crococalc.com` zone confirmed active, id `16b25af306fcd3f45a28b54f65602e9a`, zero DNS records.
- Firebase `authorizedDomains` extended to include `crococalc.com` and `www.crococalc.com`, re-read to confirm.
- Firebase `signIn.email.passwordRequired` set to `true`, re-read to confirm; email-link sign-in disabled.

### Pending — human action required

1. **Grant Email Routing permissions** to the Cloudflare API token (Account → Email Routing Addresses →
   Edit; Zone → Email Routing Rules → Edit), or configure Email Routing in the dashboard. Nothing about
   email works until this is done.
2. **Click the verification link** Cloudflare emails to `me@emilvinu.de` once it is added as a destination.
   Routing rules deliver nothing before this.
3. **Decide the contact address.** `docs/requirements/03-pages-core.md` §10 blocker **B-1** still has
   `<CONTACT_EMAIL>` set to the placeholder `me@emilvinu.de`. With the domain live, `contact@crococalc.com`
   is the natural value — update the build-time constant (CP-156) once routing forwards it.
4. **Choose an outbound SMTP provider** if the backend is to send as `noreply@crococalc.com`.
5. **Deploy the `croco-calc` Worker**, then apply §5 to bind apex and `www`.
6. **Update INF-024 / INF-025** in `docs/requirements/06-infra-and-ops.md` to reflect that a custom domain
   now exists.

### Failed

- All Cloudflare Email Routing API calls — `HTTP 403`, insufficient token scope. See §4.
