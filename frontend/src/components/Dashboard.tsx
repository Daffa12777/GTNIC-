import { useUrlFilters } from '../useUrlFilters';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Overview, Pump, ReadingsResp } from '../types';
import { RequestState, usePolling, errorMessage } from '../usePolling';
import SensorChart from './SensorChart';
import { useDebounced } from '../useDebounced';
import SearchField from './SearchField';
import { Badge, CASE, Empty, StateBadge, fmtTime, pct } from './ui';

const FAULTS: [string, string][] = [['pump', 'Kebocoran pompa'], ['valve', 'Katup lambat'], ['cooler', 'Pendingin'], ['accumulator', 'Akumulator']];

function Health({ data, labels }: { data: ReadingsResp; labels: Record<string, string> }) {
  const comps = data.status?.components;
  if (!comps) return <Empty>Belum ada hasil analisis ML.</Empty>;
  return (
    <div className="comp">
      {Object.entries(comps).map(([k, c]) => {
        const meta = data.components[k];
        const sev = c.severity;
        const tone = sev >= 1 ? 'bad' : sev > 0 ? 'warn' : '';
        return (
          <div className="comp-row" key={k}>
            <div className="top">
              <span className="name">{meta?.name ?? k}</span>
              <span className="sub">{meta?.meaning[String(c.level)] ?? c.level} · {pct(c.confidence)}</span>
            </div>
            <div className="bar"><i className={tone} style={{ width: `${Math.max(4, c.p_degraded * 100)}%` }} /></div>
          </div>
        );
      })}
      <div className="sub">Bilah menunjukkan peluang komponen sudah menurun menurut model. Dugaan utama: <b>{labels[data.status?.label ?? 'normal'] ?? data.status?.label}</b>.</div>
    </div>
  );
}

export default function Dashboard({ ov, canManage, selected, onSelect, onOpenCase, onBack, flash, refresh }: { ov: Overview; canManage: boolean; selected: string | null; onSelect: (id: string) => void; onOpenCase: (id: string) => void; onBack?: () => void; flash: (m: string) => void; refresh: () => void }) {
  const sel = selected ?? ov.pumps[0]?.id ?? '';
  const loadReadings = useCallback((signal: AbortSignal) => api.readings(sel, 60, signal), [sel]);
  const readings = usePolling(loadReadings, Math.max(10000, ov.tick_seconds * 1000), !!sel, ['readings', sel, 60], 10000);
  const data = readings.data;
  const cases = usePolling(api.cases, 30000, true, ['cases', 'all']);
  const workOrders = usePolling(api.workOrders, 30000, true, ['work-orders', 'all']);
  const [filters, updateFilters] = useUrlFilters({ q: '', status: '' });
  const query = filters.q;
  const setQuery = (value: string) => updateFilters({ q: value }, true);
  const search = useDebounced(query);
  const state = filters.status;
  const setState = (value: string) => updateFilters({ status: value });
  const [busy, setBusy] = useState(false);
  const [faultPump, setFaultPump] = useState('Pump-02');
  const [fault, setFault] = useState('cooler');
  const [sudden, setSudden] = useState(false);
  const [triageResult, setTriageResult] = useState<Awaited<ReturnType<typeof api.triage>> | null>(null);

  const count = (s: string) => ov.pumps.filter((p) => p.status.state === s).length;
  const assessed = ov.pumps.filter((p) => ['normal', 'waspada', 'kritis'].includes(p.status.state)).length;
  const unassessed = ov.pumps.length - assessed;
  const openCases = ov.pumps.filter((p) => p.open_case).length;
  const pump: Pump | undefined = ov.pumps.find((p) => p.id === sel);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (selected) heading.current?.focus(); }, [selected]);
  const pendingCases = cases.data?.filter((c) => ['menunggu_persetujuan', 'menunggu_klarifikasi'].includes(c.status)) ?? [];
  const visiblePumps = ov.pumps.filter((p) => (!state || p.status.state === state) && `${p.id} ${p.name} ${p.location}`.toLowerCase().includes(search.toLowerCase()));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); flash(ok); refresh(); void readings.refresh(); void cases.refresh(); void workOrders.refresh(); } catch (e: unknown) { flash(errorMessage(e)); } finally { setBusy(false); }
  };

  if (!ov.pumps.length) return <div className="page"><h1>Ringkasan unit</h1><div className="card" style={{ marginTop: 16 }}><Empty>Belum ada unit terdaftar. Hubungi supervisor untuk menyiapkan daftar unit yang akan dipantau.</Empty></div></div>;

  return (
    <div className="page">
      {selected && <div className="page-head"><div><button type="button" className="link-button" onClick={onBack}>← Kembali ke peta</button><h1 ref={heading} tabIndex={-1}>{pump ? `${pump.id} · ${pump.name}` : 'Unit tidak ditemukan'}</h1>{pump && <p>{pump.location} · {pump.model} · <StateBadge state={pump.status.state} /></p>}</div></div>}
      <details className="fleet-overview" open={selected ? undefined : true}><summary>Ringkasan seluruh unit dan tindakan</summary>
      <div className="page-head">
        <div>
          <h1>Ringkasan unit</h1>
          <p>Status tiap unit tenaga hidrolik dari pembacaan sensor, dianalisis model ML dan agent.</p>
        </div>
        <div className="overview-action">
          <button className="btn primary" disabled={busy} onClick={() => run(async () => { setTriageResult(null); setTriageResult(await api.triage()); }, 'Analisis prioritas selesai')}>
            {busy ? 'Sedang memproses…' : 'Analisis unit prioritas'}
          </button>
          <span className="sub">Menganalisis unit yang perlu perhatian. Agent dapat membuat kasus dan tindakan sesuai aturan risiko.</span>
        </div>
      </div>

      {!ov.ml.ok && <div className="notice bad">Layanan ML tidak dapat dihubungi: {ov.ml.error}. Diagnosis tidak dapat berjalan sampai layanan aktif.</div>}
      {ov.ml.ok && ov.ml.source === 'demo_synthetic' && <div className="notice warn">Mode demo: analisis memakai model yang dilatih dari data sintetis.</div>}

      <div className="overview-summary">
        <div><strong>Kondisi unit saat ini</strong><span>{assessed} dari {ov.pumps.length} unit dapat dinilai{unassessed > 0 ? ` · ${unassessed} belum dapat dinilai` : ''}</span></div>
        <span className="sub">Berdasarkan pembacaan sensor dan analisis terbaru.</span>
      </div>

      <div className="grid stats">
        <div className="card stat"><div className="k">Normal</div><div className="v num">{assessed ? count('normal') : '—'}</div></div>
        <div className="card stat"><div className="k">Waspada</div><div className="v num" style={{ color: count('waspada') ? 'var(--warn)' : undefined }}>{assessed ? count('waspada') : '—'}</div></div>
        <div className="card stat"><div className="k">Kritis</div><div className="v num" style={{ color: count('kritis') ? 'var(--bad)' : undefined }}>{assessed ? count('kritis') : '—'}</div></div>
        <div className="card stat"><div className="k">Kasus terbuka</div><div className="v num">{openCases}</div></div>
      </div>

      {triageResult && <section className="card triage-result" aria-live="polite" aria-labelledby="triage-result-title">
        <div className="card-h"><h3 id="triage-result-title">Hasil analisis prioritas</h3><span className="sub">{triageResult.cases.length} unit diproses</span></div>
        <div className="card-b">
          {triageResult.cases.length === 0 ? <p>Tidak ada unit yang memerlukan analisis prioritas saat ini.</p> : triageResult.cases.map((result) => <div className="attention-row" key={result.pump_id}>
            <div><b>{result.pump_id}</b><div className="sub">{result.status ? CASE[result.status]?.[1] ?? result.status : 'Status kasus belum tersedia'}</div></div>
            {result.case_id && <button className="btn sm" onClick={() => onOpenCase(result.case_id!)}>Lihat kasus {result.case_id}</button>}
          </div>)}
        </div>
      </section>}

      <section className="card attention" aria-labelledby="attention-title">
        <div className="card-h"><div><h3 id="attention-title">Perlu tindakan</h3><span className="sub">Keputusan yang menunggu dan unit yang perlu diperiksa</span></div></div>
        <div className="card-b">
          <RequestState {...cases} retry={cases.refresh} />
          {pendingCases.map((c) => {
            const current = ov.pumps.find((p) => p.id === c.pump_id);
            return <div className="attention-row" key={c.id}><div>
              <b>{c.pump_id ?? 'Unit'} · {c.status === 'menunggu_persetujuan' ? 'Menunggu persetujuan supervisor' : 'Menunggu jawaban teknisi'}</b>
              <div className="sub">Kasus {c.id} · Dibuat {fmtTime(c.created_at)}</div>
              <div className="attention-summary">{c.summary}</div>
              {current && <div className="sub">Kondisi unit saat ini: <StateBadge state={current.status.state} /></div>}
            </div><button className="btn sm" onClick={() => onOpenCase(c.id)}>{c.status === 'menunggu_persetujuan' ? 'Tinjau persetujuan' : 'Jawab pertanyaan'} <span className="sr-only">{c.id}</span></button></div>;
          })}
          {ov.pumps.filter((p) => ['kritis', 'sensor', 'ml_error'].includes(p.status.state) && !pendingCases.some((c) => c.id === p.open_case)).map((p) => <div className="attention-row" key={p.id}><div><b>{p.id} · {p.name}</b> <StateBadge state={p.status.state} /></div><button className="btn sm" onClick={() => p.open_case ? onOpenCase(p.open_case) : onSelect(p.id)}>Periksa unit</button></div>)}
          {cases.data && !cases.data.some((c) => ['menunggu_persetujuan', 'menunggu_klarifikasi'].includes(c.status)) && !ov.pumps.some((p) => ['kritis', 'sensor', 'ml_error'].includes(p.status.state)) && <Empty>Tidak ada tindakan mendesak.</Empty>}
        </div>
      </section>
      <div className="filters"><SearchField label="Cari unit" value={query} onChange={(value) => { setQuery(value); }} placeholder="ID, nama, atau lokasi" pending={query !== search} /><label>Status<select className="sel" value={state} onChange={(e) => setState(e.target.value)}><option value="">Semua status</option>{[['normal', 'Normal'], ['waspada', 'Waspada'], ['kritis', 'Kritis'], ['sensor', 'Sensor bermasalah'], ['ml_error', 'ML tidak tersedia'], ['tidak ada data', 'Tidak ada data']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <div className="card" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Unit</th><th>Nama</th><th>Kritikalitas</th><th>Status</th><th>Dugaan model</th><th>Keyakinan</th><th>WO terbuka</th></tr></thead>
          <tbody>
            {visiblePumps.map((p) => (
              <tr key={p.id} className={p.id === sel ? 'sel' : ''}>
                <td className="id"><button className="link-button" aria-pressed={p.id === sel} onClick={() => onSelect(p.id)}>{p.id}</button></td>
                <td>{p.name}<div className="sub">{p.location}</div></td>
                <td>{p.criticality}</td>
                <td><StateBadge state={p.status.state} /></td>
                <td>{p.status.label && p.status.label !== 'sensor' ? ov.fault_labels[p.status.label] ?? p.status.label : '-'}</td>
                <td className="num">{pct(p.status.confidence)}</td>
                <td className="num">{p.open_work_orders || '-'}</td>
              </tr>
            ))}
            {visiblePumps.length === 0 && <tr><td colSpan={7}><Empty>Tidak ada unit yang cocok dengan pencarian atau status ini.</Empty></td></tr>}
          </tbody>
        </table>
      </div>

      </details>

      {selected && !pump && <div className="notice bad">Unit tidak ditemukan. <button className="btn sm" onClick={() => ov.pumps[0] && onSelect(ov.pumps[0].id)}>Pilih unit tersedia</button></div>}
      {pump && <div id="detail-unit"><RequestState {...readings} retry={readings.refresh} /></div>}
      {pump && data && (
        <div className="grid unit-detail">
          <div className="card">
            <div className="card-h">
              <div><h3>{pump.id} · {pump.name}</h3><div className="sub">Grafik 60 siklus terakhir. Garis putus-putus = rata-rata kondisi sehat.</div>{pump.open_case && <div className="sub">Kasus {pump.open_case} masih terbuka; diagnosis sebelumnya dapat berbeda dari kondisi sensor saat ini.</div>}</div>
              <div className="row">
                {pump.open_case && <button className="btn sm" onClick={() => onOpenCase(pump.open_case!)}>Buka kasus {pump.open_case}</button>}
                <button className="btn sm primary" disabled={busy || !!pump.open_case}
                  onClick={() => run(async () => { const c = await api.diagnose(pump.id, '', false); onOpenCase(c.id); }, 'Analisis selesai')}>
                  Analisis unit ini
                </button>
              </div>
            </div>
            <div className="card-b"><SensorChart data={data} /></div>
          </div>
          <div className="grid">
            <div className="card">
              <div className="card-h"><h3>Kondisi komponen</h3>{data.status && <StateBadge state={data.status.state} />}</div>
              <div className="card-b"><Health data={data} labels={ov.fault_labels} /></div>
            </div>
            <div className="card"><div className="card-h"><h3>Tindakan berikutnya</h3></div><div className="card-b"><p>{pump.open_case ? 'Buka kasus untuk meninjau diagnosis, bukti, dan keputusan yang diperlukan.' : pump.status.state === 'normal' ? 'Terus pantau kondisi unit.' : 'Analisis unit untuk menentukan pemeriksaan berikutnya.'}</p><div className="sub">{pump.model} · {pump.location}</div>{pump.status.error && <p role="alert">{pump.status.error}</p>}</div></div>
            <div className="card"><div className="card-h"><h3>Work order unit</h3></div><div className="card-b"><RequestState {...workOrders} retry={workOrders.refresh} />{workOrders.data?.filter((w) => w.pump_id === pump.id).map((w) => <div className="attention-row" key={w.id}><div><b>{w.id}</b><div>{w.title}</div><div className="sub">{w.status} · {w.technician ?? 'Belum ditugaskan'}</div></div>{w.case_id && <button className="btn sm" onClick={() => onOpenCase(w.case_id)}>Kasus</button>}</div>)}{workOrders.data && !workOrders.data.some((w) => w.pump_id === pump.id) && <Empty>Belum ada work order untuk unit ini.</Empty>}</div></div>
            {data.status?.flags && data.status.flags.length > 0 && (
              <div className="callout warn"><b>Ambang kritis</b><div className="sub">{data.status.flags.join('; ')}</div></div>
            )}
          </div>
        </div>
      )}

      {ov.simulator && ov.scenario_controls_enabled && canManage && <details className="card demo-panel" style={{ marginTop: 16 }}>
        <summary>Mode demo · Kontrol simulasi sensor</summary>
        <div className="card-h">
          <div><h3>Simulasi data</h3><div className="sub">Data sensor diputar ulang dari siklus {ov.ml.source === 'uci_real' ? 'nyata dataset UCI' : 'data demo'}. Gunakan ini untuk demo.</div></div>
          <Badge tone="info">Siklus tiap {ov.tick_seconds} dtk</Badge>
        </div>
        <div className="card-b row wrap">
          <button className="btn" disabled={busy} onClick={() => run(() => api.scenarioStart(), 'Skenario demo dimulai: Pump-02 memburuk bertahap, Pump-03 kebocoran berat mendadak')}>Mulai skenario demo</button>
          <span className="sub">atau</span>
          <select aria-label="Unit simulasi" className="sel" value={faultPump} onChange={(e) => setFaultPump(e.target.value)}>{ov.pumps.map((p) => <option key={p.id}>{p.id}</option>)}</select>
          <select aria-label="Jenis gangguan simulasi" className="sel" value={fault} onChange={(e) => setFault(e.target.value)}>{FAULTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select aria-label="Perkembangan gangguan" className="sel" value={sudden ? 'y' : 'n'} onChange={(e) => setSudden(e.target.value === 'y')}><option value="n">Memburuk bertahap</option><option value="y">Langsung parah</option></select>
          <button className="btn" disabled={busy} onClick={() => run(() => api.scenarioFault(faultPump, fault, sudden), `Gangguan disuntikkan ke ${faultPump}`)}>Suntik gangguan</button>
          <button className="btn" disabled={busy} onClick={() => run(() => api.scenarioDropout(faultPump, 'VS1'), `Sensor getaran ${faultPump} dimatikan`)}>Matikan sensor getaran</button>
          <span className="spacer" />
          <button className="btn danger" disabled={busy} onClick={() => { if (window.confirm('Kembalikan simulasi semua unit ke kondisi normal? Kasus dan work order tetap tersimpan.')) void run(() => api.scenarioReset(), 'Simulasi semua unit dikembalikan normal'); }}>Reset semua unit</button>
        </div>
      </details>}
    </div>
  );
}
