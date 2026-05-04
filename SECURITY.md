# Security Policy

## Supported Versions

Security fixes are applied to the latest published minor line.

## Reporting a Vulnerability

Please do not open a public issue for suspected vulnerabilities.

Report privately by opening a GitHub security advisory for this repository:

- https://github.com/Constannnnnt/Anya/security/advisories/new

Include:

- affected package and version
- impact and attack scenario
- reproduction steps or proof of concept

## Secure-by-Default Expectations

- URL-bearing primitives must sanitize untrusted input.
- Runtime parsing paths must avoid leaking sensitive payloads to logs.
- New dependencies require review for maintenance status and attack surface.
