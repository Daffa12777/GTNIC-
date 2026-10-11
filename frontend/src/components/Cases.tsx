import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Case, Role } from '../types';
import { CaseBadge, Empty, RiskBadge, fmtTime, pct } from './ui';

const KIND: Record<string, string> = { reasoning: 'Penalaran', tool: 'Tool', decision: 'Keputusan', action: 'Tindakan' };

export function CaseDetail({ id, role, labels, flash, onChanged }: { id: string; role: Role; labels: Record<string, string>; flash: (m: string) => void; onChanged: () => void }) {
  const [c, setC] = useState<Case | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = () => api.getCase(id).then((d) => !stop && setC(d)).catch(() => {});
    setC(null); load();
    const t = setInterval(load, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [id]);

  if (!c) return <div className="card"><Empty>Memuat kasus…</Empty></div>;

  const act = async (fn: () => Promise<Case>, msg: string) => {
    setBusy(true);
    try { setC(await fn()); flash(msg); onChanged(); } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };
  const probs = c.probs ? Object.entries(c.probs).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
  const isSup = role === 'supervisor';

  return (
    <div className="grid">
      <div className="card">
        <div className="card-h">
          <div className="row wrap"><h3>{c.id}</h3><span className="sub">{c.pump_id ?? 'Beberapa unit'} · {fmtTime(c.created_at)}</span></div>
          <div className="row wrap"><CaseBadge status={c.status} /><RiskBadge risk={c.risk} />{c.mode === 'llm' && <span className="sub">mode LLM</span>}</div>
        </div>
        <div className="card-b grid">
          {c.summary && <div className="callout">{c.summary}</div>}

          {c.status === 'menunggu_klarifikasi' && c.question && (
            <div className="callout warn">
              <b>Agent bertanya</b>
              <div style={{ margin: '6px 0 10px' }}>{c.question}</div>
              <textarea className="textarea" placeholder="Tulis jawaban dari pengamatan di lapangan" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" disabled={busy || !text.trim()} onClick={() => act(() => api.answer(c.id, text), 'Jawaban diterima, agent menimbang ulang').then(() => setText(''))}>Kirim jawaban</button>
              </div>
            </div>
          )}

          {c.status === 'menunggu_persetujuan' && c.plan && (
            <div className="callout warn">
              <b>Menunggu keputusan supervisor</b>
              <dl className="kv" style={{ margin: '8px 0 10px' }}>
                <dt>Diagnosis</dt><dd>{labels[c.plan.fault] ?? c.plan.fault} ({pct(c.plan.confidence)})</dd>
                <dt>Risiko</dt><dd>{c.plan.risk}</dd>
                <dt>Dasar</dt><dd>{c.plan.citation}</dd>
                {c.plan.advice && <><dt>Saran tindakan</dt><dd>{c.plan.advice}</dd></>}
              </dl>
              <div className="row wrap">
                <button className="btn primary" disabled={busy || !isSup} onClick={() => act(() => api.approve(c.id), 'Disetujui: work order dibuat dan teknisi dijadwalkan')}>Setujui dan jalankan</button>
                <input className="input" style={{ maxWidth: 260 }} placeholder="Catatan penolakan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="btn danger" disabled={busy || !isSup} onClick={() => act(() => api.reject(c.id, note), 'Rekomendasi ditolak')}>Tolak</button>
              </div>
              {!isSup && <div className="sub" style={{ marginTop: 8 }}>Ubah peran ke Supervisor di bilah atas untuk menyetujui atau menolak.</div>}
            </div>
          )}

          {probs.length > 0 && (
            <div>
              <div className="sub" style={{ marginBottom: 8 }}>Hipotesis agent</div>
              <div className="comp">
                {probs.map(([k, v]) => (
                  <div className="comp-row" key={k}>
                    <div className="top"><span>{labels[k] ?? k}</span><span className="sub num">{pct(v)}</span></div>
                    <div className="bar"><i className="acc" style={{ width: `${Math.max(2, v * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h3>Jejak penalaran dan tindakan</h3><span className="sub">{c.trace?.length ?? 0} langkah</span></div>
        <div className="card-b">
          <ol className="timeline">
            {(c.trace ?? []).map((t) => (
              <li key={t.n}>
                <span className={`dot ${t.kind}`}>{t.n}</span>
                <div>
                  <div className="step-t"><span className="tag">{KIND[t.kind] ?? t.kind}</span>{t.title}</div>
                  {t.detail && <div className="step-d">{t.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function Cases({ role, labels, flash, selected, onSelect, onChanged }: { role: Role; labels: Record<string, string>; flash: (m: string) => void; selected: string | null; onSelect: (id: string) => void; onChanged: () => void }) {
  const [list, setList] = useState<Case[]>([]);
  useEffect(() => {
    let stop = false;
    const load = () => api.cases().then((d) => { if (!stop) { setList(d); if (!selected && d[0]) onSelect(d[0].id); } }).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="page">
      <div className="page-head"><div><h1>Kasus</h1><p>Setiap analisis agent tersimpan sebagai kasus lengkap dengan jejak langkahnya.</p></div></div>
      <div className="split">
        <div className="card">
          {list.length === 0 && <Empty>Belum ada kasus. Jalankan skenario demo atau analisis sebuah unit.</Empty>}
          {list.map((c) => (
            <div key={c.id} className={`list-item ${c.id === selected ? 'sel' : ''}`} onClick={() => onSelect(c.id)}>
              <div className="l1"><span className="id">{c.id} · {c.pump_id ?? '-'}</span><CaseBadge status={c.status} /></div>
              <div className="l2">{c.summary ?? '-'}</div>
            </div>
          ))}
        </div>
        {selected ? <CaseDetail id={selected} role={role} labels={labels} flash={flash} onChanged={onChanged} /> : <div className="card"><Empty>Pilih kasus di sebelah kiri.</Empty></div>}
      </div>
    </div>
  );
}
