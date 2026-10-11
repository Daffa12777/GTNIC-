/* ManualMechanic - antarmuka web (tanpa framework) */
const SENSORS = [
  { key: "vibration", name: "Getaran", unit: "mm/s", d: 2 },
  { key: "bearing_temp", name: "Suhu bearing", unit: "°C", d: 1 },
  { key: "pressure", name: "Tekanan discharge", unit: "bar", d: 2 },
  { key: "current", name: "Arus motor", unit: "A", d: 1 },
  { key: "flow", name: "Debit aliran", unit: "m³/jam", d: 0 },
];
const STATE_LABEL = { normal: "Normal", waspada: "Waspada", kritis: "Kritis", sensor: "Sensor bermasalah", "tidak ada data": "Tidak ada data" };
const FAULT_LABEL = { normal: "Normal", bearing: "Bearing aus / kurang pelumas", impeller: "Impeller aus / tersumbat", cavitation: "Kavitasi", overload: "Overload motor", sensor: "Sensor" };
const CASE_LABEL = {
  selesai_otomatis: ["Dieksekusi otomatis", "b-normal"], menunggu_klarifikasi: ["Menunggu klarifikasi", "b-accent"],
  menunggu_persetujuan: ["Menunggu persetujuan", "b-waspada"], dieskalasi: ["Dieskalasi", "b-kritis"],
  tidak_ada_gangguan: ["Tidak ada gangguan", "b-normal"], sensor_bermasalah: ["Sensor bermasalah", "b-kritis"],
  disetujui_dijalankan: ["Disetujui dan dijalankan", "b-normal"], ditolak: ["Ditolak", "b-neutral"],
  selesai: ["Selesai", "b-neutral"], dipantau: ["Dipantau", "b-neutral"], gagal: ["Gagal", "b-kritis"], selesai_llm: ["Selesai (LLM)", "b-accent"],
};
const WO_BADGE = { terbuka: "b-waspada", terjadwal: "b-accent", selesai: "b-neutral" };
const NOTIF_BADGE = { terkirim: "b-normal", disimulasikan: "b-neutral", gagal: "b-kritis" };

const S = { pumps: [], sel: "Pump-01", tab: "wo", cases: [], viewCase: null, pinned: null, caseSig: "", chat: [], config: {}, busy: false };
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 1) => (v == null ? "-" : Number(v).toFixed(d));
const when = (ts) => new Date(ts * 1000).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Galat ${res.status}`);
  return data;
}
const post = (p, body = {}) => api(p, { method: "POST", body: JSON.stringify(body) });
const badge = (cls, text) => `<span class="badge ${cls}">${esc(text)}</span>`;
const curPump = () => S.pumps.find((p) => p.id === S.sel);

/* ---------------------------------------------------------------- pompa */
function renderPumps() {
  $("#pump-list").innerHTML = S.pumps.map((p) => {
    const st = p.status || {}; const l = st.latest || {};
    return `<button class="pump ${p.id === S.sel ? "sel" : ""}" data-id="${p.id}">
      <div class="pump-top"><span class="pump-name">${esc(p.id)}</span>${badge("b-" + (st.state || "normal"), STATE_LABEL[st.state] || st.state)}</div>
      <div class="pump-sub">${esc(p.name)}</div>
      <div class="pump-kv">
        <span>Getaran<b>${fmt(l.vibration, 1)}</b></span>
        <span>Suhu<b>${fmt(l.bearing_temp, 0)} °C</b></span>
        <span>Arus<b>${fmt(l.current, 1)} A</b></span>
      </div></button>`;
  }).join("");
  document.querySelectorAll(".pump").forEach((b) => b.onclick = () => selectPump(b.dataset.id));
}

function sparkline(vals, nominal) {
  if (!vals.length) return "";
  const lo = Math.min(...vals, nominal * 0.9), hi = Math.max(...vals, nominal * 1.1);
  const span = hi - lo || 1, W = 200, H = 56;
  const x = (i) => (i / Math.max(vals.length - 1, 1)) * W;
  const y = (v) => H - 4 - ((v - lo) / span) * (H - 8);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line x1="0" x2="${W}" y1="${y(nominal)}" y2="${y(nominal)}" stroke="currentColor" stroke-opacity=".28" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderDetail() {
  const p = curPump(); if (!p) return;
  const st = p.status || {};
  let note = "Semua sensor dalam rentang normal.";
  if (st.state === "sensor") note = `Sensor ${(st.suspect || []).join(", ")} mengirim nilai tidak valid.`;
  else if (st.label && st.label !== "normal") note = `Pola terdeteksi: ${FAULT_LABEL[st.label]} (${Math.round((st.confidence || 0) * 100)}%).` + ((st.flags || []).length ? ` Ambang kritis: ${st.flags.join("; ")}.` : "");
  $("#pump-head").innerHTML = `<div><h2>${esc(p.id)} <span class="muted" style="font-weight:500">${esc(p.name)}</span></h2>
    <div class="meta">${esc(p.location)} · model ${esc(p.model)} · kritikalitas ${esc(p.criticality)}</div></div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">${badge("b-" + (st.state || "normal"), STATE_LABEL[st.state] || st.state)}<div class="diag-note">${esc(note)}</div></div>`;
  const nom = { vibration: p.nom_vibration, bearing_temp: p.nom_temp, pressure: p.nom_pressure, current: p.nom_current, flow: p.nom_flow };
  $("#charts").innerHTML = SENSORS.map((s) => {
    const vals = p.series[s.key] || []; const last = vals[vals.length - 1];
    const dev = last == null ? 0 : ((last / nom[s.key]) - 1) * 100;
    const cls = dev > 12 ? "dev-up" : dev < -12 ? "dev-down" : "";
    return `<div class="chart"><div class="chart-top"><span class="chart-name">${s.name}</span>
      <span class="chart-val">${fmt(last, s.d)}<small>${s.unit}</small></span></div>
      ${sparkline(vals, nom[s.key])}
      <div class="chart-foot"><span>Nominal ${fmt(nom[s.key], s.d)}</span><span class="${cls}">${dev >= 0 ? "+" : ""}${dev.toFixed(0)}%</span></div></div>`;
  }).join("");
}

function selectPump(id) {
  S.sel = id; S.pinned = null; S.caseSig = "";
  renderPumps(); renderDetail(); refreshCases(); updateSimLabel();
}

/* ---------------------------------------------------------------- kasus & agent */
async function refreshCases() {
  try { S.cases = await api("/api/cases"); } catch { return; }
  const target = S.pinned || (S.cases.find((c) => c.pump_id === S.sel) || {}).id || null;
  if (!target) { S.viewCase = null; S.caseSig = "none:" + S.sel; renderCase(); return; }
  const row = S.cases.find((c) => c.id === target);
  const sig = target + ":" + (row ? row.status : "") + ":" + (row ? row.summary : "");
  if (sig === S.caseSig && !S.forceCase) return;
  S.forceCase = false; S.caseSig = sig;
  try { S.viewCase = await api(`/api/cases/${target}`); renderCase(); } catch {}
}

function probsHtml(probs) {
  if (!probs) return "";
  const rows = Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return `<div class="probs">${rows.map(([k, v]) => `<div class="prob"><span>${esc(FAULT_LABEL[k] || k)}</span><span class="bar"><i style="width:${(v * 100).toFixed(0)}%"></i></span><span>${(v * 100).toFixed(0)}%</span></div>`).join("")}</div>`;
}

function renderCase() {
  const box = $("#case-view"); const c = S.viewCase;
  $("#agent-sub").textContent = `Pompa terpilih: ${S.sel}`;
  if (!c) { box.innerHTML = `<div class="empty">Belum ada kasus untuk ${esc(S.sel)}. Jalankan analisis, atau aktifkan agent otomatis dan beri gangguan lewat tab Simulator.</div>`; return; }
  const [label, cls] = CASE_LABEL[c.status] || [c.status, "b-neutral"];
  const meta = [badge(cls, label), c.pump_id ? badge("b-neutral", c.pump_id) : "", c.fault ? badge("b-neutral", FAULT_LABEL[c.fault] || c.fault) : "",
    c.risk ? badge(c.risk === "tinggi" ? "b-kritis" : c.risk === "sedang" ? "b-waspada" : "b-normal", "Risiko " + c.risk) : "",
    c.mode === "llm" ? badge("b-accent", "LLM") : ""].join("");
  let extra = "";
  if (c.status === "menunggu_klarifikasi" && c.question) {
    extra += `<div class="ask"><p>${esc(c.question)}</p><div class="row"><input id="ans" type="text" placeholder="Jawaban teknisi"><button class="btn btn-primary" id="btn-ans">Kirim</button></div></div>`;
  }
  if (c.status === "menunggu_persetujuan") {
    extra += `<div class="approve"><p>Agent merekomendasikan tindakan ini tetapi menunggu keputusan manusia sebelum menjalankannya.</p>
      <div class="row"><button class="btn btn-primary" id="btn-approve">Setujui dan jalankan</button><button class="btn btn-danger" id="btn-reject">Tolak</button></div></div>`;
  }
  const trace = (c.trace || []).map((t) => `<li class="${t.kind}"><div class="t-title">${t.tool ? `<span class="tool-pill">${esc(t.tool)}</span>` : ""}${esc(t.tool ? "" : t.title)}</div>
    ${t.detail ? `<div class="t-detail">${esc(t.detail)}</div>` : ""}</li>`).join("");
  box.innerHTML = `<div class="case-card"><div class="case-meta">${meta}</div>
    <div class="case-sum">${esc(c.summary || "")}</div>${probsHtml(c.probs)}</div>${extra}
    <div><div class="trace-title">Jejak penalaran dan tindakan (${(c.trace || []).length} langkah)</div><ul class="trace">${trace}</ul></div>`;
  const ans = $("#btn-ans");
  if (ans) { const go = () => answer($("#ans").value); ans.onclick = go; $("#ans").onkeydown = (e) => { if (e.key === "Enter") go(); }; }
  const ap = $("#btn-approve"); if (ap) ap.onclick = () => caseAction("approve");
  const rj = $("#btn-reject"); if (rj) rj.onclick = () => caseAction("reject");
}

async function caseAction(kind) {
  const c = S.viewCase; if (!c) return;
  try { await post(`/api/cases/${c.id}/${kind}`, { text: "" }); S.pinned = c.id; S.forceCase = true; await refreshCases(); refreshTab(true); }
  catch (e) { pushChat("bot", e.message); }
}
async function answer(text) {
  const c = S.viewCase; if (!c || !text.trim()) return;
  pushChat("user", text);
  try { await post(`/api/cases/${c.id}/answer`, { text }); S.pinned = c.id; S.forceCase = true; await refreshCases(); refreshTab(true); }
  catch (e) { pushChat("bot", e.message); }
}

async function runDiagnose() {
  if (S.busy) return; S.busy = true; $("#btn-diagnose").disabled = true;
  try {
    const c = await post("/api/agent/diagnose", { pump_id: S.sel, mode: $("#mode-select").value });
    S.pinned = c.id; S.forceCase = true; await refreshCases(); refreshTab(true);
  } catch (e) { pushChat("bot", e.message); }
  S.busy = false; $("#btn-diagnose").disabled = false;
}

function pushChat(who, text) {
  S.chat.push({ who, text }); S.chat = S.chat.slice(-12);
  const log = $("#chat-log");
  log.innerHTML = S.chat.map((m) => `<div class="msg ${m.who}">${esc(m.text)}</div>`).join("");
  log.scrollTop = log.scrollHeight;
}

/* ---------------------------------------------------------------- tab data */
const TABS = {
  async wo() {
    const rows = await api("/api/work-orders");
    if (!rows.length) return `<div class="empty">Belum ada work order. Work order dibuat oleh agent setelah diagnosis.</div>`;
    return `<table><thead><tr><th>ID</th><th>Pompa</th><th>Pekerjaan</th><th>Prioritas</th><th>Status</th><th>Teknisi</th><th>Jadwal</th><th></th></tr></thead><tbody>` +
      rows.map((w) => `<tr><td class="mono">${w.id}</td><td>${w.pump_id}</td><td>${esc(w.title)}<div class="muted small">${esc((w.description || "").slice(0, 150))}</div></td>
        <td>${esc(w.priority)}</td><td>${badge(WO_BADGE[w.status] || "b-neutral", w.status)}</td><td>${esc(w.technician || "-")}</td><td>${esc(w.scheduled_at || "-")}</td>
        <td>${w.status !== "selesai" ? `<button class="btn sm" data-complete="${w.id}" data-title="${esc(w.title)}">Selesaikan</button>` : ""}</td></tr>`).join("") + `</tbody></table>`;
  },
  async inv() {
    const [inv, pr] = await Promise.all([api("/api/inventory"), api("/api/purchase-requests")]);
    return `<table><thead><tr><th>Part</th><th>Stok</th><th>Lokasi</th></tr></thead><tbody>` +
      inv.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.stock === 0 ? badge("b-kritis", "Kosong") : i.stock}</td><td>${esc(i.location)}</td></tr>`).join("") + `</tbody></table>
      <div class="section-title" style="margin:18px 0 6px">Permintaan pembelian</div>` +
      (pr.length ? `<table><thead><tr><th>ID</th><th>Part</th><th>Jumlah</th><th>Alasan</th><th>Status</th></tr></thead><tbody>` +
        pr.map((r) => `<tr><td class="mono">${r.id}</td><td>${esc(r.part_name)}</td><td>${r.qty}</td><td>${esc(r.reason)}</td><td>${esc(r.status)}</td></tr>`).join("") + `</tbody></table>` : `<div class="empty">Belum ada permintaan pembelian.</div>`);
  },
  async notif() {
    const rows = await api("/api/notifications");
    if (!rows.length) return `<div class="empty">Belum ada notifikasi.</div>`;
    return `<table><thead><tr><th>Waktu</th><th>Penerima</th><th>Pesan</th><th>Status</th></tr></thead><tbody>` +
      rows.map((n) => `<tr><td class="small muted">${when(n.ts)}</td><td>${esc(n.recipient)}</td><td>${esc(n.message)}</td><td>${badge(NOTIF_BADGE[n.status] || "b-neutral", n.status)}<div class="muted small">${esc(n.detail)}</div></td></tr>`).join("") + `</tbody></table>`;
  },
  async hist() {
    const rows = await api("/api/history");
    return `<table><thead><tr><th>ID</th><th>Pompa</th><th>Tanggal</th><th>Gangguan</th><th>Penyebab</th><th>Tindakan</th><th>Durasi</th></tr></thead><tbody>` +
      rows.map((h) => `<tr><td class="mono">${h.id}</td><td>${h.pump_id}</td><td class="small">${when(h.ts)}</td><td>${esc(FAULT_LABEL[h.fault] || h.fault)}</td><td>${esc(h.root_cause)}</td><td>${esc(h.action)}</td><td>${Math.round(h.duration_min)} mnt</td></tr>`).join("") + `</tbody></table>`;
  },
  async cases() {
    if (!S.cases.length) return `<div class="empty">Belum ada kasus.</div>`;
    return `<table><thead><tr><th>ID</th><th>Pompa</th><th>Status</th><th>Gangguan</th><th>Keyakinan</th><th>Waktu</th></tr></thead><tbody>` +
      S.cases.map((c) => { const [l, cls] = CASE_LABEL[c.status] || [c.status, "b-neutral"];
        return `<tr style="cursor:pointer" data-case="${c.id}"><td class="mono">${c.id}</td><td>${c.pump_id || "-"}</td><td>${badge(cls, l)}</td><td>${esc(FAULT_LABEL[c.fault] || c.fault || "-")}</td><td>${c.confidence != null ? Math.round(c.confidence * 100) + "%" : "-"}</td><td class="small muted">${when(c.created_at)}</td></tr>`; }).join("") + `</tbody></table><div class="muted small" style="margin-top:8px">Klik baris untuk membuka jejak penalaran di panel Agent.</div>`;
  },
  async model() {
    const m = await api("/api/metrics"); const c = S.config;
    const f1 = m.per_class_f1 || {};
    return `<dl class="kv">
      <dt>Detektor anomali</dt><dd>Isolation Forest (dilatih pada data normal)</dd>
      <dt>Klasifikasi gangguan</dt><dd>Random Forest, 5 kelas</dd>
      <dt>Jendela analisis</dt><dd>${m.window || "-"} pembacaan, ${(m.features || []).length} fitur</dd>
      <dt>Macro F1 (hold-out)</dt><dd>${m.macro_f1 ?? "-"}</dd>
      <dt>F1 per kelas</dt><dd>${Object.entries(f1).map(([k, v]) => `${esc(FAULT_LABEL[k] || k)} ${v}`).join(" · ")}</dd>
      <dt>Recall anomali pada gangguan</dt><dd>${m.anomaly_recall_on_faults ?? "-"}</dd>
      <dt>Alarm palsu pada data normal</dt><dd>${m.anomaly_false_alarm_on_normal ?? "-"}</dd>
      <dt>Mode LLM</dt><dd>${c.llm_available ? "Aktif (" + esc(c.llm_model) + ")" : "Tidak aktif (GEMINI_API_KEY belum diatur)"}</dd>
      <dt>Notifikasi Telegram</dt><dd>${c.telegram_configured ? "Terkonfigurasi" : "Belum dikonfigurasi, pesan dicatat sebagai disimulasikan"}</dd></dl>
      <p class="sim-note">${esc(m.note || "")} Angka F1 tinggi karena data simulasi mudah dipisahkan, bukan klaim performa di pabrik nyata.</p>`;
  },
  async sim() {
    return `<div class="sim-grid">
      <label>Pompa<input id="sim-pump" type="text" disabled></label>
      <label>Jenis gangguan<select id="sim-fault">
        <option value="bearing">Bearing aus</option><option value="impeller">Impeller tersumbat</option>
        <option value="cavitation">Kavitasi</option><option value="overload">Overload motor</option>
        <option value="sensor_error">Sensor getaran rusak</option></select></label>
      <label>Tingkat awal<select id="sim-level"><option value="awal">Awal</option><option value="ringan">Ringan</option><option value="sedang" selected>Sedang</option><option value="berat">Berat</option></select></label>
      <label>Perkembangan<select id="sim-prog"><option value="0.0">Tetap</option><option value="0.01" selected>Memburuk perlahan</option></select></label>
      <div style="display:flex;gap:8px"><button class="btn btn-primary" id="sim-apply">Terapkan</button><button class="btn" id="sim-reset">Pulihkan normal</button></div></div>
      <p class="sim-note">Simulator menghasilkan data sensor pompa sentrifugal dengan pola gangguan yang berkembang bertahap. Dipakai untuk demo karena data pabrik nyata tidak tersedia. Pada penerapan nyata, sumber ini diganti sensor (MQTT atau OPC-UA) tanpa mengubah logika agent.</p>`;
  },
};
function updateSimLabel() { const el = $("#sim-pump"); if (el) el.value = S.sel; }

async function refreshTab(force) {
  if (!force && (S.tab === "sim" || S.tab === "model")) return;
  const body = $("#tab-body");
  const active = document.activeElement;
  if (!force && active && body.contains(active)) return;
  try { body.innerHTML = await TABS[S.tab](); } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  bindTab();
}
function bindTab() {
  document.querySelectorAll("[data-complete]").forEach((b) => b.onclick = () => openComplete(b.dataset.complete, b.dataset.title));
  document.querySelectorAll("[data-case]").forEach((r) => r.onclick = () => { S.pinned = r.dataset.case; S.forceCase = true; refreshCases(); });
  updateSimLabel();
  const ap = $("#sim-apply");
  if (ap) {
    ap.onclick = async () => {
      try { await post("/api/simulator/inject", { pump_id: S.sel, fault: $("#sim-fault").value, level: $("#sim-level").value, rate: parseFloat($("#sim-prog").value) });
        await loadState(); pushChat("bot", `Gangguan diterapkan pada ${S.sel}. ${S.config.auto_agent ? "Agent otomatis akan menganalisis saat pola terdeteksi." : "Jalankan analisis dari panel Agent."}`);
      } catch (e) { pushChat("bot", e.message); }
    };
    $("#sim-reset").onclick = async () => { try { await post("/api/simulator/reset", { pump_id: S.sel }); await loadState(); } catch (e) { pushChat("bot", e.message); } };
  }
}

let completeId = null;
function openComplete(id, title) {
  completeId = id; $("#complete-sub").textContent = `${id}: ${title}`; $("#dlg-complete").showModal();
}

/* ---------------------------------------------------------------- state */
async function loadState() {
  try {
    const d = await api("/api/state?n=60");
    S.pumps = d.pumps; $("#auto-toggle").checked = d.auto_agent;
    if (!S.pumps.find((p) => p.id === S.sel)) S.sel = S.pumps[0].id;
    renderPumps(); renderDetail();
  } catch (e) { /* server belum siap */ }
}

async function init() {
  S.config = await api("/api/config").catch(() => ({}));
  $("#chip-notif").textContent = S.config.telegram_configured ? "Telegram aktif" : "Notifikasi disimulasikan";
  $("#chip-notif").classList.toggle("on", !!S.config.telegram_configured);
  if (S.config.llm_available) $("#opt-llm").disabled = false;
  $("#auto-toggle").onchange = async (e) => { await post("/api/auto", { enabled: e.target.checked }); S.config.auto_agent = e.target.checked; };
  $("#btn-diagnose").onclick = runDiagnose;
  $("#btn-triage").onclick = async () => {
    try {
      const t = await post("/api/agent/triage");
      pushChat("bot", t.ranking.length ? "Urutan prioritas:\n" + t.ranking.map((r, i) => `${i + 1}. ${r.pump_id} (${STATE_LABEL[r.state]}, ${FAULT_LABEL[r.label] || r.label})`).join("\n") : "Semua pompa dalam kondisi normal.");
      S.forceCase = true; refreshCases(); refreshTab(true);
    } catch (e) { pushChat("bot", e.message); }
  };
  $("#chat-form").onsubmit = async (e) => {
    e.preventDefault(); const inp = $("#chat-input"); const msg = inp.value.trim(); if (!msg) return;
    inp.value = ""; pushChat("user", msg);
    try {
      const waiting = S.viewCase && S.viewCase.status === "menunggu_klarifikasi" ? S.viewCase.id : null;
      const r = await post("/api/agent/chat", { message: msg, case_id: waiting, mode: $("#mode-select").value });
      pushChat("bot", r.reply);
      if (r.case && r.case.id) { S.pinned = r.case.id; if (r.case.pump_id) S.sel = r.case.pump_id; S.forceCase = true; renderPumps(); renderDetail(); await refreshCases(); refreshTab(true); }
    } catch (err) { pushChat("bot", err.message); }
  };
  $("#tabs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; S.tab = b.dataset.tab;
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b)); refreshTab(true); };
  $("#complete-cancel").onclick = () => $("#dlg-complete").close();
  $("#complete-form").onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    try { await post(`/api/work-orders/${completeId}/complete`, { root_cause: f.get("root_cause") || "", action: f.get("action") || "", duration_min: parseFloat(f.get("duration")) || 60 });
      $("#dlg-complete").close(); e.target.reset(); await loadState(); S.forceCase = true; refreshCases(); refreshTab(true);
      pushChat("bot", `${completeId} ditutup. Hasil disimpan ke riwayat dan indeks pengetahuan diperbarui.`);
    } catch (err) { pushChat("bot", err.message); }
  };
  pushChat("bot", "Pilih pompa di kiri. Untuk mencoba, buka tab Simulator dan beri gangguan, lalu jalankan analisis atau biarkan agent otomatis bekerja.");
  await loadState(); await refreshCases(); await refreshTab(true);
  setInterval(loadState, 2000);
  setInterval(refreshCases, 2500);
  setInterval(() => refreshTab(false), 5000);
}
init();
