# Security policy

## Supported versions

Only the latest commit on `main` (and the demo deployed from it) receives fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub Security Advisories:
**[Report a vulnerability](https://github.com/bisratasfaw/perai-view/security/advisories/new)**
(repository **Security** tab, then **Report a vulnerability**).

Include what you found, how to reproduce it and the impact you expect. The maintainer aims to
reply within 7 days. Once a fix is released, the advisory is published with credit to you unless
you prefer to stay anonymous.

## Scope

PerAI View shows simulated data only. It has no accounts, no database and no secrets, but these
are still in scope:

- The backend API and WebSocket feed (`backend/`): input validation, rate limiting, CORS and
  origin checks, denial of service, error responses that leak internals.
- The classifier service (`ai-classifier/`).
- The frontend (`frontend/`): XSS or injection through URL parameters or API data.
- Container images, the nginx configuration and the GitHub Actions workflows.
- Vulnerable dependencies that are actually reachable.

Out of scope: findings that need a compromised machine or browser, social engineering, and volumetric
denial of service against the free hosting providers themselves.
