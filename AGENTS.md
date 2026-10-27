# EcDys working rules

- Treat [the Design Doctrine](docs/DESIGN-DOCTRINE.md) as the governing product/design policy. Its five-question test applies to behaviour, claims and copy as well as appearance.
- The doctrine supersedes historical mandatory-account, core paywall and decorative UI assumptions. Keep historical plans labelled as historical; do not infer feature delivery from their checkboxes.
- Preserve the Electron/Solid application and encrypted workspace compatibility. The React package under `design/reference/doctrine` is a reference prototype with different capabilities and retention; it is not the application runtime.
- Derive values from observed state. Distinguish unknown, loading, failed, stale and measured zero. Preserve profile/snapshot ownership across asynchronous work and workspace locking.
- State local/remote, encrypted/plaintext and renderer/host boundaries at the affected action. Outbound provider requests and plaintext exports need specific disclosures; consent starts unselected.
- Give cheap changes Undo. Name the target and consequences of destructive operations and initially focus the safe action. Recovery journals are interruption recovery, not operator Undo or secure erasure.
- Keep core operation independent of accounts and optional premium services. Physical key segregation, provider route isolation and other unimplemented capabilities must remain explicitly unimplemented.
- Verify changed behaviours with meaningful checks. Keep preview/model checks distinct from actual Electron/provider/OS acceptance. Do not bypass blocked routing to make a demonstration work.
- Remote publishing requires explicit user authorization. A source-checkpoint push does not authorize merging, force-pushing, releasing, deploying or replacing another workstream's changes.
