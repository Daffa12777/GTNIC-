import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readChat, writeChat, clearChats, retainChatMessages } from '../src/chatSession';
import Chat from '../src/components/Chat';
import { api } from '../src/api';
afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); });
it('restores messages and drafts for the same account only and clears on logout', () => {
  writeChat('farras', { messages: [{ from: 'user', text: 'Periksa Pump-02', caseId: 'C-01' }], draft: 'draft', openCase: 'C-01' });
  expect(readChat('farras').messages[0].caseId).toBe('C-01');
  expect(readChat('mumtaz').messages).toHaveLength(0);
  clearChats(); expect(readChat('farras').messages).toHaveLength(0);
});
it('bounds in-memory history while preserving text and names for retired image previews', () => {
  const messages = Array.from({ length: 110 }, (_, i) => ({ from: 'user' as const, text: `Laporan ${i}`, imageName: `foto-${i}.png`, image: { mimeType: 'image/png', data: `image-${i}` } }));
  const kept = retainChatMessages(messages);
  expect(kept).toHaveLength(100);
  expect(kept[0]).toMatchObject({ text: 'Laporan 10', imageName: 'foto-10.png', image: undefined });
  expect(kept.filter(m => m.image).map(m => m.imageName)).toEqual(['foto-107.png', 'foto-108.png', 'foto-109.png']);
  expect(messages[10].image.data).toBe('image-10');
});
it('keeps a completed LLM case as context for the next question', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const current = { id: 'C-01', pump_id: 'Pump-01', status: 'selesai_llm', fault: null, confidence: null, risk: null, summary: 'Selesai', created_at: 1, mode: 'llm' };
  const chat = vi.spyOn(api, 'chat').mockResolvedValueOnce({ reply: 'Jawaban pertama', case: current }).mockResolvedValueOnce({ reply: 'Jawaban lanjutan', case: current });
  render(<Chat username="farras" useLlm onOpenCase={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Pesan untuk asisten'), { target: { value: 'Periksa Pump-01' } });
  fireEvent.click(screen.getByText('Kirim'));
  await screen.findByText('Jawaban pertama');
  fireEvent.change(screen.getByLabelText('Pesan untuk asisten'), { target: { value: 'Kenapa begitu?' } });
  fireEvent.click(screen.getByText('Kirim'));
  await screen.findByText('Jawaban lanjutan');
  expect(chat.mock.calls[1][1]).toBe('C-01');
  expect(readChat('farras').openCase).toBe('C-01');
});
it('renders safe markdown from a restored answer and keeps the draft', () => {
  Element.prototype.scrollIntoView = vi.fn();
  writeChat('farras', { messages: [{ from: 'agent', text: '**Periksa oli**\n\n<script>alert(1)</script>\n\n[Tautan](javascript:alert(1))' }], draft: 'Lanjutkan', openCase: null });
  const view = render(<Chat username="farras" useLlm={false} onOpenCase={vi.fn()} onChanged={vi.fn()} />);
  expect(screen.getByText('Periksa oli').tagName).toBe('STRONG');
  expect((screen.getByLabelText('Pesan untuk asisten') as HTMLInputElement).value).toBe('Lanjutkan');
  expect(view.container.querySelector('script')).toBeNull();
  expect(view.container.querySelector('a')?.getAttribute('href')).not.toMatch(/^javascript:/);
});
