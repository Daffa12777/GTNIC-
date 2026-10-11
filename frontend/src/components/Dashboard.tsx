import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Overview, Pump, ReadingsResp } from '../types';
import SensorChart from './SensorChart';
import { Badge, Empty, StateBadge, pct } from './ui';

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

export default function Dashboard({ ov, onOpenCase, flash, refresh }: { ov: Overview; onOpenCase: (id: string) => void; flash: (m: string) => void; refresh: () => void }) {
  const [sel, setSel] = useState<string>(ov.pumps[0]?.id ?? '');
  const [data, setData] = useState<ReadingsResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [faultPump, setFaultPump] = useState('Pump-02');
  const [fault, setFault] = useState('cooler');
  const [sudden, setSudden] = useState(false);

  useEffect(() => {
    if (!sel) return;
    let stop = false;
    const load = () => api.readings(sel, 60).then((d) => !stop && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, Math.max(2000, ov.tick_seconds * 1000));
    return () => { stop = true; clearInterval(t); };
  }, [sel, ov.tick_seconds]);

  const count = (s: string) => ov.pumps.filter((p) => p.status.state === s).length;
  const openCases = ov.pumps.filter((p) => p.open_case).length;
  const pump: Pump | undefined = ov.pumps.find((p) => p.id === sel);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); flash(ok); refresh(); } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Ringkasan unit</h1>
          <p>Status tiap unit tenaga hidrolik dari pembacaan sensor, dianalisis model ML dan agent.</p>
        </div>
        <button className="btn primary" disabled={busy} onClick={() => run(() => api.triage(), 'Triase selesai: unit bermasalah dianalisis berurutan prioritas')}>
          Triase semua unit
        </button>
      </div>

      {!ov.ml.ok && <div className="notice bad">Layanan ML tidak dapat dihubungi: {ov.ml.error}. Diagnosis tidak dapat berjalan sampai layanan aktif.</div>}
      {ov.ml.ok && ov.ml.source === 'demo_synthetic' && (
        <div className="notice warn">Model saat ini dilatih dari data demo sintetis berformat UCI, bukan dataset asli. Jalankan <code>python train.py --download</code> di folder <code>ml</code> untuk melatih dari dataset UCI asli.</div>
      )}

      <div className="grid stats">
        <div className="card stat"><div className="k">Normal</div><div className="v num">{count('normal')}</div></div>
        <div className="card stat"><div className="k">Waspada</div><div className="v num" style={{ color: count('waspada') ? 'var(--warn)' : undefined }}>{count('waspada')}</div></div>
        <div className="card stat"><div className="k">Kritis</div><div className="v num" style={{ color: count('kritis') ? 'var(--bad)' : undefined }}>{count('kritis')}</div></div>
        <div className="card stat"><div className="k">Kasus terbuka</div><div className="v num">{openCases}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Unit</th><th>Nama</th><th>Kritikalitas</th><th>Status</th><th>Dugaan model</th><th>Keyakinan</th><th>WO terbuka</th></tr></thead>
          <tbody>
            {ov.pumps.map((p) => (
              <tr key={p.id} className={`click ${p.id === sel ? 'sel' : ''}`} onClick={() => setSel(p.id)}>
                <td className="id">{p.id}</td>
                <td>{p.name}<div className="sub">{p.location}</div></td>
                <td>{p.criticality}</td>
                <td><StateBadge state={p.status.state} /></td>
                <td>{p.status.label && p.status.label !== 'sensor' ? ov.fault_labels[p.status.label] ?? p.status.label : '-'}</td>
                <td className="num">{pct(p.status.confidence)}</td>
                <td className="num">{p.open_work_orders || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pump && data && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px', alignItems: 'start' }}>
          <div className="card">
            <div className="card-h">
              <div><h3>{pump.id} · {pump.name}</h3><div className="sub">Grafik 60 siklus terakhir. Garis putus-putus = rata-rata kondisi sehat.</div></div>
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
            {data.status?.flags && data.status.flags.length > 0 && (
              <div className="callout warn"><b>Ambang kritis</b><div className="sub">{data.status.flags.join('; ')}</div></div>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <div><h3>Simulasi data</h3><div className="sub">Data sensor diputar ulang dari siklus {ov.ml.source === 'uci_real' ? 'nyata dataset UCI' : 'data demo'}. Gunakan ini untuk demo.</div></div>
          <Badge tone="info">Siklus tiap {ov.tick_seconds} dtk</Badge>
        </div>
        <div className="card-b row wrap">
          <button className="btn" disabled={busy} onClick={() => run(() => api.scenarioStart(), 'Skenario demo dimulai: Pump-02 memburuk bertahap, Pump-03 kebocoran berat mendadak')}>Mulai skenario demo</button>
          <span className="sub">atau</span>
          <select className="sel" value={faultPump} onChange={(e) => setFaultPump(e.target.value)}>{ov.pumps.map((p) => <option key={p.id}>{p.id}</option>)}</select>
          <select className="sel" value={fault} onChange={(e) => setFault(e.target.value)}>{FAULTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select className="sel" value={sudden ? 'y' : 'n'} onChange={(e) => setSudden(e.target.value === 'y')}><option value="n">Memburuk bertahap</option><option value="y">Langsung parah</option></select>
          <button className="btn" disabled={busy} onClick={() => run(() => api.scenarioFault(faultPump, fault, sudden), `Gangguan disuntikkan ke ${faultPump}`)}>Suntik gangguan</button>
          <button className="btn" disabled={busy} onClick={() => run(() => api.scenarioDropout(faultPump, 'VS1'), `Sensor getaran ${faultPump} dimatikan`)}>Matikan sensor getaran</button>
          <span className="spacer" />
          <button className="btn danger" disabled={busy} onClick={() => run(() => api.scenarioReset(), 'Semua unit dikembalikan normal')}>Reset semua unit</button>
        </div>
      </div>
    </div>
  );
}
