import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const API_ROOT = "https://api.deepseek.com";
const SEARCH_COUNT = 10;

export interface SearchHit {
    title?: string;
    url?: string;
    snippet?: string;
    summary?: string;
    content?: string;
    site_name?: string | null;
    site_icon?: string | null;
    date?: string | null;
    authority?: number;
    rerank_score?: number;
}

export interface FetchPage {
    title?: string;
    content?: string;
}

export interface Source {
    title: string;
    url: string;
}

interface Target {
    root: string;
    headers: Record<string, string>;
}

async function resolveTarget(ctx: ExtensionContext): Promise<Target> {
    const resolved = await ctx.modelRegistry.getProviderAuth("deepseek");
    const apiKey = resolved?.auth.apiKey || process.env.DEEPSEEK_API_KEY;

    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(resolved?.auth.headers ?? {})) {
        if (typeof value === "string" && value) headers[name] = value;
    }
    const hasAuth = Object.keys(headers).some((name) => /^(authorization|x-api-key)$/i.test(name));
    if (!hasAuth && apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (!hasAuth && !apiKey) {
        throw new Error("No DeepSeek API key. Run /login and select DeepSeek, or set DEEPSEEK_API_KEY.");
    }

    const root = (resolved?.auth.baseUrl || API_ROOT)
        .replace(/\/+$/, "")
        .replace(/\/(?:anthropic|v\d+)(?:\/v\d+)?$/i, "");

    return { root, headers };
}

async function post<T>(target: Target, path: string, body: unknown): Promise<T> {
    const response = await fetch(`${target.root}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...target.headers,
        },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`DeepSeek ${path} failed (${response.status}): ${text || response.statusText}`);
    }
    return JSON.parse(text) as T;
}

export async function search(
    ctx: ExtensionContext,
    keyword: string,
    question?: string,
): Promise<{
    text: string;
    sources: Source[];
    results: SearchHit[];
}> {
    const target = await resolveTarget(ctx);
    const data = await post<{ results?: SearchHit[] }>(target, "/v1/tools/search", {
        query: keyword,
        count: SEARCH_COUNT,
        need_content: false,
        ori_question: question || keyword,
    });

    const results = data.results ?? [];

    return {
        // The model sees the raw results array, verbatim.
        text: JSON.stringify(results),
        sources: results
            .filter((hit): hit is SearchHit & { url: string } => typeof hit?.url === "string" && hit.url !== "")
            .map((hit) => ({ title: hit.title || hit.url, url: hit.url })),
        results,
    };
}

export async function fetchPage(ctx: ExtensionContext, url: string): Promise<{
    text: string;
    sources: Source[];
    page: FetchPage;
}> {
    const target = await resolveTarget(ctx);
    const page = await post<FetchPage>(target, "/v1/tools/fetch", { url });

    return {
        // The model sees the raw fetch response, verbatim.
        text: JSON.stringify(page),
        sources: [{ title: page.title || url, url }],
        page,
    };
}
