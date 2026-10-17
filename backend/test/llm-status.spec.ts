import { LlmService } from '../src/agent/llm.service';
import { CONFIG } from '../src/config';
import type { ToolsService } from '../src/tools/tools.service';
import type { DbService } from '../src/db/db.service';
import type { CaseStore } from '../src/agent/case.store';
const key = CONFIG.GEMINI_API_KEY;
afterEach(() => { CONFIG.GEMINI_API_KEY = key; jest.restoreAllMocks(); });
const service = () => new LlmService({} as ToolsService, {} as DbService, {} as CaseStore);
it('reports configuration honestly without calling Gemini on a status read', () => {
  const fetch = jest.spyOn(global, 'fetch');
  CONFIG.GEMINI_API_KEY = ''; expect(service().status().state).toBe('unconfigured');
  CONFIG.GEMINI_API_KEY = 'test-key'; expect(service().status().state).toBe('unchecked');
  expect(fetch).not.toHaveBeenCalled();
});
it('distinguishes invalid keys from exhausted quota without exposing provider payloads', async () => {
  CONFIG.GEMINI_API_KEY = 'test-key';
  jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('secret provider response', { status: 401 })).mockResolvedValueOnce(new Response('{}', { status: 429 }));
  const invalid = await service().probe(); expect(invalid.code).toBe('HTTP_401'); expect(invalid.message).not.toContain('secret');
  const quota = await service().probe(); expect(quota.code).toBe('HTTP_429'); expect(quota.message).toContain('kuota');
});
it('shares concurrent probes and caches a recent successful result', async () => {
  CONFIG.GEMINI_API_KEY = 'test-key';
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }), { status: 200 }));
  const llm = service(); const results = await Promise.all([llm.probe(), llm.probe()]);
  expect(results.every((item) => item.state === 'ready')).toBe(true);
  await llm.probe(); expect(fetch).toHaveBeenCalledTimes(1);
});
