import { useUrlFilters } from '../useUrlFilters';
import { useCallback, useState } from 'react';
import { api } from '../api';
import type { Case, Role } from '../types';
import { CASE, CaseBadge, Empty, RiskBadge, fmtTime, pct } from './ui';
import Pagination from './Pagination';
import SearchField from './SearchField';
import { useDebounced } from '../useDebounced';
import { RequestState, usePolling, errorMessage } from '../usePolling';

const KIND: Record<string, string> = { reasoning: 'Penalaran', tool: 'Tool', decision: 'Keputusan', action: 'Tindakan' };

export function CaseDetail({ id, role, labels, flash, onChanged, authenticated = false }: { id: string; role: Role; labels: Record<string, string>; flash: (m: string) => void; onChanged: () => void; authenticated?: boolean }) {
  const load = useCallback((signal: AbortSignal) => api.getCase(id, signal), [id]);
  const detail = usePolling(load, 30000, true, ['case', id]);
  const c = detail.data;
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!c) return <div className="card card-b"><RequestState {...detail} retry={detail.refresh} /></div>;

  const act = async (fn: () => Promise<Case>, msg: string) => {
    setBusy(true);
    try { await fn(); await detail.refresh(); flash(msg); onChanged(); return true; } catch (e: unknown) { flash(errorMessage(e)); return false; } finally { setBusy(false); }
  };
  const probs = c.probs ? Object.entries(c.probs).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
  const isSup = role === 'supervisor';

  return (
    <div className="grid">
      <RequestState {...detail} retry={detail.refresh} />
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
                <button className="btn primary" disabled={busy || !text.trim()} onClick={() => act(() => api.answer(c.id, text), 'Jawaban diterima, agent menimbang ulang').then((ok) => { if (ok) setText(''); })}>{busy ? 'Mengirim…' : 'Kirim jawaban'}</button>
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
              {!isSup && <div className="sub" style={{ marginTop: 8 }}>{authenticated ? 'Persetujuan atau penolakan harus dilakukan oleh akun supervisor.' : 'Ubah peran demo ke Supervisor di bilah atas untuk menyetujui atau menolak.'}</div>}
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

export default function Cases({ role, labels, flash, selected, onSelect, onChanged, authenticated = false }: { role: Role; labels: Record<string, string>; flash: (m: string) => void; selected: string | null; onSelect: (id: string) => void; onChanged: () => void; authenticated?: boolean }) {
  const [filters, updateFilters] = useUrlFilters({ q: '', status: '', page: 1, pageSize: 20 });
  const query = filters.q;
  const setQuery = (value: string) => updateFilters({ q: value, page: 1 }, true);
  const status = filters.status;
  const setStatus = (value: string) => updateFilters({ status: value, page: 1 });
  const page = filters.page;
  const setPage = (value: number) => updateFilters({ page: value });
  const pageSize = filters.pageSize;
  const setPageSize = (value: number) => updateFilters({ pageSize: value, page: 1 });
  const search = useDebounced(query);
  const load = useCallback((signal: AbortSignal) => api.casesPage(new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: search, status }), signal), [page, pageSize, search, status]);
  const result = usePolling(load, 30000, true, ['cases', page, pageSize, search, status]);
  const list = result.data?.items ?? [];

  return (
    <div className="page">
      <div className="page-head"><div><h1>Kasus</h1><p>Setiap analisis agent tersimpan sebagai kasus lengkap dengan jejak langkahnya.</p></div></div>
      <RequestState {...result} retry={result.refresh} />
      <div className="filters"><SearchField label="Cari kasus" value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ID, unit, atau ringkasan" pending={query !== search} /><label>Status<select className="sel" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Semua status</option>{Object.entries(CASE).map(([key, [, label]]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <Pagination page={page} pageSize={pageSize} total={result.data?.total ?? 0} loading={result.loading} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} />
      <div className="split">
        <div className="card">
          {result.data && list.length === 0 && <Empty>{query || status ? 'Tidak ada kasus yang cocok dengan filter.' : 'Belum ada kasus pada halaman ini.'}</Empty>}
          {list.map((c) => (
            <button key={c.id} className={`list-item ${c.id === selected ? 'sel' : ''}`} aria-pressed={c.id === selected} onClick={() => onSelect(c.id)}>
              <div className="l1"><span className="id">{c.id} · {c.pump_id ?? '-'}</span><CaseBadge status={c.status} /></div>
              <div className="l2">{c.summary ?? '-'}</div>
            </button>
          ))}
        </div>
        {selected ? <CaseDetail key={selected} id={selected} role={role} labels={labels} flash={flash} onChanged={onChanged} authenticated={authenticated} /> : <div className="card"><Empty>Pilih kasus untuk melihat diagnosis dan tindakan.</Empty></div>}
      </div>
    </div>
  );
}
