import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { fetchPage, search } from "./deepseek.ts";

const SEARCH_DESCRIPTION = "Ask a web-enabled agent.";

function result(text: string, details: Record<string, unknown> = {}) {
    return {
        content: [{ type: "text" as const, text }],
        details,
    };
}

function errorResult(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return result(`Error: ${message}`, { error: true });
}

export default function (pi: ExtensionAPI) {
    pi.registerTool({
        name: "web_search",
        label: "Web Search",
        description: SEARCH_DESCRIPTION,
        parameters: Type.Object({
            keyword: Type.String(),
            question: Type.Optional(Type.String()),
        }),
        execute: async (_id, params, _signal, _onUpdate, ctx) => {
            try {
                const { text, sources, results } = await search(ctx, params.keyword, params.question);
                return result(text, { provider: "deepseek", sources, results });
            } catch (error) {
                return errorResult(error);
            }
        },
        renderResult: () => new Text("", 0, 0),
    });

    pi.registerTool({
        name: "web_fetch",
        label: "Web Fetch",
        description: "Fetch a web page.",
        parameters: Type.Object({
            url: Type.String(),
        }),
        execute: async (_id, params, _signal, _onUpdate, ctx) => {
            try {
                const { text, sources, page } = await fetchPage(ctx, params.url);
                return result(text, { provider: "deepseek", sources, page });
            } catch (error) {
                return errorResult(error);
            }
        },
        renderResult: () => new Text("", 0, 0),
    });
}
