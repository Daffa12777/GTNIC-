import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ChatMsg } from '../types';
import { CaseBadge, RiskBadge } from './ui';

const SUGGEST = ['Unit 3 oli cepat panas dan tekanan sulit naik', 'Unit 2 gerak aktuator tersendat', 'Urutan prioritas penanganan', 'Stok seal kit pompa'];

/** Penyaji teks jawaban: markdown ringan (judul, tebal, miring, kode, daftar, garis) tanpa pustaka tambahan. */
function inline(t: string, k = 0): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(t))) {
    if (m.index > last) out.push(t.slice(last, m.index));
    const x = m[0], key = `${k}-${i++}`;
    if (x.startsWith('**')) out.push(<strong key={key}>{inline(x.slice(2, -2), i)}</strong>);
    else if (x.startsWith('`')) out.push(<code key={key}>{x.slice(1, -1)}</code>);
    else out.push(<em key={key}>{inline(x.slice(1, -1), i)}</em>);
    last = m.index + x.length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

function Md({ text }: { text: string }) {
  const clean = text.replace(/\$\\(?:ge|geq)\$/g, '≥').replace(/\$\\(?:le|leq)\$/g, '≤').replace(/\$([^$\n]*)\$/g, '$1');
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>); para = []; } };
  for (const raw of clean.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const li = line.match(/^(\s*)([*-]|\d+\.)\s+(.*)$/);
    const h = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (!line.trim()) flush();
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); blocks.push(<hr key={blocks.length} />); }
    else if (h) { flush(); blocks.push(<h4 key={blocks.length}>{inline(h[1].replace(/^\*\*(.*)\*\*$/, '$1'))}</h4>); }
    else if (li) {
      flush();
      const lvl = Math.min(2, Math.floor(li[1].length / 2));
      const num = /\d/.test(li[2]);
      blocks.push(<div key={blocks.length} className="li" style={{ paddingLeft: 4 + lvl * 18 }}><span className="mk">{num ? li[2] : lvl ? '–' : '•'}</span><span>{inline(li[3])}</span></div>);
    } else para.push(line.trim());
  }
  flush();
  return <div className="md">{blocks}</div>;
}

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
      const r = await api.chat(m, openCase, useLlm, msgs.slice(1).map((x) => ({ from: x.from, text: x.text })));
      const warn = (r as any).llm_error ? `\n\n[Mode LLM gagal: ${(r as any).llm_error}. Jawaban ini dari mode biasa.]` : '';
      setMsgs((x) => [...x, { from: 'agent', text: r.reply + warn, case: r.case }]);
      setOpenCase(r.case && r.case.status === 'menunggu_klarifikasi' ? r.case.id : null);
      onChanged();
    } catch (e: any) {
      setMsgs((x) => [...x, { from: 'agent', text: `Terjadi kesalahan: ${e.message}` }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head"><div><h1>Asisten lapangan</h1><p>Laporan teknisi masuk ke kasus yang sama dengan anomali dari sensor.{useLlm ? ' Mode LLM aktif.' : ''}</p></div></div>
      <div className="card chat">
        <div className="msgs">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.from}`}>
              {m.from === 'agent' ? <Md text={m.text} /> : m.text}
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
          <input className="input" placeholder={openCase ? 'Jawab pertanyaan agent…' : 'Tulis keluhan atau pertanyaan…'} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" disabled={busy || !text.trim()}>Kirim</button>
        </form>
      </div>
    </div>
  );
}