# Integration providers sit behind a registry seam

**Status:** accepted

The generic integrations module (`convex/model/integrations.ts`) hard-referenced Jira: it scheduled `internal.integrations.jira.*` functions by name, filtered `provider === "jira"`, and took jira-shaped mapping arguments. The Jira orchestration also constructed its own effects inline — `fetch`, `Date.now`, `setTimeout` — so the client, token refresh, webhook endpoint, and OAuth exchange were untestable, and tests resorted to faking `setTimeout` to suppress the reveal→Jira push. GitHub (spec 07) is the prescribed second adapter, so the seam is real, not speculative.

The **integration provider registry** (`convex/integrations/registry.ts`) maps a connection's `provider` to its adapter's handler: webhook register/deregister/disconnect references, token refresh, and pure accessors over the provider's mapping fields. The generic module routes through `getProviderHandler(provider)` and never names a provider; an unregistered provider throws loudly. Adapter effectful functions take their dependencies (`fetchImpl`, `now`, `sleep`, `keyHex`) as arguments defaulting to the real ones. The token vault's ciphertext tripwire was tightened to the real encryption format (iv/tag/hex shape) so a plaintext token — e.g. a 40-char GitHub classic PAT — can never pass as ciphertext.

## Considered Options

- **Registry + injected effects** (chosen). The generic module depends on the provider *name* only as data; each adapter is a directory that registers itself. Tests drive helpers with recording fakes instead of faking globals.
- **Keep Jira hardcoded, bolt GitHub alongside** (rejected). Duplicates every provider branch and leaves the orchestration untestable; the second adapter is already prescribed by spec 07.
- **Full plugin architecture** (rejected). Dynamic registration, per-provider config schemas, capability flags — over-generalization for one live adapter. The registry is a static map; deepening further can happen when GitHub actually lands.

## Consequences

- Registered Convex actions cannot receive injected functions (args must be serializable), so tests cover the injectable helper cores (`pushEstimateWithClient`, `refreshJiraToken`, `exchangeCode`) rather than the registered actions end-to-end; the registered wrappers stay thin.
- Provider-specific *data* stays provider-named in the schema (`jiraWebhookId`, `jiraProjectKey` columns); only the generic module's *arguments* are provider-neutral. A schema rename is deliberately out of scope.
- `convex/model/votingRound.ts` still schedules the Jira estimate push directly at reveal — that is a Jira-specific effect by design, not a registry gap. When GitHub has an equivalent effect, that call site becomes a registry dispatch.
- The OAuth callback route handler keeps its CSRF/redirect plumbing untested (no Next.js route test infrastructure); its fetch orchestration is extracted and covered.
