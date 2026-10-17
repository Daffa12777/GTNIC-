import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readChat, writeChat, clearChats } from '../src/chatSession';
import Chat from '../src/components/Chat';
afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); });
it('restores messages and drafts for the same account only and clears on logout', () => {
  writeChat('farras', { messages: [{ from: 'user', text: 'Periksa Pump-02', caseId: 'C-01' }], draft: 'draft', openCase: 'C-01' });
  expect(readChat('farras').messages[0].caseId).toBe('C-01');
  expect(readChat('mumtaz').messages).toHaveLength(0);
  clearChats(); expect(readChat('farras').messages).toHaveLength(0);
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
