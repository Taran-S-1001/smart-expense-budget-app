# Requirements Traceability Matrix (RTM)

Final status for S2-15 (issue #40), checked on 07-11-2026 against `main` at fa7c26d. Requirement IDs, modules and test case IDs come from SRS v4.0 Section 8 and Test Plan Section 13. The submitted documents are not edited (see `docs/DEVIATIONS.md`); this file records the status instead of their N/P/A column, whose meaning the SRS does not define.

How to read the columns:
- **TC tag in tests**: whether the test case ID appears in a test file under `backend/tests`. "No" means the ID is not used there, not that the feature is untested.
- **Build status**: what is on `main`.
- **Verification**: what evidence exists in the repository. "Verified by <name>" comments on the story issues were not checked for this file, so independent sign-off is not stated here. Anything marked "Not verified" matches the list at the end of `docs/DEVIATIONS.md`.

| Req ID | Requirement | Module | Test case(s) | TC tag in tests | Build status | Verification | Comments |
|---|---|---|---|---|---|---|---|
| SEBM-F-001 | User registration | Auth | TC-Reg-01 | No | Built | Automated tests on main (unit, integration, independent) | Accounts are active at once, no email/OTP step (DEV-07). |
| SEBM-F-002 | Login and session persistence | Auth | TC-Auth-01 | Yes | Built | Automated tests on main (unit, integration, independent) |  |
| SEBM-F-003 | Password reset | Auth | TC-Auth-02 | Yes | Built | Automated tests on main; open defects in `backend/tests/known-defects/auth` | Link only, sent as an in-app mock notification (DEV-04, DEV-07). |
| SEBM-F-010 | Add transaction | Transactions | TC-Exp-01 | Yes | Built | Automated tests on main (unit, integration, independent) |  |
| SEBM-F-011 | Edit/delete transaction | Transactions | TC-Exp-02 | Yes | Built | Automated tests on main (unit, integration, independent) | S2-05. |
| SEBM-F-012 | Attach receipt photo | Transactions | TC-Exp-03 | Yes | Built | Automated tests on main (unit, integration, independent) | Stored in the database, not cloud storage (DEV-05). Verifier is Dev C (DEV-01). Independent tests cover validation and authentication cases; the attach/view happy path is covered by the integration and unit tests. |
| SEBM-F-013 | Predefined and custom categories | Transactions | TC-Exp-04 | Yes | Built | Automated tests on main (unit, integration, independent) | S2-06. |
| SEBM-F-020 | Create budget | Budgets | TC-Bud-01 | Yes | Built | Automated tests on main (unit, integration, independent) |  |
| SEBM-F-021 | Track spend vs budget | Budgets | TC-Bud-02 | Yes | Built | Automated tests on main (unit, integration, independent) |  |
| SEBM-F-022 | Budget threshold warning | Budgets | TC-Bud-03 | Yes | Built | Automated tests on main (unit, integration, independent) | Crossing a limit sends both the threshold warning and the limit-exceeded alert (#89). |
| SEBM-F-030 | Multi-account management | Accounts | TC-Acc-01 | Yes | Built | Automated tests on main (unit, integration, independent) |  |
| SEBM-F-031 | Account-to-account transfer | Accounts | TC-Acc-02 | Yes | Built | Automated tests on main (unit, integration, independent) | S2-07. |
| SEBM-F-040 | Generate report | Reports | TC-Rep-01 | Yes | Built | Automated tests on main (unit, integration, independent) | Report routes fixed in #89. |
| SEBM-F-041 | Export report (PDF/CSV) | Reports | TC-Rep-02 | Yes | Built | Automated tests on main (unit, integration) | S2-10, #77. |
| SEBM-F-042 | Period-over-period comparison | Reports | TC-Rep-03 | Yes | Built | Automated tests on main (unit, integration, independent) | S2-11, #77. Stretch story, done (DEV-08 dropped). |
| SEBM-F-050 | Budget-threshold alert notification | Notifications | TC-Notif-01 | Yes | Built (mock provider) | Automated tests on main (unit, integration, independent) | In-app only, no push or email (DEV-04). |
| SEBM-F-051 | Bill payment reminder | Notifications | TC-Notif-02 | Yes | Built | Automated tests on main (unit, integration, independent) | S2-13, stretch story, done (DEV-08 dropped). |
| SEBM-NF-001 | Response time target | Backend API | TC-Perf-01 | Yes | Benchmark script added | Not verified: not run against staging | See DEV-12 and `docs/NFR_VERIFICATION.md`. |
| SEBM-NF-002 | Monthly availability | Infrastructure | Ops reports | No | Not applicable to code | Not verified: no monitoring data | DEV-06. |
| SEBM-NF-003 | Encryption in transit and at rest | Network / Database | TC-Sec-01 | No | Partly built: transport guards | In transit: automated tests. At rest: not verified, no provider evidence | DEV-12. |
| SEBM-NF-004 | WCAG 2.1 AA | Client | TC-UX-01 | No | Partly built: contrast and focus fixes | Not verified: no full audit | DEV-12. |
| SEBM-NF-005 | Scalability (10,000 users) | Backend / Infrastructure | TC-Scale-01 | No | Not built or measured | Not verified: no load test | DEV-06. |
| SEBM-SR-001 | TLS 1.2+ enforcement | Network | TC-Sec-02 | Yes | Built | Automated tests on main (TLS config, HTTPS enforcer, security headers) | Production boot guard added in S2-14. |
| SEBM-SR-002 | Salted password hashing | Auth | TC-Sec-03 | No | Built | Automated tests on main (registration hashing tests) |  |
| SEBM-SR-003 | Data-at-rest encryption | Database | TC-Sec-04 | No | Not built | Not verified | No linked-account identifier field exists; storage encryption needs provider evidence (DEV-12). |
| SEBM-SR-004 | Session timeout | Auth | TC-Sec-05 | No | Built | Automated tests on main; real-browser idle logout not recorded | S2-02, #66. |
| SEBM-SR-005 | RBAC for admin functions | Auth / Admin | TC-Sec-06 | Yes | Built | Automated tests on main (unit, integration, independent) | Middleware is in `backend/src/middleware/rbac.js` (DEV-02). |

Related: `docs/DEVIATIONS.md` (DEV-01 to DEV-14), `docs/NFR_VERIFICATION.md`.
