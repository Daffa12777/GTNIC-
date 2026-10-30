import { useEffect } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { useConnectivity } from '../useConnectivity';

export default function ConnectionStatus() {
  const online = useConnectivity();
  useEffect(() => { onlineManager.setOnline(online); }, [online]);
  if (online) return null;
  return <div className="connection-banner" role="status">Koneksi internet terputus. Data terakhir tetap ditampilkan. Tindakan baru tidak akan dikirim otomatis; data diperiksa ulang saat tersambung.</div>;
}
