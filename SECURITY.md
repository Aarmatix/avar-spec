# Security Policy

## Supported versions

The AVAR spec and the reference implementations under `reference/` are
covered. Only the latest tagged release and the current `main` receive
security fixes.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports.

Email **security@aarmatix.com** with:

- A description of the issue and its impact
- Steps to reproduce (a minimal fixture or receipt is ideal)
- Any suggested remediation

We acknowledge new reports within **3 business days** and aim to ship a
fix or mitigation within **30 days** for confirmed vulnerabilities.

## Scope

**In scope**
- Verifier bypasses in `reference/js/avar-core` or `reference/js/avar-verify-wasm`
  (e.g. a receipt that reports `valid` when the spec says otherwise)
- Ambiguities in the spec that permit two conformant verifiers to disagree
  on the validity of the same receipt
- Denial-of-service in the verifier against small, well-formed inputs

**Out of scope**
- The Aarmos runtime, policy gate, UI, or fleet plane (separate product, not in this repo)
- Cryptographic primitives themselves (Ed25519, SHA-256) — report to the
  primitive's maintainers
- Test fixtures used only for parity testing

## Coordinated disclosure

We follow standard coordinated disclosure. We will credit reporters in the
release notes unless anonymity is requested. Please give us the response
window above before public disclosure.
