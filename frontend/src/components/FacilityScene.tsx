import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ACESFilmicToneMapping, Mesh, PCFSoftShadowMap, type MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Pump } from '../types';
import { FactoryProps, PipeRack } from './FactoryProps';

const colors: Record<Pump['status']['state'], string> = {
  normal: '#16845a', waspada: '#df9b22', kritis: '#d74438', sensor: '#778899',
  ml_error: '#778899', 'tidak ada data': '#778899',
};
const stateLabels: Record<Pump['status']['state'], string> = {
  normal: 'Normal', waspada: 'Waspada', kritis: 'Kritis', sensor: 'Sensor bermasalah',
  ml_error: 'ML tidak tersedia', 'tidak ada data': 'Tidak ada data',
};

function zoneColor(location: string | null | undefined) {
  const text = (location ?? '').toLowerCase();
  if (text.includes('produksi')) return '#6594b1';
  if (text.includes('fabrikasi')) return '#a48c6d';
  if (text.includes('gudang')) return '#81a18d';
  return '#a6b3b6';
}

function Camera({ focus, zoom, width, depth, reducedMotion }: { focus: [number, number]; zoom: number; width: number; depth: number; reducedMotion: boolean }) {
  const { camera, invalidate, size } = useThree();
  useLayoutEffect(() => {
    if (reducedMotion) {
      camera.position.set(focus[0] + 10, 12, focus[1] + 12);
      camera.lookAt(focus[0], 0, focus[1]);
    }
    if ('zoom' in camera) {
      const projectedWidth = width * 0.77 + depth * 0.64;
      const projectedHeight = width * 0.40 + depth * 0.47 + 2.5 * 0.73;
      camera.zoom = Math.min(Math.max(1, size.width - 100) / projectedWidth, Math.max(1, size.height - 100) / projectedHeight) * zoom;
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [camera, focus[0], focus[1], zoom, size.width, size.height, width, depth, invalidate, reducedMotion]);
  useFrame((_, delta) => {
    if (reducedMotion) return;
    const alpha = 1 - Math.exp(-7 * Math.min(delta, 0.1));
    camera.position.x += (focus[0] + 10 - camera.position.x) * alpha;
    camera.position.z += (focus[1] + 12 - camera.position.z) * alpha;
    camera.lookAt(camera.position.x - 10, 0, camera.position.z - 12);
    if (Math.abs(focus[0] + 10 - camera.position.x) + Math.abs(focus[1] + 12 - camera.position.z) > 0.001) invalidate();
  });
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
  return <mesh ref={light} position={[1.02, 1.05, 0.80]} scale={1}><sphereGeometry args={[0.13, 16, 12]} /><meshStandardMaterial color={colors[state] ?? '#778899'} emissive={colors[state] ?? '#778899'} emissiveIntensity={0.45} /></mesh>;
}

function HydraulicUnit() {
  const model = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}models/hydraulic-unit.glb`, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const { gl, invalidate } = useThree();
  const scene = useMemo(() => {
    const clone = model.scene.clone();
    clone.traverse((object) => { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    return clone;
  }, [model.scene]);
  useLayoutEffect(() => { gl.shadowMap.needsUpdate = true; invalidate(); }, [gl, invalidate, scene]);
  return <primitive object={scene} position={[0, 0.17, 0]} />;
}

function RefreshShadows({ layout }: { layout: string }) {
  const { gl, invalidate } = useThree();
  useLayoutEffect(() => { gl.shadowMap.needsUpdate = true; invalidate(); }, [gl, invalidate, layout]);
  return null;
}

function StatusRing({ state, selected, hovered, reducedMotion }: { state: Pump['status']['state']; selected: boolean; hovered: boolean; reducedMotion: boolean }) {
  const ring = useRef<Mesh>(null);
  const alert = state === 'waspada' || state === 'kritis';
  useLayoutEffect(() => { if (ring.current) { ring.current.scale.setScalar(1); (ring.current.material as MeshStandardMaterial).emissiveIntensity = 0.35; } }, [state, reducedMotion]);
  useFrame(({ clock }) => {
    if (ring.current && alert && !reducedMotion) {
      const pulse = 0.5 + Math.sin(clock.elapsedTime * (state === 'kritis' ? 4 : 2)) * 0.5;
      ring.current.scale.setScalar(1 + pulse * 0.07);
      (ring.current.material as MeshStandardMaterial).emissiveIntensity = 0.25 + pulse * 0.55;
    }
  });
  if (!alert && !selected && !hovered) return null;
  const color = alert ? colors[state] : '#2765a3';
  return <mesh ref={ring} position={[0, 0.157, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.87, 0.95, 48]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} toneMapped={false} /></mesh>;
}

function Machine({ pump, position, active, index, onSelect, reducedMotion }: { pump: Pump; position: [number, number]; active: boolean; index: number; onSelect: (id: string) => void; reducedMotion: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { gl } = useThree();
  useEffect(() => () => { gl.domElement.style.cursor = ''; }, [gl]);
  return <group position={[position[0], 0, position[1]]} onClick={(event) => { event.stopPropagation(); onSelect(pump.id); }} onPointerOver={(event) => { event.stopPropagation(); setHovered(true); gl.domElement.style.cursor = 'pointer'; }} onPointerOut={() => { setHovered(false); gl.domElement.style.cursor = ''; }}>
    <mesh position={[0, 0.09, 0]} receiveShadow><boxGeometry args={[2.45, 0.12, 2.05]} /><meshStandardMaterial color={zoneColor(pump.location)} /></mesh>
    <mesh position={[0, 0.158, 0.92]}><boxGeometry args={[2.15, 0.015, 0.065]} /><meshStandardMaterial color={zoneColor(pump.location)} /></mesh>
    <group rotation={[0, index % 2 ? Math.PI / 2 : 0, 0]}><HydraulicUnit /></group>
    <StatusLight state={pump.status.state} reducedMotion={reducedMotion} />
    <StatusRing state={pump.status.state} selected={active} hovered={hovered} reducedMotion={reducedMotion} />
    {active && <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.02, 1.055, 48]} /><meshBasicMaterial color="#2365a5" /></mesh>}
    <mesh position={[1.02, 0.59, 0.80]}><cylinderGeometry args={[0.035, 0.035, 0.86, 8]} /><meshStandardMaterial color="#71858c" /></mesh>
    <Html position={[0.8, 0.18, 1.25]} center zIndexRange={[5, 0]}><button type="button" className="unit-chip" data-status={pump.status.state} aria-pressed={active} aria-label={`${pump.id} · ${stateLabels[pump.status.state] ?? pump.status.state}`} onClick={(event) => { event.stopPropagation(); onSelect(pump.id); }}><span className="unit-chip-symbol" aria-hidden="true">{pump.status.state === 'normal' ? '●' : pump.status.state === 'waspada' ? '▲' : pump.status.state === 'kritis' ? '✖' : '◆'}</span><span className="unit-chip-id">{pump.id}</span></button></Html>
  </group>;
}

export default function FacilityScene({ pumps, selected, onSelect, zoom, reducedMotion }: { pumps: Pump[]; selected: string | null; onSelect: (id: string) => void; zoom: number; reducedMotion: boolean }) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(pumps.length)));
  const rows = Math.ceil(pumps.length / columns);
  const position = (index: number): [number, number] => {
    const location = (pumps[index].location ?? '').toLowerCase();
    const offset = location.includes('produksi') ? -0.08 : location.includes('gudang') ? 0.08 : 0;
    return [(index % columns - (columns - 1) / 2) * 3.6 + offset, (Math.floor(index / columns) - (rows - 1) / 2) * 3.6];
  };
  const selectedIndex = pumps.findIndex((pump) => pump.id === selected);
  const focus = selectedIndex < 0 ? [0, 0] as [number, number] : position(selectedIndex);
  const animated = !reducedMotion && pumps.some((pump) => pump.status.state === 'kritis' || pump.status.state === 'waspada');
  const layout = JSON.stringify(pumps.map((pump) => [pump.id, pump.location]));
  const slabW = columns * 3.6 + 3.2;
  const slabD = rows * 3.6 + 3.2;
  const padRects = pumps.map((_, index) => { const [x, z] = position(index); return { x, z: z + 0.3, w: 2.9, d: 3.1 }; });
  const keepOut = [...padRects, { x: 0, z: 0, w: 0.8, d: slabD }, { x: 0, z: -slabD / 2 + 0.35, w: slabW, d: 0.7 }];
  return <Canvas orthographic frameloop={animated ? 'always' : 'demand'} dpr={[1, 1.5]} shadows={{ type: PCFSoftShadowMap }} camera={{ position: [10, 12, 12], zoom: 50, near: 0.1, far: 100 }} gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.15 }} onCreated={({ gl }) => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; }}>
    <Camera focus={focus} zoom={zoom} width={slabW} depth={slabD} reducedMotion={reducedMotion} />
    <RefreshShadows layout={layout} />
    <hemisphereLight args={['#e4eef2', '#9aabae', 0.65]} />
    <directionalLight position={[8, 12, 6]} intensity={1.7} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-slabW} shadow-camera-right={slabW} shadow-camera-top={slabD} shadow-camera-bottom={-slabD} shadow-bias={-0.0004} shadow-normalBias={0.02} />
    <Environment resolution={128} frames={1}><Lightformer form="rect" intensity={2} position={[0, 6, 4]} scale={[10, 4, 1]} /><Lightformer form="rect" intensity={0.8} position={[-6, 3, -4]} scale={[8, 3, 1]} /></Environment>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} receiveShadow><planeGeometry args={[slabW * 3, slabD * 3]} /><meshStandardMaterial color="#c1d0d0" /></mesh>
    <mesh position={[0, -0.18, 0]} receiveShadow><boxGeometry args={[slabW, 0.3, slabD]} /><meshStandardMaterial color="#aabec2" /></mesh>
    <mesh position={[0, 0, 0]} receiveShadow><boxGeometry args={[slabW - 0.2, 0.08, slabD - 0.2]} /><meshStandardMaterial color="#e6eeec" /></mesh>
    {[-0.08, 0.08].map((x) => <mesh key={x} position={[x, 0.05, 0]}><boxGeometry args={[0.06, 0.02, slabD - 0.3]} /><meshStandardMaterial color="#b5a283" /></mesh>)}
    <mesh position={[0, 0.55, -slabD / 2 + 0.1]} receiveShadow><boxGeometry args={[slabW, 1.1, 0.16]} /><meshStandardMaterial color="#b3c1c2" /></mesh>
    <mesh position={[-slabW / 2 + 0.1, 0.55, 0]} receiveShadow><boxGeometry args={[0.16, 1.1, slabD]} /><meshStandardMaterial color="#b3c1c2" /></mesh>
    <group position={[0, 0.04, -slabD / 2 + 0.4]}><PipeRack length={slabW - 1} /></group>
    {Array.from({ length: columns }, (_, index) => <mesh key={index} position={[(index - (columns - 1) / 2) * 3.6 + 1.5, 0.055, 0]} receiveShadow><boxGeometry args={[0.12, 0.03, slabD - 1]} /><meshStandardMaterial color="#889596" metalness={0.4} /></mesh>)}
    {pumps.map((pump, index) => { const [x, z] = position(index); return <group key={pump.id} position={[x + 1.35, 0, z]}><mesh position={[0, 0.055, 0]}><boxGeometry args={[0.42, 0.03, 0.12]} /><meshStandardMaterial color="#889596" metalness={0.4} /></mesh><mesh position={[-0.18, 0.2, 0]}><boxGeometry args={[0.09, 0.3, 0.09]} /><meshStandardMaterial color="#889596" metalness={0.4} /></mesh></group>; })}
    <FactoryProps width={slabW} depth={slabD} keepOut={keepOut} />
    <ContactShadows key={layout} position={[0, 0.16, 0]} scale={[slabW, slabD]} opacity={0.3} blur={2.5} far={4} resolution={512} frames={1} />
    {pumps.map((pump, index) => {
      const [x, z] = position(index);
      return <Machine key={pump.id} pump={pump} position={[x, z]} active={pump.id === selected} index={index} onSelect={onSelect} reducedMotion={reducedMotion} />;
    })}
  </Canvas>;
}
