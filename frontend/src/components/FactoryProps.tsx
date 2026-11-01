type Rect = { x: number; z: number; w: number; d: number };
type Kind = 'pallet' | 'drum' | 'crate' | 'bollard';
type Placement = { kind: Kind; x: number; z: number; size: number };

// Positions are deterministic so polling never makes decoration move.
export function factoryPlacements(width: number, depth: number, keepOut: readonly Rect[]): Placement[] {
  const candidates: { kind: Kind; u: number; v: number; size: number }[] = [
    { kind: 'pallet', u: -0.44, v: -0.37, size: 0.45 }, { kind: 'crate', u: -0.44, v: -0.2, size: 0.35 },
    { kind: 'drum', u: 0.44, v: -0.36, size: 0.2 }, { kind: 'drum', u: 0.44, v: -0.27, size: 0.2 },
    { kind: 'crate', u: 0.44, v: 0.29, size: 0.35 }, { kind: 'pallet', u: -0.44, v: 0.33, size: 0.45 },
    { kind: 'bollard', u: -0.25, v: 0.44, size: 0.1 }, { kind: 'bollard', u: 0.25, v: 0.44, size: 0.1 },
    { kind: 'crate', u: 0.32, v: 0.44, size: 0.35 }, { kind: 'drum', u: -0.33, v: 0.44, size: 0.2 },
  ];
  return candidates.map(({ kind, u, v, size }) => ({ kind, x: u * width, z: v * depth, size }))
    .filter(({ x, z, size }) => Math.abs(x) + size <= width / 2 && Math.abs(z) + size <= depth / 2 &&
      !keepOut.some((r) => Math.abs(x - r.x) < r.w / 2 + size + 0.1 && Math.abs(z - r.z) < r.d / 2 + size + 0.1));
}

export function FactoryProps({ width, depth, keepOut }: { width: number; depth: number; keepOut: readonly Rect[] }) {
  return <group position={[0, 0.04, 0]}>{factoryPlacements(width, depth, keepOut).map((p, i) => <group key={i} position={[p.x, 0, p.z]}>
    {p.kind === 'pallet' && <><mesh position={[0, 0.06, 0]} castShadow receiveShadow><boxGeometry args={[0.8, 0.12, 0.6]} /><meshStandardMaterial color="#a98f78" roughness={0.9} /></mesh><mesh position={[0, 0.34, 0]} castShadow><boxGeometry args={[0.68, 0.45, 0.48]} /><meshStandardMaterial color="#c1b3a0" roughness={0.9} /></mesh></>}
    {p.kind === 'drum' && <mesh position={[0, 0.21, 0]} castShadow receiveShadow><cylinderGeometry args={[0.17, 0.17, 0.42, 16]} /><meshStandardMaterial color="#687985" roughness={0.55} metalness={0.35} /></mesh>}
    {p.kind === 'crate' && <mesh position={[0, 0.25, 0]} castShadow receiveShadow><boxGeometry args={[0.55, 0.5, 0.55]} /><meshStandardMaterial color="#8d9291" roughness={0.8} /></mesh>}
    {p.kind === 'bollard' && <mesh position={[0, 0.18, 0]} castShadow><cylinderGeometry args={[0.05, 0.06, 0.36, 10]} /><meshStandardMaterial color="#6b7679" metalness={0.3} /></mesh>}
  </group>)}</group>;
}

export function PipeRack({ length }: { length: number }) {
  const posts = Math.max(2, Math.floor(length / 2) + 1);
  return <group>
    {Array.from({ length: posts }, (_, i) => <mesh key={i} position={[-length / 2 + i * length / (posts - 1), 0.45, 0]} castShadow><boxGeometry args={[0.08, 0.9, 0.08]} /><meshStandardMaterial color="#56636a" metalness={0.4} /></mesh>)}
    {[-0.07, 0.07].map((z) => <mesh key={z} position={[0, 0.92, z]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.045, 0.045, length, 10]} /><meshStandardMaterial color="#8e9ca3" metalness={0.6} roughness={0.4} /></mesh>)}
  </group>;
}
