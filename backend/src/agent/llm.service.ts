import { Injectable } from '@nestjs/common';
import { CONFIG } from '../config';
import { DbService } from '../db/db.service';
import { TOOL_SPECS, ToolsService } from '../tools/tools.service';
import { CaseStore, Trace } from './case.store';

const MAX_STEPS = 12;
const SYSTEM = `Kamu adalah ManualMechanic, asisten ahli perawatan unit tenaga hidrolik (hydraulic power unit dengan pompa) untuk tim maintenance pabrik. Bayangkan dirimu teknisi senior yang sabar: paham mendalam, menjelaskan dengan bahasa sehari-hari, dan tidak membuat lawan bicara merasa bodoh.

PENGETAHUAN DOMAIN
- Sensor: PS1-PS6 tekanan (bar), EPS1 daya motor (W), FS1-FS2 debit (l/menit), TS1-TS4 suhu (derajat C), VS1 getaran (mm/s), CE efisiensi pendingin (%), CP daya pendingin (kW), SE efisiensi sistem (%).
- Komponen yang dipantau model ML: pump (kebocoran internal pompa), valve (katup proporsional, respons melambat), cooler (pendingin, efisiensi turun), accumulator (tekanan pre-charge turun).
- Gejala umum: oli cepat panas -> pendingin atau kebocoran pompa; tekanan sulit naik dan debit turun -> kebocoran pompa atau akumulator; gerak aktuator tersendat atau lambat -> katup atau akumulator.

CARA KERJA
- Gunakan tool untuk semua data spesifik (angka sensor, status unit, stok, work order, riwayat, isi manual). Jangan mengarang angka, ID, atau sitasi. Model ML yang membaca sensor; kamu tidak menganalisis angka mentah sendiri.
- Untuk analisis sebuah unit: get_sensor_data, check_sensor_validity (jika sensor mencurigakan jangan simpulkan kerusakan mesin), detect_anomaly, classify_fault, search_history, search_manual, lalu putuskan:
  keyakinan >= 80% dan risiko bukan tinggi -> check_inventory, create_work_order, bila stok kosong create_purchase_request, schedule_technician, send_notification.
  keyakinan 50-80% -> jelaskan ambiguitasnya dan ajukan pertanyaan klarifikasi, jangan buat work order.
  keyakinan < 50% atau pola tidak dikenal -> escalate_to_senior.
  risiko tinggi -> hanya rekomendasikan dan minta persetujuan supervisor, jangan buat work order.
- Jika tool mengembalikan error, baca pesannya lalu perbaiki parameter atau pilih langkah lain. Jika tindakan ditolak guardrail, jelaskan alasannya apa adanya.
- Pertanyaan umum (cara kerja pompa hidrolik, arti sebuah sensor, perawatan, istilah teknis) boleh dijawab dari pengetahuanmu tanpa tool. Bila pertanyaan menyangkut data atau tindakan nyata di sistem, wajib pakai tool. Jika pertanyaan di luar topik perawatan, jawab singkat dan arahkan kembali dengan sopan. Jika tidak tahu atau data tidak ada, katakan terus terang.
- Gunakan riwayat percakapan: pertanyaan lanjutan seperti "kenapa begitu?" atau "unit tadi" merujuk ke jawaban sebelumnya.

CARA MENJAWAB
- Bahasa Indonesia yang jelas, hangat, dan tidak kaku. Istilah teknis boleh dipakai, tetapi selalu diberi penjelasan singkat dalam kurung saat pertama muncul.
- Jawab lengkap dan terperinci, tetapi tertata. Untuk hasil analisis unit gunakan urutan ini, dengan judul bagian berupa teks biasa:
  Kesimpulan: satu atau dua kalimat inti.
  Alasan: bukti dari data, sebutkan angka atau persentase yang benar-benar diberikan tool, dan terangkan artinya.
  Tindakan: apa yang sudah dilakukan (sebut ID work order, teknisi, jadwal, pengajuan pembelian) atau apa yang disarankan dan siapa yang perlu menyetujui.
  Langkah berikutnya: apa yang sebaiknya dicek atau dilakukan teknisi di lapangan.
  Dasar: sitasi manual (sumber dan bagian) bila memakai search_manual.
- Untuk pertanyaan sederhana (stok, daftar work order, penjelasan istilah) jawab langsung dan ringkas tanpa judul bagian, lalu tambahkan konteks yang membantu, misalnya apa artinya stok itu bagi pekerjaan yang sedang berjalan.
- Format: boleh memakai **tebal** untuk poin penting, daftar berawalan "- " atau "1.", dan baris kosong antarbagian. Jangan pakai tanda pagar (#), garis pemisah (---), tabel, rumus LaTeX atau tanda dolar, dan jangan menyebut nama tool internal (misalnya get_sensor_data) di jawaban; ganti dengan bahasa biasa seperti "saya membaca data sensor".
- Bila ada hal yang tidak pasti, katakan tingkat ketidakpastiannya dan apa yang akan menguranginya.`;

/** Mode LLM: Gemini function calling di atas tool yang sama. Guardrail tetap di lapisan tool. */
@Injectable()
export class LlmService {
  constructor(private tools: ToolsService, private db: DbService, private cases: CaseStore) {}

  get enabled() { return !!CONFIG.GEMINI_API_KEY; }

  private async call(contents: any[]) {
    const body = {
      system_instruction: { parts: [{ text: SYSTEM }] }, contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      tools: [{ function_declarations: TOOL_SPECS.map(([name, description, parameters]) => ({ name, description, parameters })) }],
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent`;
    let lastErr: Error = new Error('Gemini tidak merespons');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': CONFIG.GEMINI_API_KEY },
          body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
        });
        if (r.ok) return (await r.json()) as any;
        const txt = (await r.text()).slice(0, 200);
        lastErr = new Error(`Gemini HTTP ${r.status}: ${txt}`);
        if (![429, 500, 502, 503, 504].includes(r.status)) throw lastErr; // error permanen: jangan diulang
      } catch (e: any) {
        if (e === lastErr) throw e;
        lastErr = new Error(e?.name === 'TimeoutError' ? 'Gemini tidak merespons dalam 120 detik' : String(e?.message ?? e));
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
    throw lastErr;
  }

  private async loop(task: string, trace: Trace, history: { from: string; text: string }[] = []) {
    const contents: any[] = history.slice(-8).filter((h) => h.text).map((h) => ({ role: h.from === 'user' ? 'user' : 'model', parts: [{ text: String(h.text).slice(0, 1500) }] }));
    while (contents.length && contents[0].role !== 'user') contents.shift();
    contents.push({ role: 'user', parts: [{ text: task }] });
    let final = '', needs = false;
    for (let i = 0; i < MAX_STEPS; i++) {
      const data = await this.call(contents);
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      contents.push({ role: 'model', parts });
      const calls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
      const texts = parts.filter((p: any) => p.text).map((p: any) => p.text);
      if (texts.length) trace.add('reasoning', 'Penalaran LLM', texts.join('\n').slice(0, 600));
      if (!calls.length) { final = texts.join('\n').trim(); break; }
      const responses: any[] = [];
      for (const fc of calls) {
        const res = await trace.tool(fc.name, fc.args || {});
        if (res?.requires_approval) needs = true;
        responses.push({ functionResponse: { name: fc.name, response: { result: res } } });
      }
      contents.push({ role: 'user', parts: responses });
    }
    return { final: final || 'Analisis selesai.', needs };
  }

  async diagnose(pumpId: string, complaint = '') {
    const id = await this.db.nextId('C', 'cases');
    const trace = this.cases.trace(id);
    trace.add('reasoning', 'Mode LLM', `Model ${CONFIG.GEMINI_MODEL} menjalankan loop function calling.`);
    const { final, needs } = await this.loop(`Diagnosis dan tindak lanjut untuk ${pumpId}.${complaint ? ` Keluhan teknisi: ${complaint}` : ''}`, trace);
    await this.cases.save(id, trace, needs ? 'menunggu_persetujuan' : 'selesai_llm', { pump_id: pumpId, probs: null }, { summary: final, mode: 'llm' });
    return this.cases.get(id);
  }

  async chat(message: string, history: { from: string; text: string }[] = []) {
    const id = await this.db.nextId('C', 'cases');
    const trace = this.cases.trace(id);
    const { final, needs } = await this.loop(message, trace, history);
    let c = null;
    if (trace.items.some((i) => i.kind === 'tool')) {
      await this.cases.save(id, trace, needs ? 'menunggu_persetujuan' : 'selesai_llm', { pump_id: null }, { summary: final, mode: 'llm' });
      c = await this.cases.get(id);
    }
    return { reply: final, case: c };
  }
}