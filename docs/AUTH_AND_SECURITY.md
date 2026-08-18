# Authentication and security architecture

## Decision

Maw3id owns the user account. Login methods are identities linked to that account; no external provider is the account itself.

| User | Primary login | Additional login | Assurance required |
| --- | --- | --- | --- |
| Patient | Moroccan phone number + one-time code | Google, password/passkey later | Verified phone before joining a queue |
| Doctor | Verified email or phone | Google, passkey | MFA plus approved doctor/cabinet verification |
| Secretary | Invitation from an approved doctor/cabinet | Google, passkey | MFA before queue operations |
| Admin | Managed invitation | Passkey/TOTP recovery path | Phishing-resistant MFA and step-up authentication |

Google-only authentication is rejected because it would exclude patients without a suitable Google account and would make a critical access path depend on one external provider. Phone-only authentication is also insufficient for privileged staff because phone numbers can be recycled and SMS is vulnerable to delivery failures and account takeover.

## Browser session model

1. The browser authenticates through a backend endpoint.
2. The backend creates a random, opaque session identifier and stores only its hash in PostgreSQL or the session store.
3. The browser receives the identifier in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie.
4. State-changing requests require CSRF protection and strict origin validation.
5. Sessions have idle and absolute expirations, rotate after login or privilege changes, and can be revoked per device or account.
6. Raw session identifiers, OTPs, authorization codes, and Google tokens are never written to logs.

The React application must not store authentication tokens in `localStorage` or expose them to application JavaScript.

## Google sign-in

Google is an optional OpenID Connect identity provider. Use Authorization Code flow with PKCE through a maintained library. Validate issuer, audience, signature, nonce, state, redirect URI, and token timestamps. Use Google's stable `sub` claim as the external identity key; email is profile data and may change.

Account linking is a sensitive action. A matching email alone must never silently merge two accounts. Require an authenticated Maw3id session and recent reauthentication of both identities, then record an audit event.

## Phone one-time codes

Phone numbers are normalized to E.164. OTP challenges are short-lived, single-use, attempt-limited, and stored as hashes. Responses are deliberately generic to prevent account enumeration.

Controls include per-phone, per-IP, per-device, and platform-wide rate limits; resend cooldowns; provider timeouts; replay prevention; cost alarms; and a recovery process for recycled or lost numbers. SMS delivery is never treated as proof that a person is a licensed doctor.

### Current implementation

The patient web flow uses `POST /api/v1/auth/phone/request` and
`POST /api/v1/auth/phone/verify`. Challenges are PostgreSQL-backed, HMAC-hashed,
five-minute, single-use, attempt-limited, and protected by phone/IP/platform limits.
Successful verification creates an opaque HttpOnly cookie session. The browser can
restore a session through `GET /api/v1/auth/session` and revoke it through
`POST /api/v1/auth/logout` with CSRF protection.

Local development may use `OTP_DELIVERY_MODE=development`, which returns the code
only in the development response. Production refuses that mode and requires an HTTPS
provider URL, provider token, and a separate OTP hashing pepper. Provider-side cost
alarms and a reviewed lost/recycled-number recovery workflow remain deployment gates.

## Authorization

Authentication answers who the user is. Authorization independently checks what that user may do to this resource.

Every protected operation checks:

1. authenticated user and active/non-suspended account;
2. role capability;
3. ownership or active staff assignment to the doctor/cabinet;
4. resource state and allowed state transition;
5. step-up authentication for high-impact actions;
6. audit event for sensitive or operational changes.

Roles are not accepted from request bodies, headers, Google claims, or phone providers. They come from Maw3id's database.

## Abuse and recovery edge cases

| Risk | Required behavior |
| --- | --- |
| Repeated login/OTP attempts | Layered throttling, cooldown, generic response, alert on attack patterns |
| SMS provider outage | Clear retry state; optional linked login; never bypass verification |
| Lost/recycled phone number | Revoke sessions and use a reviewed recovery flow for privileged accounts |
| Stolen session | Rotate on authentication, revoke per device, short idle lifetime, anomaly alerts |
| CSRF | SameSite cookie, CSRF token, and Origin/Referer checks on mutations |
| XSS | CSP, output encoding, dependency review; HttpOnly cookie limits credential theft |
| Google outage | Existing sessions continue; phone or passkey remains available |
| Duplicate identities | Explicit, recently reauthenticated account linking; no email-only auto-merge |
| Staff leaves cabinet | Assignment revocation immediately blocks future operations and revokes relevant sessions |
| Admin account takeover | Step-up MFA, least privilege, immutable audit trail, two-person review for exceptional actions |
| User deletion request | Defined retention/anonymization policy that preserves legally required audit integrity |

## Secrets and cryptography

Use maintained libraries and platform primitives. Passwords, if introduced, use Argon2id with calibrated parameters. Secrets live in a secret manager in production, rotate without code changes, and never enter the repository. Encryption keys, signing keys, OTP provider credentials, and database credentials have separate scopes.

## Release gates

Authentication cannot be called production-ready until integration tests cover login, logout, expiry, rotation, revocation, CSRF, authorization boundaries, account linking conflicts, rate limits, recovery, suspended users, and concurrent requests.
