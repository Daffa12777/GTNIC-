import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
  return <mesh ref={light} position={[0.92, 1.98, 0.58]} scale={1}><sphereGeometry args={[0.13, 16, 12]} /><meshStandardMaterial color={colors[state] ?? '#778899'} emissive={colors[state] ?? '#778899'} emissiveIntensity={0.25} /></mesh>;
}

function HydraulicUnit() {
  const model = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}models/hydraulic-unit.glb`);
  const scene = useMemo(() => model.scene.clone(), [model.scene]);
  return <primitive object={scene} position={[0, 0.17, 0]} />;
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
    <color attach="background" args={['#dde8ea']} />
    <ambientLight intensity={1.3} />
    <directionalLight position={[5, 10, 8]} intensity={2.1} />
    <directionalLight position={[-5, 4, -6]} intensity={0.7} />
    <mesh position={[0, -0.18, 0]}><boxGeometry args={[columns * 3 + 1, 0.3, rows * 3 + 1]} /><meshStandardMaterial color="#aabec2" /></mesh>
    <mesh position={[0, 0, 0]}><boxGeometry args={[columns * 3 + 0.8, 0.08, rows * 3 + 0.8]} /><meshStandardMaterial color="#e6eeec" /></mesh>
    <mesh position={[0, 0.08, 0]}><boxGeometry args={[0.16, 0.09, rows * 3 + 0.55]} /><meshStandardMaterial color="#d2a744" /></mesh>
    <mesh position={[0, 0.08, -(rows * 3 + 0.55) / 2]}><boxGeometry args={[columns * 3 + 0.6, 0.15, 0.12]} /><meshStandardMaterial color="#829da3" /></mesh>
    {pumps.map((pump, index) => {
      const [x, z] = position(index);
      const active = pump.id === selected;
      return <group key={pump.id} position={[x, 0, z]} onClick={(event) => { event.stopPropagation(); onSelect(pump.id); }}>
        <mesh position={[0, 0.09, 0]}><boxGeometry args={[2.45, 0.12, 2.05]} /><meshStandardMaterial color={pump.status.state === 'kritis' ? '#d9867c' : pump.status.state === 'waspada' ? '#ddbd6d' : active ? '#8db6c8' : '#bdcece'} /></mesh>
        <HydraulicUnit />
        <StatusLight state={pump.status.state} reducedMotion={reducedMotion} />
        <mesh position={[0.92, 1.72, 0.58]}><cylinderGeometry args={[0.025, 0.025, 0.48, 8]} /><meshStandardMaterial color="#71858c" /></mesh>
      </group>;
    })}
  </Canvas>;
}
