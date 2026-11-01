import { useUrlFilters } from '../useUrlFilters';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Case, Overview, Role } from '../types';
import { CASE, CaseBadge, Empty, RiskBadge, StateBadge, fmtTime, pct } from './ui';
import Pagination from './Pagination';
import SearchField from './SearchField';
import { useDebounced } from '../useDebounced';
import { RequestState, usePolling, errorMessage } from '../usePolling';
import { useUnsavedChanges } from '../useUnsavedChanges';

const KIND: Record<string, string> = { reasoning: 'Penalaran', tool: 'Tool', decision: 'Keputusan', action: 'Tindakan' };
const QUICK_FILTERS = [['keputusan', 'Perlu keputusan'], ['eskalasi', 'Eskalasi'], ['dijalankan', 'Dijalankan'], ['selesai', 'Selesai']] as const;
function caseAge(ts: number | null | undefined) {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return 'waktu tidak tersedia';
  const minutes = Math.max(0, Math.floor((Date.now() / 1000 - ts) / 60));
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} jam lalu`;
  return `${Math.floor(minutes / 1440)} hari lalu`;
}

export function CaseDetail({ id, role, labels, flash, onChanged, overview, updated, onOpenUnit, onSelectCase, authenticated = false }: { id: string; role: Role; labels: Record<string, string>; flash: (m: string) => void; onChanged: () => void; overview?: Overview | null; updated?: number | null; onOpenUnit?: (id: string) => void; onSelectCase?: (id: string) => void; authenticated?: boolean }) {
  const load = useCallback((signal: AbortSignal) => api.getCase(id, signal), [id]);
  const detail = usePolling(load, 30000, true, ['case', id]);
  const c = detail.data;
  const loadContext = useCallback((signal: AbortSignal) => api.caseContext(id, signal), [id]);
  const context = usePolling(loadContext, 30000, !!c?.pump_id, ['case-context', id], 0);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const decisionRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (decision) decisionRef.current?.focus(); }, [decision]);
  useUnsavedChanges(!!text || !!note || busy);

  if (!c) return <div className="card card-b"><RequestState {...detail} retry={detail.refresh} /></div>;

  const act = async (fn: () => Promise<Case>, msg: string | ((result: Case) => string)) => {
    setBusy(true); setActionError('');
    try { const result = await fn(); if (decision && result.status === 'gagal') { setActionError(result.summary ?? 'Tindakan belum berhasil. Periksa detail kasus.'); await detail.refresh(); onChanged(); return false; } setText(''); setNote(''); setDecision(null); await detail.refresh(); flash(typeof msg === 'function' ? msg(result) : msg); onChanged(); return true; } catch (e: unknown) { if (decision) setActionError(errorMessage(e)); else flash(errorMessage(e)); return false; } finally { setBusy(false); }
  };
  const probs = c.probs ? Object.entries(c.probs).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
  const isSup = role === 'supervisor';
  const highRisk = c.risk === 'tinggi' || c.plan?.risk === 'tinggi';
  const current = overview?.pumps.find((pump) => pump.id === c.pump_id);
  const evidence = (c.trace ?? []).filter((item) => item.title === 'Perbandingan dengan kondisi sehat' || item.tool === 'check_sensor_validity' || item.tool === 'get_sensor_data').filter((item) => item.detail || item.result).slice(0, 3);
  const preview = context.data?.preview;
  const hypotheses = probs.length > 0 && <section aria-label="Hipotesis diagnosis"><b>Perbandingan hipotesis</b><div className="comp">{probs.map(([k, v]) => <div className="comp-row" key={k}><div className="top"><span>{labels[k] ?? k}</span><span className="num">{pct(v)}</span></div><div className="bar"><i className="acc" style={{ width: `${Math.max(2, v * 100)}%` }} /></div></div>)}</div><p className="sub">Angka keyakinan belum dikalibrasi pada mesin nyata. Perbedaan kecil perlu diperiksa dengan bukti lapangan.</p></section>;
  const relatedInfo = c.pump_id && <section className="case-related"><h4>Kasus terkait dan work order</h4>{context.error ? <p role="alert">Data terkait tidak tersedia. <button className="btn sm" onClick={() => void context.refresh()}>Coba lagi</button></p> : !context.data ? <p>Memuat data terkait…</p> : <>{context.data.orders.length ? <ul>{context.data.orders.map((order) => <li key={order.id}><b>{order.id}</b> · {order.title} · {order.status} · {order.technician ?? 'belum ada teknisi'}{order.scheduled_at ? ` · ${order.scheduled_at}` : ''}</li>)}</ul> : <p>Tidak ada work order aktif yang ditemukan.</p>}{context.data.related.length ? <ul>{context.data.related.map((related) => <li key={related.id}>{onSelectCase ? <button className="link-button" onClick={() => onSelectCase(related.id)}>{related.id}</button> : related.id} · {labels[related.fault ?? ''] ?? related.fault ?? 'diagnosis belum tersedia'} · {CASE[related.status]?.[1] ?? related.status} · {caseAge(related.created_at)}</li>)}</ul> : <p>Tidak ada kasus terkait yang ditemukan.</p>}{context.data.recent_closed.length > 0 && <details><summary>Pekerjaan selesai atau dibatalkan ({context.data.recent_closed.length})</summary><ul>{context.data.recent_closed.map((order) => <li key={order.id}><b>{order.id}</b> · {order.title} · {order.status} · {order.technician ?? 'teknisi tidak tersedia'}</li>)}</ul></details>}<p className="sub">Maksimal 10 kasus, 50 work order aktif, dan 10 pekerjaan selesai/dibatalkan terbaru untuk unit ini.</p></>}</section>;

  return (
    <div className="grid">
      <RequestState {...detail} retry={detail.refresh} showUpdated={false} />
      {actionError && c.status !== 'menunggu_persetujuan' && <div className="notice bad" role="alert">{actionError}</div>}
      {(text || note) && <div className="notice warn" role="status">Ada jawaban atau catatan yang belum dikirim.</div>}
      <div className="card">
        <div className="card-h">
          <div className="row wrap"><h3>{c.id}</h3><span className="sub">{c.pump_id ?? 'Beberapa unit'} · {fmtTime(c.created_at)} · {caseAge(c.created_at)}</span></div>
          <div className="row wrap"><CaseBadge status={c.status} /><RiskBadge risk={c.risk} />{c.mode === 'llm' && <span className="sub">mode LLM</span>}</div>
        </div>
        <div className="card-b grid">
          {c.summary && c.status !== 'menunggu_persetujuan' && <div className="callout">{c.summary}</div>}
          {c.pump_id && <div className="case-current"><b>Status unit terakhir:</b> {current ? <StateBadge state={current.status.state} /> : 'Belum tersedia'}{updated != null && <span className="sub"> · data diterima {new Date(updated).toLocaleTimeString('id-ID')}</span>}{onOpenUnit && <button className="btn sm" onClick={() => onOpenUnit(c.pump_id!)}>Lihat detail unit</button>}</div>}

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
              <p className="sub">Kasus dibuat {caseAge(c.created_at)} ({fmtTime(c.created_at)}). Kondisi sensor saat ini dapat berubah; periksa unit sebelum mengambil keputusan.</p>
              <dl className="kv" style={{ margin: '8px 0 10px' }}>
                <dt>Diagnosis</dt><dd>{labels[c.plan.fault] ?? c.plan.fault} ({pct(c.plan.confidence)})</dd>
                <dt>Risiko</dt><dd>{c.plan.risk}</dd>
                <dt>Dasar</dt><dd>{c.plan.citation}</dd>
                {c.plan.advice && <><dt>Saran tindakan</dt><dd>{c.plan.advice}</dd></>}
              </dl>
              {hypotheses}
              {!probs.length && <p className="sub">Angka keyakinan belum dikalibrasi pada mesin nyata; periksa bukti lapangan sebelum memutuskan.</p>}
              {c.mode === 'policy' && <p className="sub">Pada aturan policy, keyakinan di bawah 50% dapat memicu eskalasi; risiko dan gangguan majemuk juga memengaruhi keputusan.</p>}
              {c.plan.advice && /\bLOTO\b/i.test(c.plan.advice) && <p className="sub">LOTO: penguncian dan penandaan sumber energi sebelum pekerjaan.</p>}
              {c.plan.advice && /spool/i.test(c.plan.advice) && <p className="sub">Spool adalah bagian katup yang bergerak untuk mengatur aliran.</p>}
              <section className="case-evidence" aria-label="Bukti saat diagnosis"><b>Bukti saat diagnosis</b>{evidence.length ? evidence.map((item) => <p key={item.n}>{item.detail || item.result}</p>) : <p>Rincian sensor saat diagnosis tidak tersedia di jejak kasus ini.</p>}</section>
              <section className="case-impact" aria-label="Rencana setelah persetujuan"><b>Rencana setelah persetujuan</b>
                {context.error ? <p role="alert">Rencana dan data terkait tidak dapat dimuat. <button className="btn sm" onClick={() => void context.refresh()}>Coba lagi</button></p> : !context.data ? <p>Memuat rencana dan data terkait…</p> : !preview ? <p>Rencana tindakan tidak tersedia untuk kasus ini.</p> : <><p>Work order: {preview.title} · prioritas rencana {preview.priority}{preview.existing_order ? ` · gunakan ${preview.existing_order} yang masih aktif` : ' · dibuat jika belum ada yang sama'}.</p><p>Part: {preview.part ?? 'tidak ditentukan'}{preview.part ? preview.inventory_found ? ` · stok ${preview.stock}` : ' · tidak ditemukan di inventaris' : ''}. {preview.part && (preview.stock == null || preview.stock <= 0) ? 'Sistem akan mencoba mengajukan pembelian.' : ''}</p><p>Teknisi: {preview.senior ? 'senior' : `keahlian ${preview.skill}`} dipilih saat dijalankan jika work order belum memiliki teknisi; bila tidak tersedia, work order tetap terbuka.</p><p className="sub">{context.updated ? `Data diperiksa ${new Date(context.updated).toLocaleTimeString('id-ID')}. ` : ''}Stok dan ketersediaan dapat berubah sebelum tindakan dijalankan.</p></>}
              </section>
              {relatedInfo}
              <div className="case-action-bar row wrap">
                <button className="btn primary" disabled={busy || !isSup || !preview || !!context.error} onClick={() => { setActionError(''); setDecision('approve'); void context.refresh(); }}>Tinjau persetujuan</button>
                <button className="btn danger" disabled={busy || !isSup} onClick={() => { setActionError(''); setDecision('reject'); }}>Tolak</button>
              </div>
              {decision === 'approve' && <div ref={decisionRef} tabIndex={-1} className="case-confirm" role="region" aria-label="Konfirmasi persetujuan"><b>Konfirmasi persetujuan</b>{preview && <><p>{preview.title} · prioritas rencana {preview.priority}{preview.existing_order ? ` · gunakan ${preview.existing_order}` : ' · buat atau gunakan work order aktif'}.</p><p>Part: {preview.part ?? 'tidak ditentukan'}{preview.part ? preview.inventory_found ? ` · stok ${preview.stock}` : ' · tidak ditemukan' : ''}. Teknisi {preview.senior ? 'senior' : preview.skill} ditentukan saat tindakan dijalankan bila belum ditugaskan.</p></>}<p className="sub">Periksa kembali kondisi unit; stok dan ketersediaan dapat berubah.</p>{actionError && <p className="form-error" role="alert">{actionError}</p>}<div className="row wrap"><button className="btn primary" disabled={busy || !preview || !!context.error || context.loading} onClick={() => act(() => api.approve(c.id), (result) => result.status === 'disetujui_dijalankan' ? 'Persetujuan diproses. Lihat hasil tindakan pada kasus.' : result.summary ?? 'Tindakan belum berhasil. Periksa detail kasus.')}>{busy ? 'Memproses…' : 'Setujui dan jalankan'}</button><button className="btn" disabled={busy} onClick={() => { setActionError(''); setDecision(null); }}>Batal</button></div></div>}
              {decision === 'reject' && <div ref={decisionRef} tabIndex={-1} className="case-confirm" role="region" aria-label="Alasan penolakan"><label className="field">Alasan penolakan {highRisk ? '(wajib)' : '(opsional)'}<textarea className="textarea" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></label>{actionError && <p className="form-error" role="alert">{actionError}</p>}<div className="row wrap"><button className="btn danger" disabled={busy || (highRisk && !note.trim())} onClick={() => act(() => api.reject(c.id, note), 'Rekomendasi ditolak')}>{busy ? 'Memproses…' : 'Konfirmasi penolakan'}</button><button className="btn" disabled={busy} onClick={() => { setActionError(''); setDecision(null); setNote(''); }}>Batal</button></div></div>}
              {!isSup && <div className="sub" style={{ marginTop: 8 }}>{authenticated ? 'Persetujuan atau penolakan harus dilakukan oleh akun supervisor.' : 'Ubah peran demo ke Supervisor di bilah atas untuk menyetujui atau menolak.'}</div>}
            </div>
          )}

          {c.status !== 'menunggu_persetujuan' && hypotheses}
          {c.status === 'dieskalasi' && <p>Kasus memerlukan pemeriksaan teknisi senior. Periksa work order terkait di bawah untuk penanggung jawab dan jadwal; jika belum ada, koordinasikan dengan supervisor.</p>}
          {c.status !== 'menunggu_persetujuan' && relatedInfo}
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

export default function Cases({ role, labels, flash, selected, onSelect, onClear, onChanged, overview, updated, onOpenUnit, authenticated = false }: { role: Role; labels: Record<string, string>; flash: (m: string) => void; selected: string | null; onSelect: (id: string) => void; onClear: () => void; onChanged: () => void; overview?: Overview | null; updated?: number | null; onOpenUnit?: (id: string) => void; authenticated?: boolean }) {
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
  useEffect(() => {
    if (selected && window.matchMedia?.('(max-width: 1000px)').matches) window.scrollTo({ top: 0 });
  }, [selected]);

  return (
    <div className={`page cases-page${selected ? ' case-selected' : ''}`}>
      <div className="page-head"><div><h1>Kasus</h1><p>Setiap analisis agent tersimpan sebagai kasus lengkap dengan jejak langkahnya.</p></div></div>
      <div aria-label="Kesegaran daftar kasus"><span className="sub">Daftar kasus</span><RequestState {...result} retry={result.refresh} /></div>
      {selected && <button type="button" className="btn mobile-case-back" onClick={onClear}>← Kembali ke daftar kasus</button>}
      <div className="case-list-controls">
        <div className="case-quick-filters" role="group" aria-label="Filter cepat kasus">{QUICK_FILTERS.map(([key, title]) => <button key={key} className="btn sm" aria-pressed={status === `group:${key}`} onClick={() => setStatus(status === `group:${key}` ? '' : `group:${key}`)}>{title}{result.data?.counts ? ` (${result.data.counts[key] ?? 0})` : ''}</button>)}</div>
        <div className="filters"><SearchField label="Cari kasus" value={query} onChange={(value) => { setQuery(value); }} placeholder="ID, unit, atau ringkasan" pending={query !== search} /><label>Status<select className="sel" value={status} onChange={(e) => { setStatus(e.target.value); }}><option value="">Semua status</option>{QUICK_FILTERS.map(([key, title]) => <option key={key} value={`group:${key}`}>{title}</option>)}{Object.entries(CASE).map(([key, [, label]]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        {(page > 1 || (result.data?.total ?? 0) > pageSize) && <Pagination page={page} pageSize={pageSize} total={result.data?.total ?? 0} loading={result.loading} onPage={setPage} onPageSize={(size) => { setPageSize(size); }} />}
      </div>
      <div className="split">
        <div className="card cases-list">
          {result.data && list.length === 0 && <Empty>{query || status ? 'Tidak ada kasus yang cocok dengan filter.' : 'Belum ada kasus pada halaman ini.'}</Empty>}
          {list.map((c) => (
            <button key={c.id} className={`list-item ${c.id === selected ? 'sel' : ''}`} aria-pressed={c.id === selected} onClick={() => onSelect(c.id)}>
              <div className="l1"><span className="id">{c.id} · {c.pump_id ?? '-'}</span><CaseBadge status={c.status} /></div>
              <div className="l2">{labels[c.fault ?? ''] ?? c.fault ?? 'Diagnosis belum tersedia'} · {caseAge(c.created_at)}</div>
            </button>
          ))}
        </div>
        {selected ? <CaseDetail key={selected} id={selected} role={role} labels={labels} overview={overview} updated={updated} onOpenUnit={onOpenUnit} onSelectCase={onSelect} flash={flash} onChanged={onChanged} authenticated={authenticated} /> : <div className="card"><Empty>Pilih kasus untuk melihat diagnosis dan tindakan.</Empty></div>}
      </div>
    </div>
  );
}
