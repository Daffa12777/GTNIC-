import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import type { Mesh } from 'three';
import type { Pump } from '../types';

const colors: Record<Pump['status']['state'], string> = {
  normal: '#16845a', waspada: '#df9b22', kritis: '#d74438', sensor: '#778899',
  ml_error: '#778899', 'tidak ada data': '#778899',
};

function Camera({ focus, zoom }: { focus: [number, number]; zoom: number }) {
  const { camera, invalidate, size } = useThree();
  useLayoutEffect(() => {
    camera.position.set(focus[0] + 10, 12, focus[1] + 12);
    camera.lookAt(focus[0], 0, focus[1]);
    if ('zoom' in camera) { camera.zoom = zoom * Math.min(1, size.width / 500); camera.updateProjectionMatrix(); }
    invalidate();
  }, [camera, focus[0], focus[1], zoom, size.width, invalidate]);
  return null;
}

function StatusLight({ state, reducedMotion }: { state: Pump['status']['state']; reducedMotion: boolean }) {
  const light = useRef<Mesh>(null);
  const alert = state === 'kritis' || state === 'waspada';
  useLayoutEffect(() => { light.current?.scale.setScalar(1); }, [state, reducedMotion]);
  useFrame(({ clock }) => {
    if (light.current && alert && !reducedMotion) {
      const pulse = 1 + (0.5 + Math.sin(clock.elapsedTime * (state === 'kritis' ? 4 : 2)) * 0.5) * 0.4;
      light.current.scale.setScalar(pulse);
    }
  });
  return <mesh ref={light} position={[0, 1.42, 0]} scale={1}><sphereGeometry args={[0.16, 16, 12]} /><meshStandardMaterial color={colors[state] ?? '#778899'} /></mesh>;
}

export default function FacilityScene({ pumps, selected, onSelect, zoom, reducedMotion }: { pumps: Pump[]; selected: string; onSelect: (id: string) => void; zoom: number; reducedMotion: boolean }) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(pumps.length)));
  const rows = Math.ceil(pumps.length / columns);
  const position = (index: number): [number, number] => [(index % columns - (columns - 1) / 2) * 3, (Math.floor(index / columns) - (rows - 1) / 2) * 3];
  const selectedIndex = pumps.findIndex((pump) => pump.id === selected);
  const focus = selectedIndex < 0 ? [0, 0] as [number, number] : position(selectedIndex);
  const animated = !reducedMotion && pumps.some((pump) => pump.status.state === 'kritis' || pump.status.state === 'waspada');
  return <Canvas orthographic frameloop={animated ? 'always' : 'demand'} dpr={[1, 1.5]} camera={{ position: [10, 12, 12], zoom, near: 0.1, far: 100 }} gl={{ antialias: true }}>
    <Camera focus={focus} zoom={zoom} />
    <color attach="background" args={['#e9f1f3']} />
    <ambientLight intensity={1.5} />
    <directionalLight position={[5, 10, 8]} intensity={2} />
    <mesh position={[0, -0.18, 0]}><boxGeometry args={[columns * 3 + 1, 0.3, rows * 3 + 1]} /><meshStandardMaterial color="#c8d8dc" /></mesh>
    <mesh position={[0, 0, 0]}><boxGeometry args={[columns * 3 + 0.8, 0.08, rows * 3 + 0.8]} /><meshStandardMaterial color="#f7faf9" /></mesh>
    {pumps.map((pump, index) => {
      const [x, z] = position(index);
      const active = pump.id === selected;
      return <group key={pump.id} position={[x, 0, z]} onClick={(event) => { event.stopPropagation(); onSelect(pump.id); }}>
        <mesh position={[0, 0.09, 0]}><boxGeometry args={[2.35, 0.12, 2.1]} /><meshStandardMaterial color={active ? '#bcd5ed' : '#e2e9e9'} /></mesh>
        <mesh position={[0, 0.42, 0]}><boxGeometry args={[1.6, 0.6, 1.15]} /><meshStandardMaterial color={pump.status.state === 'kritis' ? '#db8278' : pump.status.state === 'waspada' ? '#dbc078' : '#a8bfc5'} /></mesh>
        <mesh position={[-0.42, 0.9, 0]}><boxGeometry args={[0.55, 0.45, 0.7]} /><meshStandardMaterial color="#567d8b" /></mesh>
        <mesh position={[0.4, 0.82, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.29, 0.29, 0.7, 16]} /><meshStandardMaterial color="#7597a1" /></mesh>
        <StatusLight state={pump.status.state} reducedMotion={reducedMotion} />
        <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.025, 0.025, 0.32, 8]} /><meshStandardMaterial color="#71858c" /></mesh>
      </group>;
    })}
  </Canvas>;
}
