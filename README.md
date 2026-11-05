# MRI research infrastructure: synthetic demonstration

This is an infrastructure demonstration, not an MRI analysis engine. It cannot interpret patient MRI, find lesions, produce a medical diagnosis or demonstrate clinical accuracy. Medical-analysis coverage is always zero.

Only generated abstract geometric fixtures are included. No patient scans, public human-subject sample, model weights, personal records, notebook outputs, credentials, or private research documents are included. Unknown files are rejected by the bundled allowlist. Inputs and manual illustrative notes remain in browser memory; JSON export is local. No inference API, storage backend or telemetry is configured.

The intended future product is a physician-facing MRI second-review assistant; this demo does not satisfy that capability. Do not upload patient information or deploy it as clinical software.

## Run
Serve this directory as static files over HTTP(S). No dependency installation or build step is required. Run technical parser checks with `node --test test_intake.mjs`. These checks are not clinical validation.

## Deployment boundary
GitHub repository and Vercel destination are not yet created or verified. Deployment must use only this explicitly allowlisted bundle. Do not publish the parent workspace. New repository visibility and any new persistent service access must be handled separately. Existing project history is preserved outside this bundle.
