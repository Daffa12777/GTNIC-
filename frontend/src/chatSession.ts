import type { ChatMsg } from './types';
export interface ChatSession { messages: ChatMsg[]; draft: string; openCase: string | null }
export const chatKey = (username: string): string => `mm_chat:${encodeURIComponent(username)}`;
export function readChat(username: string): ChatSession {
  const fallback: ChatSession = { messages: [], draft: '', openCase: null };
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(chatKey(username)) ?? 'null');
    if (!value || typeof value !== 'object' || !('messages' in value) || !Array.isArray(value.messages)) return fallback;
    const messages: ChatMsg[] = [];
    for (const item of value.messages.slice(-100)) {
      if (item && typeof item === 'object' && 'from' in item && (item.from === 'user' || item.from === 'agent') && 'text' in item && typeof item.text === 'string') messages.push({ from: item.from, text: item.text.slice(0, 16000), caseId: 'caseId' in item && typeof item.caseId === 'string' ? item.caseId : undefined });
    }
    return { messages, draft: 'draft' in value && typeof value.draft === 'string' ? value.draft.slice(0, 8000) : '', openCase: 'openCase' in value && typeof value.openCase === 'string' ? value.openCase : null };
  } catch { return fallback; }
}
export function writeChat(username: string, session: ChatSession): boolean {
  try { sessionStorage.setItem(chatKey(username), JSON.stringify({ ...session, messages: session.messages.slice(-100).map((item) => ({ from: item.from, text: item.text.slice(0, 16000), caseId: item.case?.id ?? item.caseId })) })); return true; } catch { return false; }
}
export function clearChats(): void {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith('mm_chat:')) sessionStorage.removeItem(key); } catch { /* Storage may be disabled by browser policy. */ }
}
