/**
 * JiraClient with injected fetch/sleep: the real request, retry, and error
 * code paths driven without faking globals.
 */
import { describe, it, expect, vi } from "vitest";
import { JiraClient } from "./jiraClient";

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("JiraClient requests", () => {
  it("sends the bearer header against the cloud base URL and parses JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ values: [{ id: "1", key: "PROJ", name: "Project" }] })
    );
    const client = new JiraClient("cloud-1", "token-abc", { fetchImpl });

    const projects = await client.getProjects();

    expect(projects).toEqual([{ id: "1", key: "PROJ", name: "Project" }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/project/search"
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-abc"
    );
  });

  it("retries a 429 after the Retry-After backoff, via the injected sleep", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () =>
        jsonResponse({}, 429, { "Retry-After": "7" })
      )
      .mockImplementationOnce(async () =>
        jsonResponse({ values: [{ id: "1", key: "PROJ", name: "Project" }] })
      );
    const client = new JiraClient("cloud-1", "token-abc", {
      fetchImpl: fetchImpl as typeof fetch,
      sleep,
    });

    const projects = await client.getProjects();

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(7000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(projects).toHaveLength(1);
  });

  it("gives up after the bounded retries when 429s persist", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fetchImpl = vi.fn(async () =>
      jsonResponse({}, 429, { "Retry-After": "1" })
    );
    const client = new JiraClient("cloud-1", "token-abc", {
      fetchImpl: fetchImpl as typeof fetch,
      sleep,
    });

    await expect(client.getProjects()).rejects.toThrow(/429/);
    // 1 initial + 2 retries
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("throws status and body on a non-ok response", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("nope", { status: 403 })
    );
    const client = new JiraClient("cloud-1", "token-abc", {
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.getProjects()).rejects.toThrow(
      /Jira API GET .* failed: 403 nope/
    );
  });

  it("resolves undefined on a 204 (empty-body writes)", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new JiraClient("cloud-1", "token-abc", {
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      client.updateStoryPoints("PROJ-1", "customfield_10016", 5)
    ).resolves.toBeUndefined();
  });
});
