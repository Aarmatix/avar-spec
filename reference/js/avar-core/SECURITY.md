# Security policy

`@aarmos/avar-core` is a proof primitive. A verifier bug that accepts
a forged bundle, or rejects a valid one, is a security bug and we
treat it accordingly.

## Reporting

Do not open a public GitHub issue for security-sensitive reports.

Email **security@aarmos.io** with:

- A description of the issue and its impact on verifier correctness or
  signature/chain integrity.
- A minimal `.avar.zip` or JSON fixture that reproduces it, if you
  have one.
- The verifier version (`@aarmos/avar-core` version) and runtime
  (Node version / browser).

We acknowledge reports within 3 business days. Coordinated disclosure
timelines depend on severity; expect 30–90 days for a fix + advisory
before public disclosure.

## Scope

**In scope:**

- Verifier accepts a bundle whose Ed25519 signatures don't validate.
- Verifier accepts a bundle whose hash chain is broken.
- Verifier accepts a bundle whose canonical form differs from the
  spec's canonicalization rules.
- Verifier rejects a bundle that is valid under the spec.
- Any code path that could allow the verifier to be tricked into
  reporting a warning as a pass, or a pass as a warning.

**Out of scope:**

- Runtime performance issues that aren't a correctness bug.
- Issues in the Aarmos application (report those to the main Aarmos
  security contact).
- Issues in third-party AVAR implementations we don't maintain.

## Supported versions

Latest published `1.x` line receives security fixes. Older majors are
supported for 6 months after a new major ships.
