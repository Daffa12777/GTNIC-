import { useEffect, useState } from 'react';
export function useDebounced(value: string, delay = 300): string {
  const [result, setResult] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setResult(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return result;
}
