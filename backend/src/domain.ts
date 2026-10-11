export type Fault = 'normal' | 'pump' | 'valve' | 'cooler' | 'accumulator';
export const COMP_KEYS = ['pump', 'valve', 'cooler', 'accumulator'] as const;

export const DISPLAY_SENSORS = ['PS1', 'EPS1', 'FS1', 'TS1', 'VS1', 'CE', 'CP', 'SE'];

export const FAULT_LABEL: Record<string, string> = {
  normal: 'Normal',
  pump: 'Kebocoran internal pompa',
  valve: 'Katup proporsional lambat/aus',
  cooler: 'Pendingin oli tidak efisien',
  accumulator: 'Pre-charge akumulator turun',
};
export const FAULT_PART: Record<string, string> = {
  pump: 'Seal kit pompa hidrolik',
  valve: 'Kumparan katup proporsional',
  cooler: 'Elemen pendingin oli',
  accumulator: 'Bladder akumulator',
};
export const FAULT_SKILL: Record<string, string> = { pump: 'mekanik', valve: 'listrik', cooler: 'mekanik', accumulator: 'mekanik' };
export const FAULT_QUERY: Record<string, string> = {
  pump: 'kebocoran internal pompa tekanan turun debit turun daya motor naik panduan troubleshooting',
  valve: 'katup proporsional lambat aus fluktuasi tekanan respons panduan troubleshooting',
  cooler: 'pendingin oli tidak efisien suhu naik efisiensi pendingin turun panduan troubleshooting',
  accumulator: 'akumulator pre-charge turun denyut tekanan hentakan panduan troubleshooting',
};
export const KEYWORDS: Record<string, string[]> = {
  pump: ['bocor', 'kebocoran', 'pompa berisik', 'suara pompa', 'oli cepat panas', 'siklus lama', 'siklus lambat', 'tekanan sulit naik', 'tekanan tidak naik'],
  valve: ['katup lambat', 'respon lambat', 'respons lambat', 'tersendat', 'macet', 'telat bergerak', 'gerak lambat', 'katup'],
  cooler: ['oli panas', 'suhu oli', 'pendingin', 'kipas', 'cooler', 'air pendingin', 'radiator'],
  accumulator: ['akumulator', 'accumulator', 'nitrogen', 'denyut', 'berdenyut', 'hentakan tekanan', 'bladder'],
};
export const NEGATORS = ['tidak', 'tdk', 'nggak', 'gak', 'ga', 'bukan', 'belum', 'tanpa'];
export const QUESTION: Record<string, string> = {
  pump: 'apakah pompa terdengar lebih berisik, oli cepat panas, atau waktu siklus mesin memanjang?',
  valve: 'apakah gerak aktuator terasa tersendat atau terlambat saat katup berpindah posisi?',
  cooler: 'apakah oli terasa sangat panas, dan bagaimana kondisi kipas atau aliran air pendingin?',
  accumulator: 'apakah terasa hentakan tekanan saat aktuator bergerak, dan apakah pompa sering menyala?',
  normal: 'apakah ada gejala yang terlihat atau terdengar langsung di unit ini?',
};

export const asObj = (v: any, d: any = {}) => {
  if (v == null) return d;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return d; } }
  return v;
};
export const now = () => Date.now() / 1000;
