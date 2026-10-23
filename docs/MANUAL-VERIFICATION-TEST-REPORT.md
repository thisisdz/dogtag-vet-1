# DogTag Manual Verification - Test Report

2026-10-23 · Shareable copy: https://claude.ai/artifact/AJZeP3oRyUHXuTkNffrosF

All 10 test runs passed: 47 of 47 steps. One medium-severity gap turned up while writing the report: the owner's claim email waits until someone reopens the request page. Runs used a local test database with the on-chain signing step simulated; live signing, real email delivery and the mobile app hand-off still need a live check.

## Results at a glance

| Run | Scenario | Steps passed | Result | Time (ms) |
| --- | --- | --- | --- | --- |
| 1 | Happy path - photo (PNG) certificate | 12 / 12 | Pass | 484 |
| 2 | Happy path - PDF certificate | 12 / 12 | Pass | 253 |
| 3 | Reject with a reason | 4 / 4 | Pass | 49 |
| 4 | Reject with 'other' needs a note | 2 / 2 | Pass | 37 |
| 5 | Pet without a DogTag | 1 / 1 | Pass | 17 |
| 6 | Bad documents and the storage quota | 5 / 5 | Pass | 99 |
| 7 | Expired claim link, then re-send | 3 / 3 | Pass | 353 |
| 8 | Record revoked after issue | 1 / 1 | Pass | 174 |
| 9 | Racing syncs and a failed issuance | 2 / 2 | Pass | 357 |
| 10 | Access control and safe links | 5 / 5 | Pass | 177 |
| **Total** | | **47 / 47** | **10 / 10** | **2,000** |

The claim email in runs 1 and 2 went to the owner with the subject "Biscuit's vaccination record is verified", a button linking to `/claim/<32-character code>` and the QR code embedded inline.

## How it was tested

Each run drove the app's real staff routes, services, data models and a real MongoDB 7.0 database started fresh for the test. Stood in for: signing in (a reviewer or plain staff session), signing on chain in MetaMask (the record is marked active, which is what the app's confirm step does once the chain agrees), and sending email (captured, not sent). The document storage limit was lowered to 1 MB for run 6 (live: 250 MB).

- **Build:** `feature/manual-verification` at commit `e657fb0`; runs in `tests/unit/manualVerification/testRuns.integration.test.ts`.
- **Machine:** Windows 11, Node 24.19.0, run 2026-10-23.
- **First pass:** runs 1 and 2 failed one step each because the test expected the last history entry to be "claim_redeemed"; the app calls it "claimed". A test mistake, corrected; then all 10 passed.

## Findings

| # | Severity | Observation | Suggested fix |
| --- | --- | --- | --- |
| 1 | Low | A file over 5 MB is refused with the generic `invalid_input` code (HTTP 400), unlike the other document problems, which have their own codes. | Return `document_too_large` with HTTP 413. |
| 2 | Low | When document storage fills, new requests get `storage_full` (HTTP 503) but nothing tells the reviewer. | Show storage use in Settings; warn at about 80%. |
| 3 | Medium | A request moves to Issued, and the claim email goes out, only when someone opens that request's page; neither the background worker nor the record's confirmation does it. | Have the background worker sync approved requests every minute, or sync right after the record confirms. |

Confirmed as designed: records never claim a treating vet; claim codes are stored only as a fingerprint; opening a claim link or page changes nothing; plain staff and signed-out visitors are refused; racing syncs send one email; a failed issuance goes to "needs attention" and recovers; expired, replaced and revoked links are refused.

## Not covered yet

- [ ] Signing in MetaMask on verify.dogtagapp.com (one record was issued and imported on 2026-10-22).
- [ ] Real email delivery to Gmail and Outlook inboxes; needs the dogtagapp.com DKIM record.
- [ ] The DogTag app opening `/claim` links (Ken).
- [ ] Owner-submitted requests from the app (signed API and "Get my DogTag" not built yet).
- [ ] Leaving the page right after signing: does the owner's email still go out (finding 3)?

## Step log

"claim_email_not_sent" appears because email was captured instead of sent.

| Run | Step | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| 1 | Reviewer files the owner's certificate | 201, status submitted, requester email normalised | 201, submitted, sam@example.com | Pass |
| 1 | Request appears in the 'Needs me' queue | exactly this request | 1 request in queue | Pass |
| 1 | Reviewer opens the document | 200, image/png, nosniff, no-store, identical bytes | 200, image/png, 2048 bytes identical | Pass |
| 1 | Start review | 200, status in_review | 200, in_review | Pass |
| 1 | Approve with the transcribed record | 200, status approved, record draft created | 200, approved, record 44e3e5fc… | Pass |
| 1 | Inspect the record draft | issuer = DogTag Manual Verification, no authorizedVet leaf, root recomputes | 16 leaves, no authorizedVet, root matches | Pass |
| 1 | Before the chain confirms, sync changes nothing | still approved, no email | approved, 0 emails | Pass |
| 1 | Chain confirms (simulated) and the request syncs | status issued, one claim email to the owner | issued, 1 email "Biscuit's vaccination record is verified" with button link and inline QR | Pass |
| 1 | Claim link stored only as a hash | sha256 stored, token never in the database | hash only | Pass |
| 1 | Owner's app redeems the claim link | 200, fresh 10-minute /e/ export, status claimed | 200, export ttl 600s, claimed | Pass |
| 1 | Audit trail | submitted → review → approved → on chain → claim issued → claimed | submitted → review_started → approved → record_confirmed_on_chain → claim_issued → claim_email_not_sent → claimed | Pass |
| 1 | Queue after the owner claimed | nothing left waiting on the reviewer | 0 requests | Pass |
| 2 | Reviewer files the owner's certificate | 201, status submitted, requester email normalised | 201, submitted, sam@example.com | Pass |
| 2 | Request appears in the 'Needs me' queue | exactly this request | 1 request in queue | Pass |
| 2 | Reviewer opens the document | 200, application/pdf, nosniff, no-store, identical bytes | 200, application/pdf, 64 bytes identical | Pass |
| 2 | Start review | 200, status in_review | 200, in_review | Pass |
| 2 | Approve with the transcribed record | 200, status approved, record draft created | 200, approved, record 25418c3b… | Pass |
| 2 | Inspect the record draft | issuer = DogTag Manual Verification, no authorizedVet leaf, root recomputes | 16 leaves, no authorizedVet, root matches | Pass |
| 2 | Before the chain confirms, sync changes nothing | still approved, no email | approved, 0 emails | Pass |
| 2 | Chain confirms (simulated) and the request syncs | status issued, one claim email to the owner | issued, 1 email "Biscuit's vaccination record is verified" with button link and inline QR | Pass |
| 2 | Claim link stored only as a hash | sha256 stored, token never in the database | hash only | Pass |
| 2 | Owner's app redeems the claim link | 200, fresh 10-minute /e/ export, status claimed | 200, export ttl 600s, claimed | Pass |
| 2 | Audit trail | submitted → review → approved → on chain → claim issued → claimed | submitted → review_started → approved → record_confirmed_on_chain → claim_issued → claim_email_not_sent → claimed | Pass |
| 2 | Queue after the owner claimed | nothing left waiting on the reviewer | 0 requests | Pass |
| 3 | Start review | 200, in_review | 200, in_review | Pass |
| 3 | Reject: document illegible | 200, rejected, reason saved | 200, rejected, document_illegible | Pass |
| 3 | Try to approve the rejected request | 409, no record created | 409, 0 records | Pass |
| 3 | Queue | rejected request no longer waiting | 0 requests | Pass |
| 4 | Reject 'other' without a note | 400, still submitted | 400, submitted | Pass |
| 4 | Reject 'other' with a note | 200, rejected, note saved for the owner | 200, rejected with note | Pass |
| 5 | File a certificate for an untagged pet | 422 tag_required, nothing stored | 422 tag_required, 0 documents, 0 requests | Pass |
| 6 | HTML disguised as a PDF | 422 document_unsupported_type, nothing stored | 422 document_unsupported_type | Pass |
| 6 | PNG bytes declared as a PDF | 422 type mismatch | 422 document_type_mismatch | Pass |
| 6 | A 5.5 MB upload | refused (over 5 MB), nothing stored | 400, 0 documents | Pass |
| 6 | Fill the (test) 1 MB quota | first 600 KB file accepted, second refused 503 storage_full | 201 then 503 storage_full, 1 document kept | Pass |
| 6 | Nothing left half-saved | requests and documents line up 1:1 | 1 request, 1 document | Pass |
| 7 | Link passes its expiry date | redeem 410 claim_expired; claim page sees the expiry | 410 claim_expired | Pass |
| 7 | Reviewer sends a new link | 200, new link differs from the old one | 200, new link issued | Pass |
| 7 | Old link vs new link | old 404, new 200 and claimed | old 404, new 200, claimed | Pass |
| 8 | Record is revoked before the owner claims | redeem 409 not_ready, request stays issued | 409 not_ready, issued, 0 export sessions | Pass |
| 9 | Two syncs race after the chain confirms | exactly one claim email | 3 concurrent syncs → 1 email | Pass |
| 9 | Issuance fails verification on chain | status needs_attention with an explanation | needs_attention (back in queue) → retry → issued, 1 email | Pass |
| 10 | Plain staff account | 403 on queue, filing, review and approve | statuses 403, 403, 403, 403, 403 | Pass |
| 10 | Signed-out visitor | 401 on the queue | 401 | Pass |
| 10 | Redeem only answers POST | no GET handler (an email scanner opening the link changes nothing) | POST only | Pass |
| 10 | Opening the claim page reads without redeeming | lookup leaves redeemCount at 0 and status issued | redeemCount 0, issued | Pass |
| 10 | Unknown and malformed tokens | 404 for both | statuses 404, 404 | Pass |

## How to re-run

With MongoDB 7.0's `bin` folder on the PATH:

```bash
MV_RUN_REPORT=test-results/mv-runs.json npx vitest run tests/unit/manualVerification/testRuns.integration.test.ts
```
