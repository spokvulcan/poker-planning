/**
 * Jira Cloud REST API client.
 * Used within Convex actions for all Jira API calls.
 *
 * Effectful dependencies (fetch, the rate-limit backoff sleep) are injected
 * with production defaults, so tests drive the real request/retry code paths
 * without faking globals.
 */

export interface JiraClientDeps {
  /** Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Backoff wait between 429 retries; defaults to a real setTimeout sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    issuetype: { name: string; iconUrl?: string };
    status: { name: string };
    priority?: { name: string };
    [key: string]: unknown;
  };
}

interface JiraField {
  id: string;
  name: string;
  custom: boolean;
}

export class JiraClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private cloudId: string,
    private accessToken: string,
    deps: JiraClientDeps = {}
  ) {
    this.fetchImpl = deps.fetchImpl ?? ((...args) => fetch(...args));
    this.sleep =
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }
  private get baseUrl() {
    return `https://api.atlassian.com/ex/jira/${this.cloudId}`;
  }

  async getProjects(): Promise<JiraProject[]> {
    const data = await this.get<{ values: JiraProject[] }>(
      "/rest/api/3/project/search"
    );
    return data.values;
  }

  async getBoards(projectKey: string): Promise<JiraBoard[]> {
    const data = await this.get<{ values: JiraBoard[] }>(
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}`
    );
    return data.values;
  }

  async getSprints(boardId: number): Promise<JiraSprint[]> {
    const data = await this.get<{ values: JiraSprint[] }>(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active,future`
    );
    return data.values;
  }

  async getSprintIssues(sprintId: number): Promise<JiraIssue[]> {
    const jql = `sprint = ${sprintId} ORDER BY rank ASC`;
    const data = await this.get<{ issues: JiraIssue[] }>(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,issuetype,status,priority&maxResults=100`
    );
    return data.issues;
  }

  async getBacklogIssues(projectKey: string): Promise<JiraIssue[]> {
    const jql = `project = ${projectKey} AND sprint not in openSprints() AND sprint not in futureSprints() ORDER BY rank ASC`;
    const data = await this.get<{ issues: JiraIssue[] }>(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,issuetype,status,priority&maxResults=100`
    );
    return data.issues;
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    return await this.get<JiraIssue>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,issuetype,status,priority`
    );
  }

  async findStoryPointsField(): Promise<string | null> {
    const fields = await this.get<JiraField[]>("/rest/api/3/field");
    const spField = fields.find(
      (f) =>
        f.name === "Story Points" || f.name === "Story point estimate"
    );
    return spField?.id ?? null;
  }

  async updateStoryPoints(
    issueKey: string,
    fieldId: string,
    value: number
  ): Promise<void> {
    await this.put(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      fields: { [fieldId]: value },
    });
  }

  async addComment(issueKey: string, body: string): Promise<void> {
    await this.post(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      {
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: body }],
            },
          ],
        },
      }
    );
  }

  async registerWebhook(
    jqlFilter: string,
    webhookUrl: string
  ): Promise<string> {
    const result = await this.post<{
      webhookRegistrationResult: Array<{
        createdWebhookId: string;
      }>;
    }>("/rest/api/3/webhook", {
      url: webhookUrl,
      webhooks: [
        {
          jqlFilter,
          events: ["jira:issue_updated", "jira:issue_deleted"],
        },
      ],
    });
    return result.webhookRegistrationResult[0].createdWebhookId;
  }

  async deleteWebhooks(webhookIds: string[]): Promise<void> {
    if (webhookIds.length === 0) return;
    const query = webhookIds
      .map((id) => `webhookIds=${encodeURIComponent(id)}`)
      .join("&");
    await this.delete(`/rest/api/3/webhook?${query}`);
  }

  // -------------------------------------------------------------------------
  // HTTP helpers
  // -------------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async put(path: string, body: unknown): Promise<void> {
    await this.request<void>("PUT", path, body);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async delete(path: string): Promise<void> {
    await this.request<void>("DELETE", path);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 2
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Retry on 429 (rate limit)
    if (response.status === 429 && retries > 0) {
      const retryAfter = parseInt(response.headers.get("Retry-After") ?? "5");
      await this.sleep(retryAfter * 1000);
      return this.request<T>(method, path, body, retries - 1);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Jira API ${method} ${path} failed: ${response.status} ${errorText}`
      );
    }

    // PUT/DELETE may return 204/202 with empty body
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}
