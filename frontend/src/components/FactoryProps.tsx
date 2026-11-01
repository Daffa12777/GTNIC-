import { Instance, Instances } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

type Rect = { x: number; z: number; w: number; d: number };
type Kind = 'pallet' | 'drum' | 'crate' | 'bollard' | 'shelf' | 'tank';
type Placement = { kind: Kind; x: number; z: number; size: number };

// Positions are deterministic so polling never makes decoration move.
export function factoryPlacements(width: number, depth: number, keepOut: readonly Rect[]): Placement[] {
  const candidates: { kind: Kind; u: number; v: number; size: number }[] = [
    { kind: 'shelf', u: -0.45, v: -0.38, size: 0.45 }, { kind: 'tank', u: 0.45, v: -0.38, size: 0.38 },
    { kind: 'pallet', u: -0.44, v: -0.37, size: 0.45 }, { kind: 'crate', u: -0.44, v: -0.2, size: 0.35 },
    { kind: 'drum', u: 0.44, v: -0.36, size: 0.2 }, { kind: 'drum', u: 0.44, v: -0.27, size: 0.2 },
    { kind: 'crate', u: 0.40, v: 0.29, size: 0.35 }, { kind: 'pallet', u: -0.40, v: 0.33, size: 0.45 },
    { kind: 'bollard', u: -0.25, v: 0.41, size: 0.1 }, { kind: 'bollard', u: 0.25, v: 0.41, size: 0.1 },
    { kind: 'crate', u: 0.32, v: 0.40, size: 0.35 }, { kind: 'drum', u: -0.33, v: 0.40, size: 0.2 },
  ];
  return candidates.map(({ kind, u, v, size }) => ({ kind, x: u * width, z: v * depth, size }))
    .reduce<Placement[]>((placed, p) => {
      const overlaps = placed.some((other) => Math.abs(p.x - other.x) < p.size + other.size && Math.abs(p.z - other.z) < p.size + other.size);
      if (!overlaps && Math.abs(p.x) + p.size <= width / 2 && Math.abs(p.z) + p.size <= depth / 2 &&
        !keepOut.some((r) => Math.abs(p.x - r.x) < r.w / 2 + p.size + 0.1 && Math.abs(p.z - r.z) < r.d / 2 + p.size + 0.1)) placed.push(p);
      return placed;
    }, []);
}
export function FactoryProps({ width, depth, keepOut }: { width: number; depth: number; keepOut: readonly Rect[] }) {
  const placed = factoryPlacements(width, depth, keepOut);
  const { gl, invalidate } = useThree();
  const version = JSON.stringify(placed);
  useEffect(() => { gl.shadowMap.needsUpdate = true; invalidate(); }, [gl, invalidate, version]);
  return <group position={[0, 0.04, 0]}>
    <Instances castShadow receiveShadow><cylinderGeometry args={[0.17, 0.17, 0.42, 16]} /><meshStandardMaterial color="#687985" roughness={0.55} metalness={0.35} />{placed.filter((p) => p.kind === 'drum').map((p, i) => <Instance key={i} position={[p.x, 0.21, p.z]} />)}</Instances>
    <Instances castShadow receiveShadow><cylinderGeometry args={[0.05, 0.06, 0.36, 10]} /><meshStandardMaterial color="#6b7679" metalness={0.3} />{placed.filter((p) => p.kind === 'bollard').map((p, i) => <Instance key={i} position={[p.x, 0.18, p.z]} />)}</Instances>
    {placed.filter((p) => p.kind !== 'drum' && p.kind !== 'bollard').map((p, i) => <group key={i} position={[p.x, 0, p.z]}>
    {p.kind === 'pallet' && <><mesh position={[0, 0.06, 0]} castShadow receiveShadow><boxGeometry args={[0.8, 0.12, 0.6]} /><meshStandardMaterial color="#a98f78" roughness={0.9} /></mesh><mesh position={[0, 0.34, 0]} castShadow><boxGeometry args={[0.68, 0.45, 0.48]} /><meshStandardMaterial color="#c1b3a0" roughness={0.9} /></mesh></>}
    {p.kind === 'crate' && <mesh position={[0, 0.25, 0]} castShadow receiveShadow><boxGeometry args={[0.55, 0.5, 0.55]} /><meshStandardMaterial color="#8d9291" roughness={0.8} /></mesh>}
    {p.kind === 'shelf' && <><mesh position={[0, 0.75, 0]} castShadow><boxGeometry args={[0.75, 1.5, 0.45]} /><meshStandardMaterial color="#778381" metalness={0.3} /></mesh>{[0.38, 1].map((y) => <mesh key={y} position={[0, y, 0.24]}><boxGeometry args={[0.62, 0.35, 0.08]} /><meshStandardMaterial color="#c1b3a0" /></mesh>)}</>}
    {p.kind === 'tank' && <mesh position={[0, 0.75, 0]} castShadow><cylinderGeometry args={[0.29, 0.29, 1.5, 16]} /><meshStandardMaterial color="#a8afb0" metalness={0.45} roughness={0.5} /></mesh>}
  </group>)}</group>;
}

export function PipeRack({ length }: { length: number }) {
  const posts = Math.max(2, Math.floor(length / 2) + 1);
  return <group>
    <Instances castShadow><boxGeometry args={[0.08, 0.9, 0.08]} /><meshStandardMaterial color="#56636a" metalness={0.4} />{Array.from({ length: posts }, (_, i) => <Instance key={i} position={[-length / 2 + i * length / (posts - 1), 0.45, 0]} />)}</Instances>
    {[-0.07, 0.07].map((z) => <mesh key={z} position={[0, 0.92, z]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.045, 0.045, length, 10]} /><meshStandardMaterial color="#8e9ca3" metalness={0.6} roughness={0.4} /></mesh>)}
  </group>;
}
