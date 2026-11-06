# NFR Verification Report — S2-14

**Issue:** #39 — NFR verification and documentation  
**Owner:** Dev D (Surya Raju Naik)  
**Independent tester:** Dev C (Sujay P Nayak)  
**Verification date:** 5 November 2026  
**Baseline:** upstream main at b50f74e1af0a3f430e5183725ec287383cb51ee0

## 1. Executive status

This report separates automated checks in the repository from operational evidence that must be collected from a deployed environment. No uptime, browser audit, storage-encryption proof, or 10,000-user load result is claimed without evidence.

| Requirement | Acceptance target | Current evidence | Status |
|---|---|---|---|
| SEBM-NF-001 | At least 90% of screen/data-load and transaction-save responses within 2 seconds | Repeatable HTTP benchmark added as backend/scripts/nfr/performance-smoke.js; unit tests cover p90 and pass-rate decisions. It still needs to run against staging with a valid test account. | **Harness added; measurement pending** |
| SEBM-NF-002 | 99.5% monthly availability | Requires continuous external monitoring and a 30-day measurement window. The 30-day downtime allowance at 99.5% is 216 minutes (3 hours 36 minutes). No monitoring history is present in this repository. | **Documented; not measured** |
| SEBM-NF-003 | Personal and financial data encrypted in transit and at rest | Node TLS 1.2+ and HTTPS enforcement already exist. Production configuration now fails closed unless application HTTPS and verified PostgreSQL TLS are configured. Database-storage and backup encryption still need provider-side evidence. | **Transport guard added; at-rest proof pending** |
| SEBM-SR-003 | Sensitive stored data / linked account identifiers encrypted at rest using AES-256 or equivalent | Current account schema stores account name/type/balance; no linked-bank account number or credential field was found. No speculative schema change was added. | **No linked identifier field; storage decision pending** |
| SEBM-NF-004 | WCAG 2.1 AA | Low-contrast muted text colors were darkened and keyboard focus indicators strengthened. Full browser-based keyboard, screen-reader, and automated axe/Lighthouse audit remains to be executed. | **Targeted CSS fixes; audit pending** |
| SEBM-NF-005 | Backend supports 10,000 concurrent users | The default PostgreSQL pool is 10 connections and the repository does not contain a measured 10,000-user load test or production autoscaling configuration. | **Documented; not load-verified** |

## 2. TC-Perf-01 — response time

The benchmark script runs a configurable GET read/screen-data endpoint and a POST transaction-save endpoint. It reports sample count, success rate, percentage of successful requests within the budget, and nearest-rank p90 latency. It returns a failing exit code unless both endpoint groups satisfy the 2,000 ms p90 and 90% within-budget criteria.

Run only against a staging/test deployment. Repeated POST requests create data; the script therefore requires the explicit NFR_ALLOW_WRITE=true opt-in.

PowerShell example (replace the URLs, token, and JSON with a valid staging user and the current transaction API contract):

    cd backend
    $env:NFR_LOAD_URL = "https://<staging-host>/<read-endpoint>"
    $env:NFR_SAVE_URL = "https://<staging-host>/<transaction-create-endpoint>"
    $env:NFR_AUTH_TOKEN = "<staging-user-token>"
    $env:NFR_SAVE_BODY = '{"<required-field>":"<test-value>"}'
    $env:NFR_ALLOW_WRITE = "true"
    $env:NFR_REQUESTS = "30"
    $env:NFR_CONCURRENCY = "5"
    npm run nfr:perf

Use a disposable test account and test data, then remove the generated records. Do not use a production user or financial account. The GET measurement is HTTP response timing; it is not a browser paint metric. For the user-visible screen-load portion, capture a Lighthouse/Web Vitals report (including LCP) in the target browser and attach that evidence to the PR.

Automated summary tests:

    cd backend
    npm run test:nfr

## 3. TC-Sec-01 / TC-Sec-04 — encryption

### In transit

The existing backend supports TLS with a minimum protocol version of TLS 1.2 and has HTTPS enforcement/security-header middleware. The integration suite includes TLS handshake coverage. However, the checked-in environment templates previously defaulted TLS_ENABLED=false, ENFORCE_HTTPS=false, and DB_SSL=false; those development defaults are not proof of a secure production deployment.

The production configuration guard now requires:
- DB_SSL=true with DB_SSL_REJECT_UNAUTHORIZED=true, so PostgreSQL TLS is encrypted and the database server certificate is verified.
- Either direct Node TLS (TLS_ENABLED=true with valid certificate/key paths) or HTTPS enforcement at a trusted reverse proxy (ENFORCE_HTTPS=true and an explicit TRUST_PROXY setting).

For a reverse-proxy deployment, configure the exact trusted proxy hop/IP/CIDR; unrestricted TRUST_PROXY=true remains rejected in production. Do not disable certificate verification in production. A local self-signed database may require DB_SSL_REJECT_UNAUTHORIZED=false during development only.

### At rest

Application code cannot establish that the database files, snapshots, and backups are encrypted. The deployment owner must provide evidence from the database/storage provider showing encryption at rest (AES-256 or an equivalent approved standard) and backup encryption. Evidence should identify the service/volume, encryption setting, key-management approach, and verification date. Do not mark NF-003 or TC-Sec-01/04 fully passed until that evidence is attached.

### SR-003 decision

The current account schema has account metadata and balances, but no linked bank account number, routing number, or bank credential field. The safest scope for this story is therefore:
1. Do not add an unused sensitive-identifier column or invent data.
2. Require storage/backup encryption at the database infrastructure layer for existing financial records.
3. Before a future linked-account identifier is introduced, agree with Dev A on a field-level encryption design using managed keys (AES-256-GCM or equivalent), rotation, and a migration plan. Never store bank credentials or full payment secrets as ordinary text.

This PR records the evidence gap rather than making an unreviewed Accounts-table schema change. Dev A should confirm the SR-003 product decision before any such field is introduced.

## 4. TC-UX-01 — accessibility

The following source-level issues were addressed:
- Muted eyebrow text changed from #72907d to #536b5a (approximately 5.43:1 against #f6f8f5).
- Muted supporting text changed from #738178 to #65766b (approximately 4.82:1 against white).
- Keyboard focus-visible indicators now use a darker, high-contrast outline.

The full WCAG 2.1 AA audit is not yet complete. Dev C should verify every route at desktop and 320 px/mobile widths, using keyboard-only navigation and a screen reader, and run axe or Lighthouse accessibility checks. Record defects with route, element, expected behavior, actual behavior, and a screenshot or report. In particular, check labels/names, heading order, color contrast for every state, focus order/visibility, errors announced to assistive technology, zoom/reflow, and reduced-motion behavior.

## 5. NF-002 — availability basis and limits

99.5% monthly availability allows at most 0.5% unavailability. For a 30-day month:

    30 × 24 × 60 × 0.005 = 216 minutes

A single successful health-check request is not an uptime measurement. Verification requires an external monitor polling the deployed HTTPS health endpoint at a documented interval, with incident/downtime records and a complete 30-day window. Report the period, total checks, failed checks, excluded maintenance (if the agreed SLA allows it), and computed availability. Until that period exists, retain documented, not measured status (DEV-06 candidate).

## 6. NF-005 — 10,000-concurrent-user basis and limits

The current repository sets PostgreSQL pool maximum to 10 by default and does not configure a multi-instance deployment, autoscaling, queueing, or a database connection pooler. A 10-connection pool can serve many users over time, but it is not evidence that 10,000 simultaneous active users meet the response-time target.

A credible verification requires a defined workload model (active vs. logged-in users, read/write mix, think time, data volume), a production-like topology, a load generator, resource/connection monitoring, and a recorded ramp to 10,000 concurrent virtual users. Capture p90/p95 latency, error rate, CPU/memory, database connections, and saturation. Until that test is run, the requirement remains documented, not load-verified (DEV-06 candidate).

## 7. Verification commands and evidence still required

| Test case | Local/automated action | Evidence still required |
|---|---|---|
| TC-Perf-01 | cd backend; npm run test:nfr; then run npm run nfr:perf against staging | GET and POST benchmark JSON output plus Lighthouse/Web Vitals for the main screen |
| TC-Sec-01 | cd backend; npm test (includes existing TLS integration tests) | Deployed HTTPS/TLS scan and database TLS connection evidence |
| TC-Sec-04 | Review production config and run its unit tests | Database volume/snapshot/backup encryption evidence from provider |
| TC-UX-01 | Review frontend/src/styles.css fixes | Route-by-route manual keyboard/screen-reader check and axe/Lighthouse report |
| TC-Scale-01 | No 10,000-user run is claimed | Production-like load-test report with topology and metrics |

Dev C (Sujay P Nayak) is the independent tester for this issue and should run the checks that require the shared staging deployment, record results, comment "Verified by Sujay P Nayak" only for checks actually passed, and update the RTM. Do not mark operational NFRs passed from source inspection alone.
