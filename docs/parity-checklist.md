# VS Code Baseline Parity Checklist

This checklist freezes extension-era behavior that Electron/library hosts must match before VS Code adapter removal.

## Agent Lifecycle

- [ ] Spawn creates one runtime agent + one terminal session
- [ ] Focus agent selects terminal tab and keeps council-room selection in sync
- [ ] Close agent terminates terminal and removes runtime/entity state
- [ ] Subagents map to parent member/tool relationship

## Transcript and Status

- [ ] Transcript lines are discovered from `.claude/projects/<hash or legacy-dir>/*.jsonl`
- [ ] Tool transitions update status bubbles (`thinking`, `reviewing`, `synthesizing`, `waiting`, `error`, `done`)
- [ ] Waiting/permission cues are rendered and cleared correctly
- [ ] Reconnect or host restarts do not duplicate member states

## Layout and Persistence

- [ ] Layout read/write roundtrip works across app restart
- [ ] Agent seating persistence survives restart and reconnect
- [ ] Multi-workspace path hashing/discovery maps events to the correct room/session

## Council Protocol

- [ ] `run` flow emits complete 3-stage event cycle
- [ ] `cancel` interrupts active run and emits terminal failure event
- [ ] `runId` is preserved across all run-scoped events
- [ ] `sequence` is monotonic and out-of-order events are ignored by bridge

## Quality Gates

- [ ] `npm run ci` green in this repo
- [ ] websocket protocol tests green in `hackai26-pre-code`
- [ ] manual 5-member scenario demo completes with animated state transitions

Removal gate for `src/` legacy adapter: all items above checked and signed off.
