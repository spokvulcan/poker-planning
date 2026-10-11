# Epic 7: GitHub Integration

> Import issues from GitHub repositories and push estimates to GitHub Projects V2 fields.

## Dependencies

- Epic 0 (Permanent Accounts)
- Epic 6 (shares `integrationConnections`, `integrationMappings`, `issueLinks` tables and encryption utilities)

> During Phase 2 this integration is implemented without Pro gating. Room-owner Pro enforcement is applied later in Epic 2.

## Tasks

### 7.1 Setup: Create GitHub App

Register a GitHub App in GitHub Developer Settings:

**App Configuration:**
- **Name:** AgileKit Planning Poker
- **Homepage URL:** `https://agilekit.app`
- **Callback URL:** `https://agilekit.app/api/integrations/github/callback`
- **Webhook URL:** `https://<convex-deployment>.convex.site/webhooks/github`
- **Webhook secret:** Generate and store as `GITHUB_WEBHOOK_SECRET` env var

**Permissions:**
- Repository permissions:
  - `Issues: Read & Write` (read issue data, post comments)
  - `Metadata: Read` (required for all GitHub Apps)
- Organization permissions:
  - `Projects: Read & Write` (read/write GitHub Projects V2 fields)

**Events to subscribe to:**
- `Issues` (issue opened, edited, closed)
- `Projects V2 Item` (project item field changes)

---

### 7.2 Backend: GitHub OAuth flow (User Access Token)

**File:** `src/app/api/integrations/github/authorize/route.ts`

```typescript
export async function GET(request: Request) {
  const state = crypto.randomUUID();
  // Store state in cookie

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_APP_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/github/callback`,
    state,
  });

  return Response.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  );
}
```

**File:** `src/app/api/integrations/github/callback/route.ts`

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // Verify state

  // Exchange code for user access token
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_APP_CLIENT_ID,
        client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
        code,
      }),
    }
  );

  const tokens = await tokenResponse.json();
  // tokens.access_token, tokens.refresh_token, tokens.expires_in

  // Store tokens in Convex via the Convex HTTP client (server-side).
  // Same approach as Jira (see Epic 6, task 6.3): use CONVEX_ADMIN_KEY
  // to call the internal storeConnection action from the Next.js route.
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  convex.setAdminAuth(process.env.CONVEX_ADMIN_KEY!);
  await convex.action(internal.integrations.github.storeConnection, {
    userId,   // resolved from session/auth context
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });

  return Response.redirect("/settings/integrations?connected=github");
}
```

**Token refresh** (similar pattern to Jira, in `convex/integrations/github.ts`):
- User access tokens expire in 8 hours (when expiring tokens enabled)
- Refresh tokens valid for 6 months
- Each refresh returns new access + refresh token

---

### 7.3 Backend: GitHub API client

**File:** `convex/integrations/github-client.ts`

Since GitHub Projects V2 uses GraphQL, the client needs both REST and GraphQL support:

```typescript
export class GitHubClient {
  constructor(private accessToken: string) {}

  // REST API methods
  async getInstallationRepos(): Promise<GitHubRepo[]> {
    return this.restGet("/user/repos?sort=updated&per_page=30");
  }

  async getIssue(owner: string, repo: string, number: number): Promise<GitHubIssue> {
    return this.restGet(`/repos/${owner}/${repo}/issues/${number}`);
  }

  async getIssues(owner: string, repo: string, state = "open"): Promise<GitHubIssue[]> {
    return this.restGet(`/repos/${owner}/${repo}/issues?state=${state}&per_page=50`);
  }

  async addComment(owner: string, repo: string, number: number, body: string) {
    return this.restPost(`/repos/${owner}/${repo}/issues/${number}/comments`, { body });
  }

  // GraphQL API methods (for Projects V2)
  async getProjectsForRepo(owner: string, repo: string): Promise<GitHubProject[]> {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          projectsV2(first: 10) {
            nodes { id title number }
          }
        }
      }
    `;
    const result = await this.graphql(query, { owner, repo });
    return result.repository.projectsV2.nodes;
  }

  async getProjectFields(projectId: string): Promise<GitHubProjectField[]> {
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 20) {
              nodes {
                ... on ProjectV2FieldCommon { id name }
                ... on ProjectV2SingleSelectField {
                  id name options { id name }
                }
              }
            }
          }
        }
      }
    `;
    const result = await this.graphql(query, { projectId });
    return result.node.fields.nodes;
  }

  async getProjectItems(projectId: string): Promise<GitHubProjectItem[]> {
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 50) {
              nodes {
                id
                fieldValues(first: 10) {
                  nodes {
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      field { ... on ProjectV2FieldCommon { name id } }
                    }
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field { ... on ProjectV2FieldCommon { name id } }
                    }
                  }
                }
                content {
                  ... on Issue { title number url repository { nameWithOwner } }
                }
              }
            }
          }
        }
      }
    `;
    const result = await this.graphql(query, { projectId });
    return result.node.items.nodes;
  }

  async updateProjectItemField(
    projectId: string,
    itemId: string,
    fieldId: string,
    value: { number: number }
  ): Promise<void> {
    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
        updateProjectV2ItemFieldValue(
          input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value }
        ) {
          projectV2Item { id }
        }
      }
    `;
    await this.graphql(mutation, { projectId, itemId, fieldId, value });
  }

  private async restGet(path: string) { /* ... */ }
  private async restPost(path: string, body: any) { /* ... */ }
  private async graphql(query: string, variables: Record<string, any>) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const result = await response.json();
    if (result.errors) throw new Error(result.errors[0].message);
    return result.data;
  }
}
```

---

### 7.4 Backend: Import issues from GitHub

**File:** `convex/integrations/github.ts`

```typescript
export const importIssues = action({
  args: {
    roomId: v.id("rooms"),
    owner: v.string(),
    repo: v.string(),
    issueNumbers: v.array(v.number()),
  },
  handler: async (ctx, { roomId, owner, repo, issueNumbers }) => {
    // 1. Get user's GitHub connection, decrypt token
    // 2. Build GitHubClient
    // 3. Fetch issue details from GitHub
    // 4. For each issue:
    //    a. Create issue in room
    //    b. Create issueLink record
    // 5. Return import summary
  },
});
```

---

### 7.5 Backend: Push estimates to GitHub Projects V2

**Files:** `convex/integrations/githubEstimatePush.ts` (registered in `convex/integrations/registry.ts`), `convex/integrations/github.ts`

The estimate push (`convex/model/estimatePush.ts`, ADR-0006) already decides whether a settled estimate goes anywhere: the room's mapping pushes estimates, names the field they go to, its connection acts where the issue is, and the estimate is a number. It records every outcome on the mapping (`lastPush`), which the room's settings show. GitHub adds only its side of that, as the provider registry's `estimates` member, beside Jira's (`convex/integrations/jiraEstimatePush.ts`):

```typescript
export const githubEstimatePush: EstimatePusher = {
  // Where the estimate goes: the issue the link names, in the repository the
  // mapping's connection can reach ("otherSite" when the link is another
  // repository's, "connectionUnusable" when the connection can't act).
  targetOf(link, connection) { /* ... */ },
  // Hands the decided push to the action below.
  async dispatch(ctx, push) {
    await ctx.scheduler.runAfter(0, internal.integrations.github.pushEstimate, { push });
  },
};
```

```typescript
export const pushEstimate = internalAction({
  // Everything the push needs, decided already: nothing is read back.
  args: { push: EstimatePush.estimatePushValidator },
  handler: async (ctx, { push }) => {
    // 1. Act as the push's connection, on its site, through GitHub's own
    //    access module (as Jira's actions do through jiraAccess.ts)
    // 2. Find the project item matching the issue
    // 3. Write push.estimate.value to the push.fieldId number field
    //    (updateProjectItemField)
    // 4. Optionally comment on the issue (a failure here is only logged)
    // 5. Report the outcome back (recordEstimatePush): pushed, refused in
    //    GitHub's words, or a connection that couldn't act
  },
});
```

---

### 7.6 Backend: GitHub webhook handler

**File:** `convex/http.ts`

```typescript
http.route({
  path: "/webhooks/github",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-hub-signature-256");
    const rawBody = await request.text();

    // Verify HMAC-SHA256 signature
    const isValid = await verifyGitHubSignature(
      rawBody, signature, process.env.GITHUB_WEBHOOK_SECRET!
    );
    if (!isValid) return new Response("Invalid signature", { status: 401 });

    const event = request.headers.get("x-github-event");
    const deliveryId = request.headers.get("x-github-delivery");
    const payload = JSON.parse(rawBody);

    // Idempotency: GitHub sends x-github-delivery as a unique ID per delivery.
    // Use the shared webhookEvents table to deduplicate.
    if (deliveryId) {
      const alreadyProcessed = await ctx.runQuery(
        internal.webhooks.hasProcessedEvent, { eventId: `github:${deliveryId}` }
      );
      if (alreadyProcessed) return new Response(null, { status: 200 });
      await ctx.runMutation(internal.webhooks.recordEvent, {
        eventId: `github:${deliveryId}`, eventType: `github:${event}`,
      });
    }

    switch (event) {
      case "issues":
        await ctx.runMutation(internal.integrations.processGitHubIssueEvent, {
          action: payload.action,
          issue: payload.issue,
        });
        break;
      case "projects_v2_item":
        await ctx.runMutation(internal.integrations.processGitHubProjectEvent, {
          action: payload.action,
          changes: payload.changes,
          projectItem: payload.projects_v2_item,
        });
        break;
    }

    return new Response(null, { status: 200 });
  }),
});
```

**HMAC verification:**

```typescript
async function verifyGitHubSignature(
  body: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false;
  const expected = signature.replace("sha256=", "");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hex === expected;
}
```

---

### 7.7 Frontend: Connect GitHub UI

**File:** `src/app/settings/integrations/page.tsx`

Add GitHub connection alongside Jira:
- "Connect GitHub" button -> GitHub App installation flow
- Shows connected account info
- "Disconnect" button

---

### 7.8 Frontend: Import from GitHub modal

**File:** `src/components/room/github-import-modal.tsx`

Similar to Jira import modal:
1. Select repository from dropdown
2. Shows list of open issues with checkboxes
3. Import selected issues into the room

---

### 7.9 Frontend: Room mapping for GitHub

**File:** `src/components/room/integration-settings.tsx`

Extend existing integration settings to support GitHub:
- Select repository
- Select GitHub Project (V2)
- Map the "Estimate" or "Story Points" field
- Toggle: Auto-push estimates

---

### 7.10 Shared: Import modal base component (deferred)

> Out of scope for initial implementation. Build Jira/GitHub modals independently first; extract shared base only if duplication becomes costly.

**File:** `src/components/room/import-issues-modal.tsx`

Props:
- `provider: "jira" | "github"`
- `onImport: (issues: ExternalIssue[]) => void`
- Provider-specific content rendered via slots

**Acceptance criteria for the entire epic:**
- User can connect GitHub account via GitHub App OAuth flow
- User can import issues from a GitHub repository
- Estimates push to GitHub Projects V2 number fields
- GitHub issue title changes sync to linked AgileKit issues
- Webhook signature verification works correctly
- Token refresh handles 8-hour access token expiry
- Integration works for both personal and organization repositories
