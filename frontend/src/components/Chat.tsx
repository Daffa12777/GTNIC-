import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api } from '../api';
import type { ChatImage, ChatMsg } from '../types';
import { CaseBadge, RiskBadge } from './ui';
import { errorMessage } from '../usePolling';
import Markdown from 'react-markdown';
import { readChat, writeChat } from '../chatSession';
import { useUnsavedChanges } from '../useUnsavedChanges';
import ConfirmDialog from './ConfirmDialog';

const SUGGEST = ['Pump-03 oli cepat panas dan tekanan sulit naik', 'Pump-02 gerak aktuator tersendat', 'Urutan prioritas penanganan', 'Stok seal kit pompa'];

export default function Chat({ username, useLlm, onOpenCase, onChanged }: { username: string; useLlm: boolean; onOpenCase: (id: string) => void; onChanged: () => void }) {
  const [saved] = useState(() => readChat(username));
  const [msgs, setMsgs] = useState<ChatMsg[]>(saved.messages.length ? saved.messages : [
    { from: 'agent', text: 'Laporkan keluhan dari lapangan, misalnya "Pump-03 oli cepat panas". Saya akan membaca sensor, menjalankan model, mencari panduan, lalu bertanya, bertindak, atau meminta persetujuan sesuai tingkat keyakinan dan risiko.' },
  ]);
  const [text, setText] = useState(saved.draft);
  const [busy, setBusy] = useState(false);
  const [openCase, setOpenCase] = useState<string | null>(saved.openCase);
  const [storageFailed, setStorageFailed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [attachment, setAttachment] = useState<{ image: ChatImage; name: string } | null>(null);
  const [imageError, setImageError] = useState('');
  const [readingImage, setReadingImage] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Chat stays mounted across tabs; warn on refresh only when its draft cannot be saved.
  useUnsavedChanges(busy || readingImage || !!attachment || (storageFailed && !!text), false);
  const sending = useRef(false);
  useEffect(() => { setStorageFailed(!writeChat(username, { messages: msgs, draft: text, openCase })); }, [username, msgs, text, openCase]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImageError(''); setAttachment(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Pilih gambar JPG, PNG, atau WebP.'); return;
    }
    if (!file.size || file.size > 2 * 1024 * 1024) {
      setImageError('Gambar harus berisi data dan berukuran maksimal 2 MB.'); return;
    }
    setReadingImage(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setAttachment({ name: file.name, image: { mimeType: file.type, data: reader.result.slice(reader.result.indexOf(',') + 1) } });
      else setImageError('Gambar tidak dapat dibaca. Pilih ulang file.');
      setReadingImage(false);
    };
    reader.onerror = () => { setImageError('Gambar tidak dapat dibaca. Pilih ulang file.'); setReadingImage(false); };
    reader.readAsDataURL(file);
  };

  const send = async (t: string) => {
    const m = t.trim() || (attachment ? 'Jelaskan kondisi yang terlihat pada gambar ini dan langkah pemeriksaannya.' : '');
    if (!m || sending.current || readingImage || (attachment && !useLlm)) return;
    const sentAttachment = attachment;
    sending.current = true;
    setText(''); setBusy(true);
    setMsgs((x) => [...x, { from: 'user', text: m, image: sentAttachment?.image, imageName: sentAttachment?.name }]);
    try {
      const r = await api.chat(m, openCase, useLlm, msgs.slice(-8).map((item) => ({ from: item.from, text: item.text.slice(0, 1500) })), sentAttachment?.image);
      setAttachment(null); setImageError('');
      const warn = r.llm_error ? `\n\n[Mode LLM gagal: ${r.llm_error}. Jawaban ini dari mode biasa.]` : '';
      setMsgs((x) => [...x, { from: 'agent', text: r.reply + warn, case: r.case }]);
      setOpenCase(r.case?.id ?? openCase);
      onChanged();
    } catch (e: unknown) {
      setText(m);
      setMsgs((x) => [...x, { from: 'agent', text: `Terjadi kesalahan: ${errorMessage(e)}` }]);
    } finally { sending.current = false; setBusy(false); }
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head"><div><h1>Asisten lapangan</h1><p>Laporan teknisi masuk ke kasus yang sama dengan anomali dari sensor.{useLlm ? ' Mode LLM aktif.' : ''}</p></div></div>
      <div className="row wrap"><span className="sub">Riwayat disimpan untuk sesi browser ini hingga logout (100 pesan terakhir).</span><button type="button" className="btn sm" disabled={busy || readingImage} onClick={() => setConfirmClear(true)}>Percakapan baru</button></div>
      {storageFailed && <div className="notice warn" role="status">Browser tidak mengizinkan penyimpanan riwayat. Percakapan hanya bertahan selama halaman terbuka.</div>}
      <div className="card chat">
        <div className="msgs" role="log" aria-label="Percakapan asisten" aria-live="polite" aria-relevant="additions text">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.from}`}>
              {m.image && <img className="chat-image" src={`data:${m.image.mimeType};base64,${m.image.data}`} alt={`Lampiran ${m.imageName ?? 'gambar'}`} />}
              {m.imageName && <span className="chat-image-name">{m.imageName}{!m.image && ' · Pratinjau berakhir saat halaman dimuat ulang'}</span>}
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
        <div className="chips">{SUGGEST.map((s) => <button key={s} className="chip" disabled={busy || readingImage || !!attachment} onClick={() => send(s)}>{s}</button>)}</div>
        <div className="chat-attachment-area">
          {attachment && <div className="chat-attachment"><img src={`data:${attachment.image.mimeType};base64,${attachment.image.data}`} alt="Pratinjau lampiran" /><span>{attachment.name}</span><button type="button" className="btn sm" disabled={busy} onClick={() => { setAttachment(null); setImageError(''); }}>Hapus gambar</button></div>}
          {imageError && <p className="notice bad" role="alert">{imageError}</p>}
          <p className="sub" id="chat-image-help">{readingImage ? 'Membaca gambar…' : useLlm ? 'Satu gambar JPG, PNG, atau WebP, maksimal 2 MB. Gambar dikirim ke Gemini saat pesan dikirim; pratinjau hanya selama halaman terbuka.' : 'Aktifkan Mode LLM untuk mengirim gambar.'}</p>
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Unggah gambar" aria-describedby="chat-image-help" hidden disabled={busy || readingImage || !useLlm} onChange={chooseImage} />
          <button type="button" className="btn" disabled={busy || readingImage || !useLlm} onClick={() => fileInput.current?.click()}>Tambah gambar</button>
          <input className="input" aria-label="Pesan untuk asisten" maxLength={8000} disabled={busy} placeholder="Tulis keluhan atau pertanyaan lanjutan…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" disabled={busy || readingImage || (!text.trim() && !attachment) || (!!attachment && !useLlm)}>Kirim</button>
        </form>
      </div>
      {confirmClear && <ConfirmDialog title="Mulai percakapan baru?" description="Riwayat percakapan sesi ini dihapus. Kasus dan work order tetap tersimpan." confirmLabel="Hapus percakapan" onCancel={() => setConfirmClear(false)} onConfirm={() => { setMsgs([]); setText(''); setAttachment(null); setImageError(''); setOpenCase(null); setConfirmClear(false); }} />}
    </div>
  );
}
