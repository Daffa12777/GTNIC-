import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Chat from '../src/components/Chat';
import { api } from '../src/api';
import { chatKey, readChat } from '../src/chatSession';

afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
const props = { username: 'image-test', onOpenCase: vi.fn(), onChanged: vi.fn() };
const picture = () => new File(['image-test-content'], 'pompa.png', { type: 'image/png' });

it('previews and submits an image with a caption while keeping image bytes out of session storage', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const chat = vi.spyOn(api, 'chat').mockResolvedValue({ reply: 'Gambar terbaca.', case: null });
  render(<Chat {...props} useLlm />);
  fireEvent.change(screen.getByLabelText('Unggah gambar'), { target: { files: [picture()] } });
  await screen.findByAltText('Pratinjau lampiran');
  fireEvent.change(screen.getByLabelText('Pesan untuk asisten'), { target: { value: 'Periksa foto pompa' } });
  fireEvent.click(screen.getByText('Kirim'));
  await screen.findByText('Gambar terbaca.');
  expect(chat).toHaveBeenCalledWith('Periksa foto pompa', null, true, expect.any(Array), { mimeType: 'image/png', data: btoa('image-test-content') });
  expect(screen.queryByAltText('Pratinjau lampiran')).toBeNull();
  const stored = sessionStorage.getItem(chatKey('image-test'))!;
  expect(stored).not.toContain(btoa('image-test-content'));
  expect(readChat('image-test').messages.find(m => m.from === 'user')?.imageName).toBe('pompa.png');
});

it('keeps the image and caption available for retry after failure and allows removal', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api, 'chat').mockRejectedValue(new Error('Layanan gagal'));
  render(<Chat {...props} useLlm />);
  fireEvent.change(screen.getByLabelText('Unggah gambar'), { target: { files: [picture()] } });
  await screen.findByAltText('Pratinjau lampiran');
  fireEvent.click(screen.getByText('Kirim'));
  await screen.findByText('Terjadi kesalahan: Layanan gagal');
  expect(screen.getByAltText('Pratinjau lampiran')).toBeTruthy();
  expect((screen.getByLabelText('Pesan untuk asisten') as HTMLInputElement).value).toContain('gambar ini');
  fireEvent.click(screen.getByText('Hapus gambar'));
  expect(screen.queryByAltText('Pratinjau lampiran')).toBeNull();
});

it('rejects unsupported and oversized files and disables uploading outside LLM mode', async () => {
  const view = render(<Chat {...props} useLlm />);
  const input = screen.getByLabelText('Unggah gambar');
  fireEvent.change(input, { target: { files: [new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' })] } });
  expect(screen.getByRole('alert').textContent).toContain('JPG');
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })] } });
  expect(screen.getByRole('alert').textContent).toContain('2 MB');
  view.rerender(<Chat {...props} useLlm={false} />);
  await waitFor(() => expect((screen.getByText('Tambah gambar') as HTMLButtonElement).disabled).toBe(true));
});
