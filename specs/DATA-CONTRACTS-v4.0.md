# ecdys — Data and Interface Contracts v4.0

**Authority:** [Replacement blueprint](../BLUEPRINT-v4.0.md). These are normative design contracts for future implementation, not migrations executed against a running application.

## 1. Conventions

- IDs are UUID strings except codes, hashes, provider references, and integer database sequences.
- Time fields use integer UTC milliseconds. Monotonic elapsed time governs local rate windows/deadlines; service time governs shared leases.
- Local SQLCipher fields use TEXT/INTEGER/BLOB; PostgreSQL service equivalents use UUID/TEXT/BIGINT/JSONB/BYTEA as appropriate. JSON has an explicit schemaVersion.
- A question mark means nullable/optional. All other fields are required unless a default is stated.
- Monetary values are decimal integer strings in JSON and integer/decimal exact types in service storage. Never use binary floating point for money or atomic units.
- Secrets and operational objects have authenticated encryption envelopes. Hex/base64 encoding is serialization, not encryption.
- Foreign keys and uniqueness constraints are enforced transactionally. All external input is size bounded and schema validated before persistence.
- Profile names and URLs are not treated as public metadata simply because they are strings.

## 2. Local vault entity inventory

| Entity | Fields and relationships |
| --- | --- |
| Workspace | id PK, schemaVersion, name, createdAt, vaultHeaderRef, protectedStorageAdapter, storageStatus, settingsDocument. |
| LocalIdentity | id PK, workspaceId FK, accountId?, deviceId, accountType local/random_id/email, identifier?, accountBinding?, createdAt, lastUnlockedAt?, publicSigningKey, publicEncryptionKey, privateKeyEnvelopeRef. No commercial signing secret or remote account password hash. |
| Profile | id PK, workspaceId FK, ownerIdentityId FK, scope private/shared, teamId?, sharedObjectId?, name, folderId?, parentProfileId?, branchName?, recipeId?, recipeVersion?, currentRevision, archivedAt?, createdAt, lastUsedAt?, dataDirRef, operatingPolicy, storageQuotaBytes default 524288000. |
| ProfileRevision | profileId FK + revision composite PK, schemaVersion, configDocument, configSHA256, createdAt, createdBy, sourceRevision?, operationId. Immutable once committed. |
| SecretEnvelope | id PK, workspaceId, kind, encryptionProvider, keyId, recipientFingerprint?, nonce?, ciphertextRef, authTag?, createdAt, rotatedAt?. Plaintext values never appear in ProfileRevision. |
| RouteEndpoint | id PK, workspaceId, kind vpn/socks5/http_connect, provider?, host, port?, endpointIdentity?, location?, loadObservation?, secretRef?, tlsToProxy?, createdAt, updatedAt. Distinguish VPN ingress from observed exit IP. |
| ProxyPool | id PK, workspaceId, name, selectionPolicy round_robin/manual, revision, createdAt, updatedAt. |
| ProxyPoolMember | poolId FK + endpointId FK composite PK, position, enabled, lastHealthAt?, healthState. Credentials remain endpoint secret references. |
| RouteBinding | id PK, profileId, configRevision, helperHandleRef?, endpointId, tunnelIdentity?, expectedPolicyHash, observedExitIP?, observedAt?, state, createdAt, stoppedAt?. Runtime handles may be omitted from durable records. |
| Snapshot | id PK, profileId FK, sourceProfileId, sourceRevision, trigger, capturedAt, scope config/session, consistency closed/verified_live/config_only, objectId FK, browserReleaseId, manifestHash, compressedBytes, encryptedBytes, pinned default false, recoveryReleaseId?, state pending/committed/failed, operationId. |
| EncryptedObject | id PK, workspaceId FK, formatVersion, relativePath, ciphertextSHA256, encryptedBytes, encryptionHeader, createdAt, committedAt?, state staging/committed/orphaned. Object references determine retention. |
| ObjectKeyEnvelope | objectId FK + recipientKeyId composite PK, wrappingAlgorithm, wrappingNonce, wrappedKey, wrappingTag, authenticatedContext. No raw data key column. |
| ObjectReference | objectId FK + ownerType + ownerId composite PK, purpose, createdAt. A branch can retain an immutable object without making its parent's retention authoritative. |
| Session | id PK, profileId FK, launchedBy, configRevision, browserReleaseId, processIdentity?, routeBindingId?, state, operatingPolicy, disposableParentId?, expiresAt?, createdAt, activatedAt?, lastInteractionAt?, stoppedAt?, lastRAMBytes?, lastCPUPercent?, gatewayPort?, tokenFingerprint?, teamLeaseId?, fence?. Raw Bearer tokens are ephemeral. |
| SnapshotObservation | id PK, sessionId FK, preLaunchSnapshotId FK, kind first_load, observedAt, result. Does not silently add an unsupported trigger. |
| RecorderSegment | id PK, profileId, firstEventAt, lastEventAt, objectId FK, recordCount, plaintextBytes, encryptedBytes, sealed, formatVersion. Events are authoritative in encrypted segments, not duplicated as an unbounded SQL log. |
| Folder | id PK, workspaceId, teamId?, parentFolderId?, name, color, position, revision. No ancestry cycles. |
| Tag | id PK, workspaceId, teamId?, name, colorPreset, revision. Unique normalized name per applicable workspace/scope. |
| ProfileTag | profileId FK + tagId FK composite PK. |
| SavedFilter | id PK, workspaceId, name, filterExpression, revision, createdAt. Expression uses bounded AND/OR AST, not executable SQL. |
| WorkspacePosition | workspaceId + profileId composite PK, x, y, layoutVersion. Sensitive positions/identity associations stay in the vault. |
| Recipe | id PK, workspaceId, createdBy, name, description?, category, currentVersion, createdAt, updatedAt. |
| RecipeVersion | recipeId FK + version composite PK, schemaVersion, templateDocument, createdAt, createdBy. Immutable; no session secrets. |
| ValidationRun | id PK, profileId, configRevision, configHash, browserReleaseId, routePolicyHash, startedAt, completedAt?, suiteSet, requiredPolicy, outcome, observationsDocument. Retain newest ten aggregate runs. No invented overall anonymity score. |
| InspectionRun | id PK, profileId, configRevision, endpointURL, runAt, configuredDocument, measuredDocument, changesDocument, status. Separate from third-party ValidationRun. |
| ComparisonTest | id PK, workspaceId, createdBy, name, URL, capturePolicy, expectedDifferences, createdAt, updatedAt. |
| ComparisonParticipant | testId FK + profileId FK composite PK, position. Participant count 2–5. |
| ComparisonRun | id PK, testId, startedAt, finishedAt?, resultDocument, artifactObjectRefs, browserReleaseIds. |
| ConnectionEdgeCache | workspaceId + profileA + profileB + type + resourceHash composite PK, resourceDescription, detectedAt, evidenceRevisionA, evidenceRevisionB. Canonical order profileA < profileB for undirected edges. Derived, not identity truth. |
| OperationJournal | id PK, kind, profileIds, state, expectedRevisions, stagedObjectRefs, recoveryDocument, actorId, startedAt, updatedAt, result?. File/database transitions are reconciled at startup. |
| BulkOperationItem | operationId FK + profileId FK composite PK, orderIndex, state pending/running/succeeded/failed/cancelled, checkpointId?, resultingRevision?, safeError?. |
| ReleaseSet | id PK, appVersion, electronVersion, browserVersion, driverVersion, helperVersion, schemaVersion, platform, architecture, signedManifestRef, verifiedAt, installPath, state. |
| UpdateCheckpoint | id PK, fromReleaseId, toReleaseId, databaseObjectRef, createdAt, status, operationId. |
| UpdateProfileCheckpoint | checkpointId FK + profileId FK composite PK, snapshotId FK, originalDataDirRef, compatibleRestoreRef. |
| EntitlementCache | entitlementId PK, accountId, licenseFamilyId, signedJWT, verifiedKeyId, verifiedAt, paidThrough?, graceEndsAt?, transferKnownAt?. JWT signature is not encryption; access restrictions still apply. |
| DeviceAuditOutbox | id PK, deviceId, localSequence, occurredAt, eventEnvelope, signature, submittedAt?, receiptSequence?. Bounded with explicit unsent warnings; never discard silently. |
| SyncCursor | teamId + deviceId composite PK, lastReceivedRevision, lastAuditReceipt, lastSyncAt, pendingOperations, conflictSummary. |

### 2.1 Local constraints

1. ProfileRevision, Snapshot, ObjectReference, RecipeVersion, and operation journals cannot reference another workspace unless an explicit import/share operation authorizes it.
2. Unique active writable Session per Profile, excluding stopped/crashed sessions and separate disposable child identities.
3. At most 99 saved retained profiles per workspace by default; the current entitlement also limits non-archived usable profiles. Branches count as saved. Disposables are temporary and count on promotion. Archive cannot create unlimited hidden retained profiles.
4. A complete snapshot requires committed object, valid envelope, manifest, and metadata. Pending rows never count as recovery evidence.
5. EncryptedObject paths are relative to a coordinator-owned root. Reject escaping paths and user-selected symlinks.
6. Secret deletion is denied while referenced; explicit credential removal records a broken binding rather than substituting direct access.
7. Shared immutable payload references are pruned only when no live references/recovery holds exist.
8. Folder movement, profile deletion, and branch deletion use journaled operations with deterministic reference handling.
9. Cache tables and materialized health summaries can be rebuilt; they are not a second authority for entitlement, revision, or authorization.
10. Team membership removal cannot be implemented as cascading deletion of all local private profiles owned by that account.

## 3. Self-hosted team service entity inventory

| Entity | Fields and constraints |
| --- | --- |
| Team | id PK, name, createdAt, settings, retentionDays default 90, catalogSeatAllowanceRef?. |
| TeamMember | teamId + memberId composite PK, accountBinding?, role Admin/Operator/Viewer, status active/revoked, joinedAt, revokedAt?. Account binding proves identity without sending browsing state to commerce. |
| TeamDevice | id PK, teamId, memberId, publicSigningKey, publicEncryptionKey, enrolledAt, revokedAt?, lastSeenAt. |
| InviteCode | inviteHash PK, teamId, generatedBy, targetRole Operator/Viewer, expiresAt, createdAt, revokedAt?, usedBy?, usedAt?. Hash is indexed; code generated from 62-character alphabet with rejection sampling. |
| ProfileGrant | teamId + sharedProfileId + memberId composite PK, permissions, revision, grantedBy, grantedAt, revokedAt?. Role is an upper bound; object grants restrict scope. |
| SharedProfile | id PK, teamId, currentRevision, createdBy, createdAt, archivedAt?. Human-readable content may remain encrypted. |
| SharedRevision | sharedProfileId + revision composite PK, encryptedObjectId, parentRevision?, submittedByDevice, fence, signature, receivedAt. Stale expected revisions fail. |
| TeamEncryptedObject | id PK, teamId, ciphertextHash, encryptedBytes, storageKey, formatVersion, uploaderDevice, uploadedAt. Object authorization precedes storage URL issuance. |
| RecipientKeyEnvelope | objectId + recipientDeviceId composite PK, senderDeviceId, algorithm, sealedEnvelope, keyEpoch, signature. |
| ExecutionLease | profileId PK, leaseId UNIQUE, teamId, ownerDeviceId, fence BIGINT, acquiredAt, expiresAt, renewedAt. Fence increases for each new ownership grant. |
| AuditEvent | teamId + serverSequence composite PK, eventId UNIQUE per team/device, deviceId?, reportedAt?, receivedAt, actorMemberId?, action, profileId?, sanitizedDetails, deviceSignature?, previousRecordHash, recordHash. Service rows append-only for ordinary application roles. |
| SyncReceipt | id PK, deviceId, operationId UNIQUE per device, resultingRevision?, serverSequence?, receivedAt, status. Used for idempotent retry. |

### 3.1 Collaboration invariants

- Invite consumption, membership/seat admission, and audit insertion are one transaction.
- Only current authorized device identities submit writes. Check grant, membership status, expected revision, and current fence at commit.
- Lease duration 120 seconds, renewal every 30 seconds. Desktop containment blocks by the conservative local lease deadline before the service can grant a new owner; renewals carry server time/expiry with clock-uncertainty allowance.
- Do not grant a new lease while the prior lease is unexpired. A partitioned client cannot renew by presenting its own wall clock.
- Shared profile execution requires a lease; offline private forks use new IDs and cannot later overwrite shared history silently.
- Ciphertext does not hide access patterns, object sizes, membership, or scheduling metadata from the self-hosted operator.
- A valid signature identifies a key, not its trustworthiness; enrollment/grant verification establishes authorized device trust.
- Revocation stops future access and future key envelopes. It cannot retract old copies.
- Audit timestamps and completeness from offline devices are qualified; server ordering is authoritative only for received records.

## 4. Commercial service entity inventory

| Entity | Fields and constraints |
| --- | --- |
| Account | id PK, accountType random_id/email, identifier UNIQUE, emailVerifiedAt?, createdAt, recoveryBindingRef?. No local vault passphrase or browser data. |
| AccountDeviceProof | accountId + deviceId composite PK, publicSigningKey, enrolledAt, revokedAt?, challengeReplayState. |
| ProductCatalog | version PK, effectiveAt, signedDocument. Includes profile tiers, billing terms, seat policy, API quotas, prices/currencies after owner reconciliation. |
| MoneroSubaddress | accountId PK/FK, walletId, accountIndex, addressIndex, address UNIQUE, createdAt. UNIQUE(walletId, accountIndex, addressIndex). |
| Invoice | id PK, accountId, catalogVersion, productSelection, billingType, currency, amountAtomic, quoteRef?, createdAt, expiresAt, status open/partial/paid/expired/reconciling, paidAt?. One open XMR invoice per address/account. |
| PaymentOutput | id UUID PK, walletId, transactionId, outputIndex, accountIndex, addressIndex, amountAtomic, observedHeight?, confirmations, state pool/confirmed/orphaned, observedAt. UNIQUE(walletId, transactionId, outputIndex). If a pinned RPC cannot identify outputs unambiguously, settlement is blocked pending a verified adapter. |
| PaymentAllocation | paymentOutputId FK to PaymentOutput.id + invoiceId FK composite PK, allocatedAtomic, createdAt. Total allocation across invoices cannot exceed a confirmed output amount. |
| ProviderPayment | provider + externalPaymentId composite PK, invoiceId, amountAtomic, currency, state, confirmedAt?. |
| Subscription | id PK, accountId, catalogVersion, tier, billingType monthly/annual, provider, externalId?, seatQuantity, paidThrough, nextInvoiceAt?, cancelAtPeriodEnd, cancelledAt?, status. One-time purchase uses an entitlement record, not a fake expiring subscription. |
| LicenseFamily | id PK, originalAccountId, currentAccountId, transferredAt?, transferredTo?, createdAt. The transfer flag persists across successor licenses. |
| Entitlement | id PK, accountId, familyId FK, catalogVersion, tier, billingType one_time/monthly/annual/free/trial, maxProfiles, teamSeats, requestsPerSecond, apiQuota?, createdAt, issuedAt?, paidThrough?, status pending_signature/active/transferred/expired/revoked, signedJWT?, signingKeyId?. Only active/issued entitlements can be delivered for verification. |
| LicenseTransfer | id PK, familyId UNIQUE, fromAccountId, toAccountId, verifiedProofRefs, approvedBy, requestedAt, approvedAt?, completedAt?, status. Destination eligibility checked transactionally. |
| WebhookReceipt | provider + providerEventId composite PK, receivedAt, payloadHash, verified, processingState, relatedExternalId?, sanitizedError?. Raw sensitive bodies have bounded protected retention only when justified. |
| SigningJob | id PK, entitlementId UNIQUE, requestedAt, status queued/signed/failed, signingKeyId?, signedAt?, safeError?. Restricted signer returns a signature, not private key material. |
| CommercialAudit | id PK, actor, action, subjectRef, occurredAt, sanitizedDetails. No browser content. |

### 4.1 Commercial invariants

- All amounts and sums use exact arithmetic. Currency, network, confirmations, quote expiry, and payment allocation are verified before issuance.
- Old transactions are not new payment evidence. Aggregate partial payments from uniquely allocated outputs.
- Payment settlement creates a pending_signature entitlement and signing job atomically. Signer completion stores signedJWT/signingKeyId/issuedAt and activates it atomically; retries reuse the entitlement ID. Never expose a pending row as an activated license.
- An invoice expiry ends active checkout, not service responsibility to reconcile received funds.
- Chain reorganization rolls payment evidence into reconciling and requires an explicit entitlement/support policy; it never deletes browser data or silently terminates sessions.
- Webhook authenticity is checked before parsing untrusted events into state transitions. Provider reconciliation handles out-of-order events.
- Lifetime entitlements omit expiry and require no phone-home. A transferred old offline JWT remains cryptographically valid; this is an accepted policy limitation.
- Subscription paidThrough is signed. Grace ends exactly seven days later; archive is non-destructive.
- Local clocks and local monthly API accounting are not tamper-proof enforcement mechanisms. Team-wide quotas can be authoritative only while synchronized to a common service.
- Commercial subscriptions/seats do not imply VPN provider account sharing permission.

## 5. Versioned documents

### 5.1 Profile configuration

    type OperatingPolicy = 'standard' | 'protected_execution' | 'disposable';
    type RotationFrequency =
      'per_launch' | 'every_5' | 'every_10' | 'hourly' | 'daily' | 'manual';

    interface ProfileConfigV1 {
      schemaVersion: 1;
      fingerprint: FingerprintConfigV1;
      route: RouteConfigV1;
      permissions: Record<string, 'ask' | 'allow' | 'deny'>;
      extensions: ExtensionBindingV1[];
      bookmarks: {title: string; url: string}[];
      downloadRootRef: string;
      operatingPolicy: OperatingPolicy;
      validation: {
        mode: 'strict' | 'warning' | 'disabled';
        everySuccessfulLaunches: 1 | 5 | 10 | null;
        enabledSuites: string[];
        requiredChecks: string[];
      };
    }

    interface FingerprintConfigV1 {
      schemaVersion: 1;
      presetId: string | null;
      actualEngine: 'chromium';
      targetDescription: string;
      userAgent: string;
      clientHints: Record<string, unknown> | null;
      platformTarget: string;
      languages: string[];
      timezone: string;
      viewport: {width: number; height: number};
      screen: {width: number; height: number; colorDepth: number};
      canvas: {mode: 'native' | 'stable_noise' | 'blocked'; seedRef: string | null};
      webgl: {mode: 'native' | 'override' | 'blocked'; vendor?: string; renderer?: string};
      webrtcPolicy: 'restricted' | 'disabled';
      doNotTrack: boolean;
      hardwareConcurrency: number;
      capabilityReportRef: string;
    }

    type EgressPolicyV1 =
      {routeLock: true; onFailure: 'block'; dns: 'through_route'}
      | {routeLock: false; onFailure: 'direct_after_active_route_loss';
         dns: 'through_route_then_system_on_fallback'; acceptedAt: number};

    type RouteConfigV1 = {
      schemaVersion: 1;
      egress: EgressPolicyV1;
      rotation: {frequency: RotationFrequency; lastRotatedAt: number | null;
        successfulLaunchesSinceRotation: number; nextDueAt: number | null};
      sharing: 'dedicated' | 'explicit_shared';
    } & (
      {kind: 'vpn'; provider: 'mullvad' | 'ivpn';
       accountSecretRef: string | null; importedConfigSecretRef: string | null;
       endpointId: string; tunnelIdentityRef: string}
      | {kind: 'socks5'; endpointId: string; poolId: string | null;
         remoteDNS: true}
      | {kind: 'http_connect'; endpointId: string; poolId: string | null}
    );

    interface ExtensionBindingV1 {
      id: string;
      version: string;
      sourceURL: string;
      packageSHA256: string;
      permissions: string[];
      enabled: boolean;
      updatePolicy: 'manual';
    }

Validate IANA timezone names and bounded numeric dimensions; accept no unbounded arbitrary filesystem path, shell command, extension hook, or unsupported policy string. Reject duplicate extension IDs unless version semantics explicitly permit them. The capability report lists which requested fingerprint properties the shipped browser can enforce.

Legacy v3.0 VPNConfig migrates through a versioned adapter: provider custom_socks5 maps to kind socks5; plaintext-looking encrypted fields require verified decryption/rewrapping, never re-labeling. Preserve original preset identifiers as import metadata even when their display label changes.

### 5.2 Snapshot and capsule metadata

    type SnapshotTrigger =
      'baseline' | 'manual' | 'auto_pre_launch' | 'auto_edit' | 'auto_close'
      | 'auto_pre_restore' | 'auto_pre_merge' | 'auto_pre_suspend'
      | 'auto_pre_update';

    interface EncryptedObjectHeaderV1 {
      formatVersion: 1;
      objectId: string;
      sourceProfileId: string;
      sourceRevision: number;
      payloadFormat: 'profile_archive_v1';
      cipher: 'AES-256-GCM';
      nonceBase64: string;
      tagBase64: string;
      compression: 'gzip_9';
      authenticatedMetadataSHA256: string;
    }

    interface CapsuleManifestV1 {
      capsuleFormatVersion: '1.0';
      exportId: string;
      sourceProfileId: string;
      profileName: string;
      exportedAt: number;
      browserReleaseId: string;
      schemaVersion: number;
      contents: {path: string; kind: string; bytes: number; sha256: string}[];
      originalSnapshotIds: string[];
      includesSecrets: boolean;
      signerFingerprint: string;
      portabilityWarnings: string[];
    }

Snapshot AEAD additional authenticated data is a canonical serialization of all immutable identity/format fields; exclude the tag itself and the derived authenticatedMetadataSHA256 to avoid circular hashing. Store mutable display/pin/retention data separately. Verify the persisted tag and binding, not just an unauthenticated SHA-256 string.

Capsule manifest and detached signature are encrypted inside the package. The signature covers exact manifest bytes; content hashes bind payload files. An external header contains only magic, envelope-format version, and bounded envelope framing. SHA-256 alone does not authenticate a capsule.

The v1 snapshot format defaults to one streaming AES-GCM object with ciphertext spooled and authenticated before decompression/extraction; reject oversized input before allocation. Chunked formats require a new explicit format version with per-chunk nonce/ordering/final-manifest rules. Do not silently mix chunk formats under version 1.

### 5.3 Observations and events

    type ObservationState = 'pass' | 'fail' | 'unknown' | 'unavailable' | 'unsupported';

    interface ObservationV1 {
      property: string;
      state: ObservationState;
      configured: unknown;
      measured: unknown;
      method: string;
      observedAt: number;
      evidenceRef: string | null;
      explanation: string;
    }

    interface EventEnvelopeV1 {
      schemaVersion: 1;
      eventId: string;
      deviceId: string;
      localSequence: number;
      occurredAt: number;
      actorId: string;
      profileId: string | null;
      sessionId: string | null;
      type: string;
      severity: 'info' | 'warn' | 'error';
      details: Record<string, unknown>;
    }

Event type selects a separate allowlisted details schema; Record does not authorize arbitrary object dumping. Severity/event filters operate on these fields. Unknown types are rejected or explicitly versioned.

Strict due validation admits launch only when every required observation is pass. Fail, unknown, unavailable, unsupported, missing, and timed-out required observations all block. Optional observations remain visible without blocking. Disabled validation skips these checks, not route enforcement.

## 6. IPC and WebDriver contracts

### 6.1 Desktop requests

    interface MutationRequest<T> {
      requestId: string;
      profileId: string;
      expectedRevision: number;
      payload: T;
    }

    interface SafeError {
      code: string;
      message: string;
      retryable: boolean;
      action: string | null;
      requestId: string;
    }

Required operations:

| Boundary | Operations and constraints |
| --- | --- |
| Renderer/coordinator | profiles.create/update/archive/delete/branch/merge; sessions.launch/close/suspend/resume; routes.test/replace/rotate; snapshots.list/create/restore/pin; diagnostics.run/export; recipes CRUD/import/export; lab actions; capsules.prepare/import/export; billing prepare/refresh; team join/invite/audit; updates.check/prepare/install/rollback. All are named, role/scoped, bounded requests. |
| Coordinator/helper | prepareRoute, verifyRoute, launchContained, replaceRoute, blockRoute, terminateOwnedTree, releaseRoute. Never accept shell text, arbitrary PID kill, or unrestricted filesystem operations. |
| Coordinator/crypto worker | unlock, wrap/unwrap by scoped object reference, encrypt/decrypt object, sign/verify capsule manifest. No generic renderer access to unwrapped keys. |
| Playground/broker | navigate, findText, screenshot, print, stop. Implicit target is the admitted temporary session; no caller-chosen profile ID or raw CDP command. |

Request IDs make retryable mutation status queryable; they do not automatically make every browser interaction idempotent. A repeated click/order submission must not be retried automatically because a transport timeout occurred.

### 6.2 WebDriver gateway

| Method/path | Behavior |
| --- | --- |
| POST /session | Authenticate, claim one automation owner for the gateway's already admitted managed session, return W3C session/capabilities. Accept only compatible capabilities; never allow caller-supplied binary, debuggerAddress, extension, or user-data-dir paths. |
| POST /session/:id/url | Navigate after route/state checks; bodies are not logged by default. |
| GET /session/:id/title | Return the current page title; used by both documented examples. |
| GET /session/:id/screenshot | Return W3C base64 screenshot; keep contents out of logs. |
| POST /session/:id/element | Standard W3C locator handling within target. |
| GET /session/:id/element/:elementId/text | Standard W3C element text. |
| POST /session/:id/execute/sync | Authorized session script execution; not application/Node execution. |
| GET/POST /session/:id/alert/... | Supported W3C alert commands; compatibility tested. |
| GET/POST/DELETE /session/:id/window | Get current handle, switch handle, or close the current window through W3C semantics; last-window closure follows managed session cleanup. |
| GET /session/:id/window/handles | List the managed session's window handles. |
| GET/POST /session/:id/window/rect | Get/set window rectangle when supported by the declared driver mode. |
| POST /session/:id/window/new, /window/maximize, /window/minimize, /window/fullscreen | Standard new-window and window-state operations when supported; unsupported attach-mode commands return W3C errors. |
| DELETE /session/:id | Delegate Save & Close to the coordinator; token scope must permit closing. |

All requests require Authorization Bearer. Rate admission uses a rolling monotonic one-second window per managed session, 10 accepted commands for paid/trial and 5 for free. Reject excess before driver execution with Retry-After equal to the ceiling of the remaining wait in seconds, minimum 1.

Return 401 invalid token; 403 scope violation; 409 claimed/conflicting state; 429 rate exceeded; 503 route blocked/crashed/unavailable. W3C errors retain a value object with error/message/stacktrace; application stack traces are sanitized/omitted. An unknown valid-session command returns the W3C unknown command error (404), not an invented successful response.

Authenticate before exposing /status/session existence. Bound request bodies and response artifacts, validate Host and origin against numeric-loopback policy, disable arbitrary CORS, and never redirect control requests. Per-session tokens are random at least 256 bits, constant-time compared where applicable, ephemeral, revocable, and never passed to pages. Do not authenticate by port number alone.

External browser pages must not be able to access internal control transports merely because they share the host. Native boundary/process identity and gateway authentication are defense layers; malicious code already running as the operator remains a documented host threat.

## 7. Migration and compatibility obligations

There is no existing repository/database in this task, so these contracts do not claim that a v3.0 production migration was run.

If a v3-shaped database is supplied later, implement a read-only preflight that inventories format, encryption, raw-key exposure, timestamps, profile count, browser-state compatibility, secrets, and missing ownership. Back it up under the original version before conversion.

Map users into separate local/commercial/team identity domains; normalize folders/tags/comparison participants; migrate snapshot BLOBs to authenticated files; rewrap real keys; expand trigger/state enums; remove raw gateway tokens; replace scalar score semantics with observations; and preserve profile/snapshot provenance. Abort conversion rather than guess a missing key, currency, or source identity.

Validate data contracts and type versions together in CI. Release evidence includes interrupted migration recovery, old format rejection, same-version round trips, archive/capsule compatibility, and preservation of original state.
