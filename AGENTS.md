# AGENTS.md

This is the short, agent-first entry map for this repository.

Detailed harness policy lives in:
- `doc/0. Governance/agent-governance.md`

Compatibility note:
- Some tools read `AGENT.md` (singular). This repo keeps both `AGENTS.md` and `AGENT.md` aligned.

## 1) Primary Goal

- Build a CLI-first automation workbench.
- Keep GUI, CLI, AI, Skill, and MCP controls on one action contract.
- Keep architecture and rules legible for both people and agents.

## 2) Read Order (before coding)

1. `doc/0. Governance/ssot.yaml`
2. `doc/0. Governance/ddd.md`
3. `doc/0. Governance/workflow-rules.md`
4. `doc/0. Governance/agent-governance.md`
5. `doc/3. Platform/17-central-architecture.md`
6. `doc/3. Platform/23-verification-and-release-gates.yaml`
7. `doc/9. Worklog/99-worklog.md`

## 3) Mandatory Workflow

1. `batcli workflow start "<note>"`
2. `batcli workflow to-doc`
3. Update impacted docs
4. `batcli workflow to-code`
5. Implement code
6. Run verification gates
7. `batcli docs touch "<what changed>"`
8. `batcli workflow stop`

## 4) Command Contract

- Operator and agent entrypoint is `batcli`.
- Do not create hidden control paths that bypass `batcli` + runtime actions.
- Raw package manager commands are implementation detail, not primary operator contract.
- On Windows, `batcli install` provisions the UIA macro executor venv at `.clibase/python/uia-executor` (omit with `--no-uia-executor`). Use `batcli uia-executor install` to install or refresh that venv only.

## 5) Minimum Verification Gates

1. `batcli docs validate`
2. `batcli typecheck`
3. `batcli build`
4. `batcli smoke runtime` (or scoped runtime checks when environment limits smoke)
5. targeted scenario checks via `batcli action run ...`

## 6) Non-Negotiables

- Docs-first changes for architecture, contracts, and vocabulary.
- Short readable aliases for keys/refs; no UUID-style opaque identifiers.
- Structured logs for actions/events/audits with replay and traceability.
- UI changes under guarded paths require concurrent governance-doc updates.

