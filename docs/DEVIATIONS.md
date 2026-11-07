# Deviations from the submitted documents

Documents referred to: SRS v4.0, Test Plan v1.1, SAD v1.1. The submitted documents are not edited again; every difference between them and what is built is recorded here and explained at the final demo. Only the Scrum Master (Dev A) edits this file. Team members report a deviation by commenting on their issue with the `deviation` label and stating it in their PR description.

Status: **Confirmed** = decided and in effect. **Dropped** = expected earlier but did not happen, so it is no longer a deviation. Final review for S2-15 (issue #40) done on 07-11-2026 against `main` at 3f029ee, using SRS v4.0, SAD v1.1, Test Plan v1.1 and SPRINT_PLAN.md. No Candidate rows are left open.

| ID | Date | What differs | Document and section | Reason | Impact | Status |
|---|---|---|---|---|---|---|
| DEV-01 | 15-10-2026 | Receipt photo attach/view (SEBM-F-012, story S2-12) is built by Dev D and independently verified by Dev C. The documents list F-012 under the Transactions module (developed by Dev A, tested by Dev D). | SRS roles table; Test Plan Section 9 | Dev D owns storage and infrastructure work; the rule "whoever built it cannot test it" means Dev C verifies it. | None on behaviour. Test ownership for F-012 differs from the table. | Confirmed |
| DEV-02 | 15-10-2026 | RBAC (SEBM-SR-005, story S2-03) is a middleware in `backend/src/middleware/rbac.js` built by Dev D and applied to the admin router by Dev B. The SAD places RBAC in the Auth Service. | SAD Sections 3.4 and 3.8 | Dev D owns security configuration; keeps module ownership clean. | None on behaviour; the component that hosts the check differs. | Confirmed |
| DEV-03 | 15-10-2026 | Web client only; no React Native mobile app. | SAD Sections 3.4, 3.6; SRS Section 2 | One-week sprints; a web client (React, `frontend/`) is enough to demonstrate every flow. No mobile code exists in the repository. | Mobile-specific behaviour (camera, push) not demonstrated. | Confirmed |
| DEV-04 | 15-10-2026 | Notification provider is mocked/in-app instead of real push, email or SMS. | SAD Sections 3.4, 3.6; SRS 4.6 | No provider accounts or credentials within the sprint timeline. | Alerts, bill reminders and the password reset link are sent through `MockNotificationProvider` (in-app notification records), not by email or push. Real providers are not wired. | Confirmed |
| DEV-05 | 15-10-2026 | Receipt images are stored in the database (`receipts.image_url`, as a data URL or URL after validation) instead of AWS S3 / Firebase Storage. | SAD Section 3.6 | No cloud account needed for the demo. | Not production storage. | Confirmed |
| DEV-06 | 15-10-2026 | SEBM-NF-002 (99.5% availability) and SEBM-NF-005 (10,000 concurrent users) are documented with their design basis, not measured. | SRS Section 5 | Cannot be genuinely verified in a one-week student project. | Marked "documented, not load-verified" in the RTM. See `docs/NFR_VERIFICATION.md` and DEV-12. | Confirmed |
| DEV-07 | 15-10-2026 | Email/OTP verification after registration (shown in SAD sequence diagram 3) is not implemented unless time remains. | SAD Section 4.2 | Not required by SEBM-F-001 acceptance criteria; password reset (F-003) covers the OTP path. | Registered accounts are active immediately. Password reset (F-003) is by a time-limited link only, not an OTP. | Confirmed |
| DEV-08 | 15-10-2026 | Stretch stories SEBM-F-042 (period comparison) and SEBM-F-051 (bill reminders) were planned as stretch and might not be completed. | SRS 4.5, 4.6 | Both are Low priority; scheduled only after core work. | No impact: both were built. F-042 comparison is in `backend/src/reports/` (S2-11, merged with #77) and F-051 bill reminders are in `backend/src/reminders/` (S2-13, issue #38 closed). RTM status can be set to done. | Dropped |
| DEV-09 | 17-10-2026 | Defects are tracked as GitHub Issues labelled `bug` (assigned to the story owner), and tracked on the GitHub Project board, instead of Jira. | Test Plan Section 6 (Tools) | The course brief does not require Jira; the team already uses GitHub Issues and Projects for the backlog, so defects stay next to the stories and PRs they relate to. | None on behaviour. Defect aging and defect density (Test Plan Section 14) are taken from issue dates and labels. | Confirmed |
| DEV-10 | 17-10-2026 | Testing follows the sprint calendar, not the Test Plan milestone dates. Sprint 1 is 19-23 Oct and Sprint 2 is 26-30 Oct; each story is independently verified after it merges, with full regression on Thu 29 Oct. The Test Plan lists test case design on 15 Sep, execution 18-30 Sep and UAT 1-3 Oct. | Test Plan Section 7 | The milestone dates were set before the sprint schedule was fixed and no longer match the project timeline. | None on scope or approach; only the dates differ. | Confirmed |
| DEV-11 | 30-10-2026 | `users.password_reset_token_hash` is added through a new additive migration instead of changing the already-applied `202610221200_core_create_tables.sql` schema. | Database migration history | On existing deployed databases the original table definition must remain intact; new columns are added in a later migration to preserve upgrade compatibility. | Existing databases need the new column applied through a migration rather than a schema rewrite on a live table. | Confirmed |
| DEV-12 | 07-11-2026 | NFR and security evidence is incomplete. SEBM-NF-001 has a benchmark script but no run against staging; SEBM-NF-003 has transport guards but no provider evidence for encryption at rest; SEBM-SR-003 (AES-256 for stored sensitive data) is not implemented because the schema has no linked-account identifier field; SEBM-NF-004 has contrast and focus fixes but no full WCAG 2.1 AA audit. | SRS Section 5 (NF-001, NF-003, NF-004, SR-003); Test Plan Sections 3 and 5.1 (TC-Perf-01, TC-Sec-01/04, TC-UX-01) | One-week sprints, no deployed environment or cloud account. Detail is in `docs/NFR_VERIFICATION.md` (S2-14, issue #39). | These requirements cannot be shown as passed. RTM status stays "documented, not verified" until evidence exists. Any future linked-account field needs field-level encryption designed first. | Confirmed |
| DEV-13 | 07-11-2026 | The Test Plan names Selenium/Appium, JMeter, OWASP ZAP and axe/WAVE as tools. Automated testing uses Jest and Supertest (backend unit, integration, independent and known-defect suites) and Vitest (frontend), run by GitHub Actions CI. Performance uses a custom script (`backend/scripts/nfr/performance-smoke.js`). The repository contains no ZAP or JMeter output. | Test Plan Section 6 (Tools), Section 5.1 | The team already had Jest, Supertest and CI from the harness story (D-07), and a one-week sprint left no time to set up more tools. | Fuzzing and penetration testing listed in Test Plan Section 5.1 are not evidenced. Browser UI automation is limited to the Vitest component tests. | Confirmed |
| DEV-14 | 07-11-2026 | SAD Section 2.2 refers to Test Plan v1.0, but the current Test Plan is v1.1. The three documents and SPRINT_PLAN.md otherwise agree on module ownership and the cross-testing rotation. | SAD Section 2.2 | Test Plan was bumped to v1.1 on 11-10-2026 and the SAD reference was not updated. | Wording only. | Confirmed |

## Plan notes (not document deviations)

- **Dev D workload** is high in the dry run and Sprint 2. No file changes needed. Agreed triggers: if D-03 is not merged by Monday 19 Oct at noon, move D-04 (CI) to Dev C; if S2-14 has not started by Wednesday 28 Oct, move S2-16 (video, tag, freeze) to Dev B.
- Any story not verified by the sprint cut-off is listed here as "not verified".

## Not verified at the Sprint 2 cut-off

These are not shown as passed. See `docs/NFR_VERIFICATION.md` for the first five.

- SEBM-NF-001: response-time benchmark not yet run against staging.
- SEBM-NF-002: 99.5% availability, no 30-day monitoring data.
- SEBM-NF-003 and SEBM-SR-003: encryption at rest, no provider evidence.
- SEBM-NF-004: full WCAG 2.1 AA audit not done.
- SEBM-NF-005: no 10,000-user load test.
- SEBM-SR-004: automatic session logout is covered by automated tests; a real-browser idle-timeout check is not recorded.
- Test Plan Section 5.1 fuzzing and penetration testing: no evidence in the repository (see DEV-13).
- Defects in `backend/tests/known-defects/` are tracked there and are not fixed by this change.
- UAT with the Course Coordinator: not recorded.

## Requirement traceability matrix

The RTM lives in SRS v4.0 Section 8 (and is mirrored in Test Plan Section 13). Per the rule above the documents are not edited; RTM statuses should be read together with this file.
