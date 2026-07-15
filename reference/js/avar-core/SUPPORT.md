# Support

`@aarmos/avar-core` is maintained by Aarmatix LLC as the reference
verifier for the AVAR specification.

## What's in scope

- **Correctness bugs in the verifier** — if `verifyBundle()` reports
  a valid bundle as invalid, or an invalid bundle as valid, that's a
  bug. Open an issue with the minimal `.avar.zip` that reproduces it.
- **Spec conformance questions** — if the code disagrees with
  [`docs/avar/SPEC.md`](https://www.aarmos.io/docs/avar-spec), one of
  them is wrong. Tell us which.
- **Portability issues** — the package targets Node 20+ and modern
  browsers via WebCrypto. Reports for supported runtimes are in scope.

## What's out of scope

- **Feature requests that change the spec** — go through the RFC
  process in [GOVERNANCE.md](./GOVERNANCE.md).
- **Integration help for building on top of the verifier** — general
  usage questions are better on GitHub Discussions or Stack Overflow
  than the issue tracker.
- **SLAs of any kind.** This is open-source software provided as-is
  under Apache-2.0. Commercial support for fleet-scale verification
  and compliance evidence generation ships as part of the Aarmos
  Enterprise tier — see [aarmos.io/for-teams](https://www.aarmos.io/for-teams).

## Security issues

See [SECURITY.md](./SECURITY.md). Do not open a public issue for a
security-sensitive report.
