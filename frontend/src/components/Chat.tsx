import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ChatMsg } from '../types';
import { CaseBadge, RiskBadge } from './ui';
import { errorMessage } from '../usePolling';
import Markdown from 'react-markdown';
import { readChat, writeChat } from '../chatSession';
import { useUnsavedChanges } from '../useUnsavedChanges';

const SUGGEST = ['Unit 3 oli cepat panas dan tekanan sulit naik', 'Unit 2 gerak aktuator tersendat', 'Urutan prioritas penanganan', 'Stok seal kit pompa'];

export default function Chat({ username, useLlm, onOpenCase, onChanged }: { username: string; useLlm: boolean; onOpenCase: (id: string) => void; onChanged: () => void }) {
  const [saved] = useState(() => readChat(username));
  const [msgs, setMsgs] = useState<ChatMsg[]>(saved.messages.length ? saved.messages : [
    { from: 'agent', text: 'Laporkan keluhan dari lapangan, misalnya "Unit 3 oli cepat panas". Saya akan membaca sensor, menjalankan model, mencari panduan, lalu bertanya, bertindak, atau meminta persetujuan sesuai tingkat keyakinan dan risiko.' },
  ]);
  const [text, setText] = useState(saved.draft);
  const [busy, setBusy] = useState(false);
  const [openCase, setOpenCase] = useState<string | null>(saved.openCase);
  const [storageFailed, setStorageFailed] = useState(false);
  // Chat stays mounted across tabs; warn on refresh only when its draft cannot be saved.
  useUnsavedChanges(busy || (storageFailed && !!text), false);
  const sending = useRef(false);
  useEffect(() => { setStorageFailed(!writeChat(username, { messages: msgs, draft: text, openCase })); }, [username, msgs, text, openCase]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const send = async (t: string) => {
    const m = t.trim();
    if (!m || sending.current) return;
    sending.current = true;
    setText(''); setBusy(true);
    setMsgs((x) => [...x, { from: 'user', text: m }]);
    try {
      const r = await api.chat(m, openCase, useLlm, msgs.slice(-8).map((item) => ({ from: item.from, text: item.text.slice(0, 1500) })));
      const warn = r.llm_error ? `\n\n[Mode LLM gagal: ${r.llm_error}. Jawaban ini dari mode biasa.]` : '';
      setMsgs((x) => [...x, { from: 'agent', text: r.reply + warn, case: r.case }]);
      setOpenCase(r.case && r.case.status === 'menunggu_klarifikasi' ? r.case.id : null);
      onChanged();
    } catch (e: unknown) {
      setText(m);
      setMsgs((x) => [...x, { from: 'agent', text: `Terjadi kesalahan: ${errorMessage(e)}` }]);
    } finally { sending.current = false; setBusy(false); }
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head"><div><h1>Asisten lapangan</h1><p>Laporan teknisi masuk ke kasus yang sama dengan anomali dari sensor.{useLlm ? ' Mode LLM aktif.' : ''}</p></div></div>
      <div className="row wrap"><span className="sub">Riwayat disimpan untuk sesi browser ini hingga logout (100 pesan terakhir).</span><button type="button" className="btn sm" disabled={busy} onClick={() => { if (window.confirm('Hapus riwayat percakapan sesi ini? Kasus dan work order tetap tersimpan.')) { setMsgs([]); setText(''); setOpenCase(null); } }}>Percakapan baru</button></div>
      {storageFailed && <div className="notice warn" role="status">Browser tidak mengizinkan penyimpanan riwayat. Percakapan hanya bertahan selama halaman terbuka.</div>}
      <div className="card chat">
        <div className="msgs">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.from}`}>
              {m.from === 'agent' ? <div className="markdown"><Markdown skipHtml components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{m.text}</Markdown></div> : m.text}
              {(m.case || m.caseId) && (
                <div style={{ marginTop: 8 }} className="row wrap">
                  {m.case && <><CaseBadge status={m.case.status} /><RiskBadge risk={m.case.risk} /></>}
                  <button className="btn sm" onClick={() => onOpenCase((m.case?.id ?? m.caseId)!)}>Lihat jejak {m.case?.id ?? m.caseId}</button>
                </div>
              )}
            </div>
          ))}
          {busy && <div className="msg agent sub">Agent bekerja…</div>}
          <div ref={end} />
        </div>
        <div className="chips">{SUGGEST.map((s) => <button key={s} className="chip" disabled={busy} onClick={() => send(s)}>{s}</button>)}</div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input className="input" aria-label="Pesan untuk asisten" maxLength={8000} disabled={busy} placeholder={openCase ? 'Jawab pertanyaan agent…' : 'Tulis keluhan atau pertanyaan…'} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" disabled={busy || !text.trim()}>Kirim</button>
        </form>
      </div>
    </div>
  );
}
