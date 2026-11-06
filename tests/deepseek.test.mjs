import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPage, search } from '../src/deepseek.ts';

const model = {
  id: 'deepseek-chat',
  provider: 'deepseek',
  api: 'openai-completions',
  baseUrl: 'https://api.deepseek.com',
  headers: {},
};

function ctx(options = {}) {
  return {
    model: options.model ?? model,
    modelRegistry: {
      async getProviderAuth(provider) {
        assert.equal(provider, 'deepseek');
        if (options.auth === null) return undefined;
        return {
          auth: {
            apiKey: 'apiKey' in options ? options.apiKey : 'test-key',
            headers: options.headers,
            baseUrl: options.baseUrl,
          },
        };
      },
    },
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('search posts DeepSeek defaults and returns the raw results array', async (t) => {
  const hit = {
    title: 'DeepSeek docs',
    url: 'https://api-docs.deepseek.com/',
    snippet: 'Short text.',
    summary: 'Long summary.',
    site_name: 'DeepSeek',
    date: '2026-06-01T00:00:00+00:00',
    authority: 3,
    rerank_score: 2.4,
  };

  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/v1/tools/search');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    assert.deepEqual(JSON.parse(init.body), {
      query: 'DeepSeek docs',
      count: 10,
      need_content: false,
      ori_question: 'DeepSeek docs',
    });
    return json({ results: [hit], request_id: 'abc' });
  });

  const output = await search(ctx(), 'DeepSeek docs');

  // The model sees the results array verbatim, with no envelope and no reformatting.
  assert.equal(output.text, JSON.stringify([hit]));
  assert.deepEqual(JSON.parse(output.text), [hit]);
  assert.deepEqual(output.results, [hit]);
  assert.deepEqual(output.sources, [{ title: 'DeepSeek docs', url: 'https://api-docs.deepseek.com/' }]);
});

test('search sends the original question separately when provided', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), {
      query: 'DeepSeek site:github.com lang:zh after:2025',
      count: 10,
      need_content: false,
      ori_question: 'DeepSeek 最近有什么新消息',
    });
    return json({ results: [] });
  });
  await search(ctx(), 'DeepSeek site:github.com lang:zh after:2025', 'DeepSeek 最近有什么新消息');
});

test('search returns an empty array when there are no results', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ results: [] }));
  const output = await search(ctx(), 'nothing');
  assert.equal(output.text, '[]');
  assert.deepEqual(output.results, []);
  assert.deepEqual(output.sources, []);
});

test('fetchPage returns the raw fetch response', async (t) => {
  const page = { title: 'Example article', content: '# Example article\n\nBody text.' };

  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/v1/tools/fetch');
    assert.deepEqual(JSON.parse(init.body), { url: 'https://example.com/article' });
    return json(page);
  });

  const output = await fetchPage(ctx(), 'https://example.com/article');

  assert.equal(output.text, JSON.stringify(page));
  assert.deepEqual(JSON.parse(output.text), page);
  assert.deepEqual(output.sources, [{ title: 'Example article', url: 'https://example.com/article' }]);
});

test('base URL overrides keep the proxy path and drop the API suffix', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'https://proxy.test/deepseek/v1/tools/search');
    return json({ results: [] });
  });
  await search(ctx({ baseUrl: 'https://proxy.test/deepseek/anthropic/v1' }), 'query');
});

test('DEEPSEEK_API_KEY is used when the registry has no key', async (t) => {
  const previous = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'env-key';
  t.after(() => {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  });
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer env-key');
    return json({ results: [] });
  });
  await search(ctx({ apiKey: undefined }), 'query');
});

test('missing credentials fail before fetch', async (t) => {
  const previous = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  t.after(() => {
    if (previous !== undefined) process.env.DEEPSEEK_API_KEY = previous;
  });
  const fetch = t.mock.method(globalThis, 'fetch', () => assert.fail('must not fetch'));
  await assert.rejects(search(ctx({ apiKey: undefined }), 'query'), /No DeepSeek API key/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('the current conversation model provider is irrelevant', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    return json({ results: [] });
  });
  await search(ctx({ model: { ...model, provider: 'opencode-go' } }), 'query');
});

test('provider auth headers are preserved', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.headers['X-Test'], '1');
    return json({ results: [] });
  });
  await search(ctx({ headers: { 'X-Test': '1' } }), 'query');
});

test('DeepSeek HTTP errors include status and body', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ error: { message: 'bad request' } }, 400));
  await assert.rejects(search(ctx(), 'query'), /DeepSeek \/v1\/tools\/search failed \(400\): .*bad request/);
});
