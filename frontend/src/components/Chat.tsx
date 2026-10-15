import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ChatMsg } from '../types';
import { CaseBadge, RiskBadge } from './ui';
import { errorMessage } from '../usePolling';

const SUGGEST = ['Unit 3 oli cepat panas dan tekanan sulit naik', 'Unit 2 gerak aktuator tersendat', 'Urutan prioritas penanganan', 'Stok seal kit pompa'];

export default function Chat({ useLlm, onOpenCase, onChanged }: { useLlm: boolean; onOpenCase: (id: string) => void; onChanged: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { from: 'agent', text: 'Laporkan keluhan dari lapangan, misalnya "Unit 3 oli cepat panas". Saya akan membaca sensor, menjalankan model, mencari panduan, lalu bertanya, bertindak, atau meminta persetujuan sesuai tingkat keyakinan dan risiko.' },
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [openCase, setOpenCase] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const send = async (t: string) => {
    const m = t.trim();
    if (!m || busy) return;
    setText(''); setBusy(true);
    setMsgs((x) => [...x, { from: 'user', text: m }]);
    try {
      const r = await api.chat(m, openCase, useLlm);
      const warn = r.llm_error ? `\n\n[Mode LLM gagal: ${r.llm_error}. Jawaban ini dari mode biasa.]` : '';
      setMsgs((x) => [...x, { from: 'agent', text: r.reply + warn, case: r.case }]);
      setOpenCase(r.case && r.case.status === 'menunggu_klarifikasi' ? r.case.id : null);
      onChanged();
    } catch (e: unknown) {
      setText(m);
      setMsgs((x) => [...x, { from: 'agent', text: `Terjadi kesalahan: ${errorMessage(e)}` }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head"><div><h1>Asisten lapangan</h1><p>Laporan teknisi masuk ke kasus yang sama dengan anomali dari sensor.{useLlm ? ' Mode LLM aktif.' : ''}</p></div></div>
      <div className="card chat">
        <div className="msgs">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.from}`}>
              {m.text}
              {m.case && (
                <div style={{ marginTop: 8 }} className="row wrap">
                  <CaseBadge status={m.case.status} /><RiskBadge risk={m.case.risk} />
                  <button className="btn sm" onClick={() => onOpenCase(m.case!.id)}>Lihat jejak {m.case.id}</button>
                </div>
              )}
            </div>
          ))}
          {busy && <div className="msg agent sub">Agent bekerja…</div>}
          <div ref={end} />
        </div>
        <div className="chips">{SUGGEST.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input className="input" aria-label="Pesan untuk asisten" disabled={busy} placeholder={openCase ? 'Jawab pertanyaan agent…' : 'Tulis keluhan atau pertanyaan…'} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" disabled={busy || !text.trim()}>Kirim</button>
        </form>
      </div>
    </div>
  );
}
