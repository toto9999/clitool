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
- Guest GenNX exe resolution (env, `guest_gennx_exe`, uia-macros target): `batcli vm gennx resolve-config` — see `doc/3. Platform/vm-gennx-guest-exe-resolution.yaml`.
- Hyper-V VM: `batcli vm hyperv list` / `batcli vm hyperv start [vm-name]` / `batcli vm hyperv connect [vm-name]` (default vm: `CLIBASE_VM_HYPERV_NAME` or `GenNX-VM`).
- Launch GenNX from the dd Desktop build folder on the **host**: `batcli vm gennx launch` (override: `--folder`, `CLIBASE_GENNX_LAUNCH_FOLDER`, or `CLIBASE_GENNX_EXE`).
- Run GenNX **on the Hyper-V guest VM**: `batcli vm gennx run --vm_profile_key vm-gennx-lab` (alias: `launch-guest`). **Default** runs GenNX via a one-shot scheduled task as the profile user (same account as vmconnect/RDP for a visible session). `--direct` uses Start-Process in PowerShell Direct only (often no visible UI). Optional `--exe-path`; profile `guest_gennx_exe` / `guest_gennx_launch_exe`; `scripts/vm-gennx-launch-guest.mjs`.
- Guest **desktop screenshot to the host** (CLI, interactive session): `batcli vm gennx capture-guest --vm_profile_key vm-gennx-lab` (scheduled task as profile user; that user must be logged on with a visible desktop; output under `.clibase/artifacts/vm-gennx-capture-guest` — `scripts/vm-gennx-capture-guest.mjs`).
- Guest GenNX FlaUI runtime check (not `batcli verify`): from the **Hyper-V host**, `batcli vm gennx verify-guest --vm_profile_key vm-gennx-lab` (uses `workspace/vm-profiles.yaml` guest_local_*; lab defaults `dd`/`dddd` and UAC re-launch if needed — see `scripts/vm-gennx-verify-guest.mjs`). One machine: `batcli uia gennx verify` — `doc/3. Platform/23-verification-and-release-gates.yaml` (`gennx_guest_runtime`).

## 5) Minimum Verification Gates

1. `batcli docs validate`
2. `batcli typecheck`
3. `batcli build`
4. `batcli smoke runtime` (or scoped runtime checks when environment limits smoke)
5. targeted scenario checks via `batcli action run ...`

GEN (GenNX) or other guest EXE behavior is **not** proven by `batcli verify` alone. That command matches the **repo_static** tier in `doc/3. Platform/23-verification-and-release-gates.yaml`. Claims of VM, interactive screen, and GenNX actually running require the **gennx_guest_runtime** tier (target launch, macro or FlaUI steps against a live PID, or the project UIA smoke scripts on the guest). See the same document for definitions.

## 6) Non-Negotiables

- Docs-first changes for architecture, contracts, and vocabulary.
- Short readable aliases for keys/refs; no UUID-style opaque identifiers.
- Structured logs for actions/events/audits with replay and traceability.
- UI changes under guarded paths require concurrent governance-doc updates.

