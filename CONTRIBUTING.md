# Contributing

Thanks for looking at AVAR. This repo covers two things:

1. The **AVAR spec** under [`spec/`](./spec/) — the normative on-wire and
   verification rules.
2. **Reference implementations** under [`reference/`](./reference/) —
   Apache-2.0 code that conforms to the spec.

## What we welcome

- Bug reports and fixes in the reference implementations
- Interoperability findings (a real-world receipt that a conformant
  verifier mishandles)
- Spec clarifications where two verifiers could reasonably disagree
- Documentation and examples

## What is out of scope

- **The Aarmos runtime, policy gate, UI, or fleet plane.** Those live in
  a separate closed product and are not accepted here. PRs touching those
  concepts will be closed with a pointer to this file.
- **New verifier features** without a spec change. Start with a spec PR
  or discussion first; the reference code follows the spec, not the
  other way around.
- **Breaking changes to fixture wire format.** Fixtures are frozen; new
  fixtures are additive.

## Process

1. For anything larger than a typo, open an issue first to align on
   scope. This saves both of us time.
2. Fork, branch, and open a PR against `main`.
3. Sign your commits (`git commit -s`) — required for the CLA on any
   non-trivial change.
4. Run the test suite in `reference/js/avar-core` before submitting.

## Security

Do **not** file security reports as public issues. See
[`SECURITY.md`](./SECURITY.md).
