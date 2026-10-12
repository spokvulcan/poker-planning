/**
 * An in-memory Jira for convex-test, standing where the real one does: behind
 * the global fetch, the one external seam every registered Jira action
 * shares. It serves the Atlassian token endpoint and the Jira Cloud REST
 * endpoints JiraClient calls, for any number of sites, each with its own
 * projects, issues, fields and webhooks, and records every call with the site
 * it reached and the token it came with. A token is good on the one site it
 * was granted for, so a call made as the wrong connection, or on the wrong
 * site, is refused as Jira would refuse it.
 *
 * Connections are seeded with tokens the token vault really encrypted, under
 * a test key set as the vault's own key, so they decrypt as a live
 * connection's do; a stale one is refreshed through the token endpoint here.
 * The multi-dot filename keeps the Convex CLI from deploying it (see
 * analytics.seeds.ts). Tests call vi.unstubAllGlobals and vi.unstubAllEnvs
 * after each test.
 */
import { vi } from "vitest";
import type { TestConvex } from "convex-test";
import type schema from "../schema";
import type { Id } from "../_generated/dataModel";
import * as TokenVault from "../model/tokenVault";

type T = TestConvex<typeof schema>;

/** The token vault's key under test: 64 hex characters. */
export const TEST_VAULT_KEY = "0123456789abcdef".repeat(4);

/** A Jira issue on a site, as the in-memory Jira keeps it. */
export interface FakeIssue {
  id: string;
  key: string;
  summary: string;
  project: string;
  sprint?: number;
  /** Fields written to it, story points among them. */
  fields: Record<string, unknown>;
  /** Comments added to it, as their text. */
  comments: string[];
}

/** A webhook registered on a site. */
export interface FakeWebhook {
  url: string;
  jqlFilter: string;
  events: string[];
}

/** One Jira Cloud site: "https://team.atlassian.net" and its cloud's contents. */
export interface FakeSite {
  url: string;
  cloudId: string;
  projects: { id: string; key: string; name: string }[];
  boards: { id: number; name: string; type: string; project: string }[];
  sprints: { id: number; name: string; state: string; board: number }[];
  fields: { id: string; name: string; custom: boolean }[];
  issues: Map<string, FakeIssue>;
  webhooks: Map<string, FakeWebhook>;
}

/** One request that reached the in-memory Jira. */
export interface JiraCall {
  method: string;
  /** The site a Jira REST call reached; "auth" for Atlassian's token endpoint. */
  site: string;
  /** The path and query, after the site's cloud: "/rest/api/3/issue/PROJ-1". */
  path: string;
  /** The bearer token it came with. */
  token: string | null;
  body?: unknown;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Jira refusing a call it doesn't know, or one this test asked it to refuse. */
const refused = (status: number, message: string) => json({ errorMessages: [message] }, status);

/**
 * Stands an in-memory Jira behind the global fetch and gives the token vault
 * and the Jira OAuth app their settings. Returns the handle a test seeds and
 * reads it through.
 */
export function inMemoryJira() {
  const sites = new Map<string, FakeSite>(); // by cloud id
  const accessTokens = new Map<string, string>(); // token -> the cloud id it is good on
  const refreshTokens = new Map<string, string>(); // refresh token -> cloud id
  const tokensOf = new Map<string, { access: string; refresh: string }>(); // by connection id
  const calls: JiraCall[] = [];
  const refusals: { method: string; path: string; status: number }[] = [];
  let minted = 0;
  let nextWebhook = 1000;

  const mint = (kind: string) => `${kind}-${++minted}`;

  /** Atlassian's token endpoint: a refresh token for a new pair, rotated as Atlassian does. */
  function refresh(body: { grant_type?: string; refresh_token?: string } | undefined): Response {
    calls.push({ method: "POST", site: "auth", path: "/oauth/token", token: null, body });
    const cloudId = body?.refresh_token ? refreshTokens.get(body.refresh_token) : undefined;
    if (body?.grant_type !== "refresh_token" || !cloudId) return json({ error: "invalid_grant" }, 403);
    refreshTokens.delete(body.refresh_token!);
    const access = mint("access");
    const next = mint("refresh");
    accessTokens.set(access, cloudId);
    refreshTokens.set(next, cloudId);
    for (const [connectionId, tokens] of tokensOf) {
      if (tokens.refresh === body.refresh_token) tokensOf.set(connectionId, { access, refresh: next });
    }
    return json({ access_token: access, refresh_token: next, expires_in: 3600, scope: "read:jira-work write:jira-work" });
  }

  function issueJson(issue: FakeIssue) {
    return {
      id: issue.id,
      key: issue.key,
      fields: { summary: issue.summary, issuetype: { name: "Story" }, status: { name: "To Do" }, ...issue.fields },
    };
  }

  /** The Jira Cloud REST endpoints JiraClient calls. */
  function rest(site: FakeSite, method: string, url: URL, body: unknown): Response {
    const path = url.pathname.replace(/^\/ex\/jira\/[^/]+/, "");
    const issueKey = path.match(/^\/rest\/api\/3\/issue\/([^/]+)/)?.[1];
    const issue = issueKey ? site.issues.get(decodeURIComponent(issueKey)) : undefined;

    if (method === "GET" && path === "/rest/api/3/project/search") return json({ values: site.projects });
    if (method === "GET" && path === "/rest/agile/1.0/board") {
      const project = url.searchParams.get("projectKeyOrId");
      return json({ values: site.boards.filter((board) => board.project === project) });
    }
    const boardId = path.match(/^\/rest\/agile\/1\.0\/board\/(\d+)\/sprint$/)?.[1];
    if (method === "GET" && boardId) {
      return json({ values: site.sprints.filter((sprint) => sprint.board === Number(boardId)) });
    }
    if (method === "GET" && path === "/rest/api/3/search/jql") {
      const jql = url.searchParams.get("jql") ?? "";
      const sprint = jql.match(/^sprint = (\d+)/)?.[1];
      const project = jql.match(/^project = (\S+)/)?.[1];
      const found = [...site.issues.values()].filter((each) =>
        sprint ? each.sprint === Number(sprint) : each.project === project && each.sprint === undefined
      );
      return json({ issues: found.map(issueJson) });
    }
    if (method === "GET" && path === "/rest/api/3/field") return json(site.fields);
    if (issueKey && !issue) return refused(404, "Issue does not exist or you do not have permission to see it.");
    if (method === "GET" && issue && /^\/rest\/api\/3\/issue\/[^/]+$/.test(path)) return json(issueJson(issue));
    if (method === "PUT" && issue && /^\/rest\/api\/3\/issue\/[^/]+$/.test(path)) {
      Object.assign(issue.fields, (body as { fields: Record<string, unknown> }).fields);
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && issue && path.endsWith("/comment")) {
      const doc = body as { body: { content: { content: { text: string }[] }[] } };
      issue.comments.push(doc.body.content.map((p) => p.content.map((t) => t.text).join("")).join("\n"));
      return json({ id: String(issue.comments.length) }, 201);
    }
    if (method === "POST" && path === "/rest/api/3/webhook") {
      const request = body as { url: string; webhooks: { jqlFilter: string; events: string[] }[] };
      const created = request.webhooks.map(({ jqlFilter, events }) => {
        const id = String(nextWebhook++);
        site.webhooks.set(id, { url: request.url, jqlFilter, events });
        return { createdWebhookId: id };
      });
      return json({ webhookRegistrationResult: created });
    }
    if (method === "DELETE" && path === "/rest/api/3/webhook") {
      for (const id of url.searchParams.getAll("webhookIds")) site.webhooks.delete(id);
      return new Response(null, { status: 202 });
    }
    return refused(404, `No such Jira endpoint: ${method} ${path}`);
  }

  async function fetchJira(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : undefined;
    if (url.origin === "https://auth.atlassian.com" && url.pathname === "/oauth/token") return refresh(body);

    const cloudId = url.pathname.match(/^\/ex\/jira\/([^/]+)\//)?.[1];
    const site = cloudId ? sites.get(cloudId) : undefined;
    const token = new Headers(init.headers).get("Authorization")?.replace(/^Bearer /, "") ?? null;
    const path = url.pathname.replace(/^\/ex\/jira\/[^/]+/, "") + url.search;
    calls.push({ method, site: site?.url ?? url.origin, path, token, body });
    if (url.origin !== "https://api.atlassian.com" || !site) return refused(404, "No such Jira site");
    // A token is good on the one site it was granted for.
    if (!token || accessTokens.get(token) !== cloudId) return refused(401, "Unauthorized");

    const at = refusals.findIndex((r) => r.method === method && path.startsWith(r.path));
    if (at >= 0) return refused(refusals.splice(at, 1)[0].status, "Refused by the test");
    return rest(site, method, url, body);
  }

  vi.stubGlobal("fetch", fetchJira);
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_VAULT_KEY);
  vi.stubEnv("JIRA_CLIENT_ID", "jira-client-id");
  vi.stubEnv("JIRA_CLIENT_SECRET", "jira-client-secret");

  return {
    /** Every request that reached Jira or its token endpoint, in order. */
    calls,

    /** The calls that reached Jira's REST API, without the token endpoint's. */
    restCalls: () => calls.filter((call) => call.site !== "auth"),

    /**
     * A Jira Cloud site, its cloud id taken from its name: "team" is
     * https://team.atlassian.net on cloud "cloud-team".
     */
    site(name: string, contents: { issues?: Record<string, string>; fields?: FakeSite["fields"] } = {}): FakeSite {
      const site: FakeSite = {
        url: `https://${name}.atlassian.net`,
        cloudId: `cloud-${name}`,
        projects: [{ id: "10000", key: "PROJ", name: "Project" }],
        boards: [{ id: 1, name: "PROJ board", type: "scrum", project: "PROJ" }],
        sprints: [{ id: 7, name: "Sprint 7", state: "active", board: 1 }],
        fields: contents.fields ?? [
          { id: "summary", name: "Summary", custom: false },
          { id: "customfield_10016", name: "Story point estimate", custom: true },
        ],
        issues: new Map(),
        webhooks: new Map(),
      };
      for (const [key, summary] of Object.entries(contents.issues ?? {})) {
        site.issues.set(key, { id: `id-${key}`, key, summary, project: key.split("-")[0], fields: {}, comments: [] });
      }
      sites.set(site.cloudId, site);
      return site;
    },

    /**
     * Seeds a person's Jira connection to the site, with vault-encrypted
     * tokens Jira grants there. `stale` seeds an access token past its expiry,
     * so acting as the connection refreshes it first; `site: null` seeds one
     * from before connections stored their site.
     */
    async connect(
      t: T,
      userId: Id<"users">,
      site: FakeSite | null,
      options: { stale?: boolean } = {}
    ): Promise<Id<"integrationConnections">> {
      const access = mint("access");
      const refreshToken = mint("refresh");
      if (site) {
        accessTokens.set(access, site.cloudId);
        refreshTokens.set(refreshToken, site.cloudId);
      }
      const tokens = await TokenVault.encryptTokens({ accessToken: access, refreshToken }, TEST_VAULT_KEY);
      const connectionId = await t.run((ctx) =>
        ctx.db.insert("integrationConnections", {
          userId,
          provider: "jira",
          ...tokens,
          expiresAt: options.stale ? Date.now() - 1_000 : Date.now() + 3_600_000,
          ...(site ? { cloudId: site.cloudId, siteUrl: site.url } : {}),
          scopes: ["read:jira-work", "write:jira-work"],
          connectedAt: Date.now(),
          lastRefreshedAt: Date.now(),
        })
      );
      tokensOf.set(connectionId, { access, refresh: refreshToken });
      return connectionId;
    },

    /** The access token a connection acts with now: the one seeded, or the last refresh's. */
    tokenOf(connectionId: Id<"integrationConnections">): string {
      return tokensOf.get(connectionId)!.access;
    },

    /** Atlassian revokes the connection's grant: neither its token nor a refresh works any more. */
    revoke(connectionId: Id<"integrationConnections">): void {
      const tokens = tokensOf.get(connectionId)!;
      accessTokens.delete(tokens.access);
      refreshTokens.delete(tokens.refresh);
    },

    /** Jira answers the next `method` call to a path starting with `path` with `status`. */
    refuseNext(method: string, path: string, status = 500): void {
      refusals.push({ method, path, status });
    },
  };
}

export type InMemoryJira = ReturnType<typeof inMemoryJira>;
