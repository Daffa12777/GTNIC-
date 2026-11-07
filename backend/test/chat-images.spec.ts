import 'reflect-metadata';
import { Body, Controller, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ChatDto, MAX_CHAT_IMAGE_BYTES, validateChatImage } from '../src/api/chat.dto';
import { configureHttpSecurity } from '../src/security/http-security';
import { LlmService } from '../src/agent/llm.service';
import { AgentService } from '../src/agent/agent.service';
import { CONFIG } from '../src/config';

const image = { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5lEAAAAASUVORK5CYII=' };
@Controller('chat')
class ChatBoundary {
  @Post() chat(@Body() body: ChatDto) {
    return { imageBytes: validateChatImage(body.image) ? Buffer.from(body.image!.data, 'base64').length : 0 };
  }
}

describe('Chat image boundary', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ChatBoundary] }).compile();
    app = module.createNestApplication({ bodyParser: false }); app.setGlobalPrefix('api');
    configureHttpSecurity(app, { origins: 'http://localhost:5173', production: false, trustProxy: '' });
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  const send = (attachment: unknown) => request(app.getHttpServer()).post('/api/chat').set('x-mm-client', 'web').send({ message: 'Periksa gambar', use_llm: true, image: attachment });
  it('accepts image data above the regular JSON limit while bounding decoded bytes', async () => {
    const bytes = Buffer.alloc(180000); Buffer.from(image.data, 'base64').copy(bytes);
    const result = await send({ ...image, data: bytes.toString('base64') }).expect(201);
    expect(result.body.imageBytes).toBe(bytes.length);
    await send({ ...image, data: Buffer.alloc(MAX_CHAT_IMAGE_BYTES + 1).toString('base64') }).expect(400);
    await send({ ...image, data: 'A'.repeat(4 * 1024 * 1024) }).expect(413);
  });
  it('rejects forged MIME types, noncanonical base64, and extra image fields', async () => {
    await send({ ...image, mimeType: 'image/jpeg' }).expect(400);
    await send({ mimeType: 'image/png', data: Buffer.from('<svg onload="alert(1)"/>').toString('base64') }).expect(400);
    await send({ ...image, data: image.data + '\n' }).expect(400);
    await send({ ...image, url: 'https://untrusted.example/image.png' }).expect(400);
    await send({ ...image, mimeType: 'image/svg+xml' }).expect(400);
  });
});

it('sends inline image bytes to Gemini without persisting them in cases', async () => {
  const trace = { items: [], add: jest.fn(), tool: jest.fn() };
  const cases = { trace: jest.fn().mockReturnValue(trace), save: jest.fn(), get: jest.fn() };
  const db = { nextId: jest.fn().mockResolvedValue('C-test') };
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Gambar terbaca.' }] } }] }), { status: 200 }));
  try {
    const llm = new LlmService({} as never, db as never, cases as never);
    const result = await llm.chat('Periksa foto', [], image);
    const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(payload.contents[0].parts).toEqual([{ inlineData: image }, { text: 'Periksa foto' }]);
    expect(result.reply).toBe('Gambar terbaca.');
    expect(JSON.stringify(cases.save.mock.calls)).not.toContain(image.data);
  } finally { fetch.mockRestore(); }
});

it('retains failed image analysis as a failed case and does not fall back to text-only diagnosis', async () => {
  const trace = { items: [], add: jest.fn(), tool: jest.fn() };
  const cases = { trace: jest.fn().mockReturnValue(trace), save: jest.fn() };
  const db = { nextId: jest.fn().mockResolvedValue('C-test') };
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 400 }));
  const key = CONFIG.GEMINI_API_KEY;
  CONFIG.GEMINI_API_KEY = 'test-key';
  try {
    const llm = new LlmService({} as never, db as never, cases as never);
    const agent = new AgentService(db as never, {} as never, cases as never, llm, {} as never, {} as never);
    await expect(agent.chat('Periksa foto', null, false, [], image)).rejects.toMatchObject({ status: 400 });
    expect(db.nextId).not.toHaveBeenCalled();
    await expect(agent.chat('Periksa foto', null, true, [], image)).rejects.toMatchObject({ status: 503 });
    expect(cases.save).toHaveBeenLastCalledWith('C-test', trace, 'gagal', { pump_id: null }, expect.objectContaining({ mode: 'llm' }));
  } finally { CONFIG.GEMINI_API_KEY = key; fetch.mockRestore(); }
});
