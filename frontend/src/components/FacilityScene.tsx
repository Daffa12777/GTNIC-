import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ACESFilmicToneMapping, CanvasTexture, Mesh, PCFSoftShadowMap, Vector3, type MeshStandardMaterial } from 'three';
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

function Camera({ focus, zoom, rotation, width, depth, reducedMotion }: { focus: [number, number]; zoom: number; rotation: number; width: number; depth: number; reducedMotion: boolean }) {
  const { camera, invalidate, size } = useThree();
  const currentFocus = useRef<[number, number]>(focus);
  const ready = useRef(false);
  const angle = rotation * Math.PI / 2;
  const xOffset = 10 * Math.cos(angle) + 12 * Math.sin(angle);
  const zOffset = 12 * Math.cos(angle) - 10 * Math.sin(angle);
  const horizontal = Math.hypot(xOffset, zOffset);
  const projectedWidth = (width * Math.abs(zOffset) + depth * Math.abs(xOffset)) / horizontal;
  const projectedHeight = (width * Math.abs(xOffset) + depth * Math.abs(zOffset)) / horizontal * 0.61 + 2.5 * 0.79;
  const targetZoom = Math.min(Math.max(1, size.width - (size.width < 700 ? 50 : 100)) / projectedWidth, Math.max(1, size.height - 100) / projectedHeight) * zoom;
  useLayoutEffect(() => {
    if (reducedMotion || !ready.current) {
      currentFocus.current = [focus[0], focus[1]];
      camera.position.set(focus[0] + xOffset, 12, focus[1] + zOffset);
      camera.lookAt(focus[0], 0, focus[1]);
      camera.zoom = targetZoom;
      camera.updateProjectionMatrix();
      ready.current = true;
    }
    invalidate();
  }, [camera, focus[0], focus[1], xOffset, zOffset, targetZoom, invalidate, reducedMotion]);
  useFrame((_, delta) => {
    if (reducedMotion) return;
    const alpha = 1 - Math.exp(-7 * Math.min(delta, 0.1));
    currentFocus.current[0] += (focus[0] - currentFocus.current[0]) * alpha;
    currentFocus.current[1] += (focus[1] - currentFocus.current[1]) * alpha;
    camera.position.x += (focus[0] + xOffset - camera.position.x) * alpha;
    camera.position.z += (focus[1] + zOffset - camera.position.z) * alpha;
    camera.zoom += (targetZoom - camera.zoom) * alpha;
    camera.updateProjectionMatrix();
    camera.lookAt(currentFocus.current[0], 0, currentFocus.current[1]);
    if (Math.abs(focus[0] + xOffset - camera.position.x) + Math.abs(focus[1] + zOffset - camera.position.z) + Math.abs(targetZoom - camera.zoom) > 0.001) invalidate();
  });
  return null;
}

function PanControls({ enabled, focus, width, depth, setPan }: { enabled: boolean; focus: [number, number]; width: number; depth: number; setPan: Dispatch<SetStateAction<[number, number]>> }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.touchAction = enabled ? 'none' : 'pan-y';
    let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
    let suppressClick = false;
    const down = (event: PointerEvent) => { if (enabled && event.isPrimary && event.button === 0) { suppressClick = false; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false }; } };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      if (!drag.moved) { drag.moved = true; canvas.setPointerCapture(event.pointerId); }
      event.preventDefault();
      const dx = (event.clientX - drag.x) / camera.zoom;
      const dy = (event.clientY - drag.y) / camera.zoom;
      drag.x = event.clientX; drag.y = event.clientY;
      const forward = camera.getWorldDirection(new Vector3());
      const vx = -forward.x, vz = -forward.z, length = Math.hypot(vx, vz) || 1;
      const rightX = vz / length, rightZ = -vx / length;
      setPan(([x, z]) => [Math.max(-width / 2 - focus[0], Math.min(width / 2 - focus[0], x - dx * rightX + dy * vx / length)), Math.max(-depth / 2 - focus[1], Math.min(depth / 2 - focus[1], z - dx * rightZ + dy * vz / length))]);
    };
    const up = (event: PointerEvent) => { if (drag?.id === event.pointerId) { suppressClick = drag.moved; drag = null; } };
    const click = (event: MouseEvent) => { if (suppressClick) { event.stopImmediatePropagation(); event.preventDefault(); suppressClick = false; } };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('click', click, true);
    return () => { canvas.style.touchAction = ''; canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('click', click, true); };
  }, [camera, gl, enabled, focus[0], focus[1], width, depth, setPan]);
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

function Apron({ size }: { size: number }) {
  const alphaMap = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
      gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.55, '#888888'); gradient.addColorStop(1, '#000000');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
    }
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => alphaMap.dispose(), [alphaMap]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} receiveShadow><planeGeometry args={[size, size]} /><meshStandardMaterial color="#acaeaa" transparent opacity={0.55} alphaMap={alphaMap} depthWrite={false} roughness={1} /></mesh>;
}

function FloorMarkings({ width, depth }: { width: number; depth: number }) {
  const map = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = 'rgba(105, 119, 116, 0.65)'; ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(20, 460); ctx.lineTo(492, 460); ctx.stroke();
      ctx.setLineDash([]); for (const x of [90, 422]) { ctx.beginPath(); ctx.moveTo(x - 18, 435); ctx.lineTo(x + 18, 435); ctx.moveTo(x + 7, 425); ctx.lineTo(x + 18, 435); ctx.lineTo(x + 7, 445); ctx.stroke(); }
    }
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => map.dispose(), [map]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.043, 0]}><planeGeometry args={[width - 0.2, depth - 0.2]} /><meshBasicMaterial map={map} transparent depthWrite={false} /></mesh>;
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

function Machine({ pump, position, active, index, direction, onSelect, reducedMotion }: { pump: Pump; position: [number, number]; active: boolean; index: number; direction: [number, number]; onSelect: (id: string) => void; reducedMotion: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { gl, size } = useThree();
  useEffect(() => () => { gl.domElement.style.cursor = ''; }, [gl]);
  return <group position={[position[0], 0, position[1]]} onClick={(event) => { event.stopPropagation(); onSelect(pump.id); }} onPointerOver={(event) => { event.stopPropagation(); setHovered(true); gl.domElement.style.cursor = 'pointer'; }} onPointerOut={() => { setHovered(false); gl.domElement.style.cursor = ''; }}>
    <mesh position={[0, 0.09, 0]} receiveShadow><boxGeometry args={[2.45, 0.12, 2.05]} /><meshStandardMaterial color={zoneColor(pump.location)} /></mesh>
    <mesh position={[0, 0.158, 0.92]}><boxGeometry args={[2.15, 0.015, 0.065]} /><meshStandardMaterial color={zoneColor(pump.location)} /></mesh>
    <group rotation={[0, index % 2 ? Math.PI / 2 : 0, 0]}><HydraulicUnit /></group>
    <StatusLight state={pump.status.state} reducedMotion={reducedMotion} />
    <StatusRing state={pump.status.state} selected={active} hovered={hovered} reducedMotion={reducedMotion} />
    {active && <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.02, 1.055, 48]} /><meshBasicMaterial color="#2365a5" /></mesh>}
    <mesh position={[1.02, 0.59, 0.80]}><cylinderGeometry args={[0.035, 0.035, 0.86, 8]} /><meshStandardMaterial color="#71858c" /></mesh>
    <Html position={[direction[0] * 1.05, 0.18, direction[1] * 1.48]} center distanceFactor={size.width > 700 ? 0.025 : undefined} zIndexRange={[5, 0]}><button type="button" className="unit-chip" data-status={pump.status.state} aria-pressed={active} aria-label={`${pump.id} · ${stateLabels[pump.status.state] ?? pump.status.state}`} onClick={(event) => { event.stopPropagation(); onSelect(pump.id); }}><span className="unit-chip-symbol" aria-hidden="true">{pump.status.state === 'normal' ? '●' : pump.status.state === 'waspada' ? '▲' : pump.status.state === 'kritis' ? '✖' : '◆'}</span><span className="unit-chip-id">{pump.id}{pump.status.state !== 'normal' && <span className="unit-chip-status"> · {pump.status.state === 'sensor' ? 'Sensor' : pump.status.state === 'ml_error' ? 'ML error' : pump.status.state === 'tidak ada data' ? 'Tanpa data' : stateLabels[pump.status.state]}</span>}</span></button></Html>
  </group>;
}

export default function FacilityScene({ pumps, selected, onSelect, zoom, rotation, pan, setPan, reducedMotion }: { pumps: Pump[]; selected: string | null; onSelect: (id: string) => void; zoom: number; rotation: number; pan: [number, number]; setPan: Dispatch<SetStateAction<[number, number]>>; reducedMotion: boolean }) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(pumps.length)));
  const rows = Math.ceil(pumps.length / columns);
  const position = (index: number): [number, number] => {
    const location = (pumps[index].location ?? '').toLowerCase();
    const offset = location.includes('produksi') ? -0.08 : location.includes('gudang') ? 0.08 : 0;
    return [(index % columns - (columns - 1) / 2) * 3.6 + offset, (Math.floor(index / columns) - (rows - 1) / 2) * 4.3];
  };
  const selectedIndex = pumps.findIndex((pump) => pump.id === selected);
  const baseFocus = selectedIndex < 0 ? [0, 0] as [number, number] : position(selectedIndex);
  const focus: [number, number] = [baseFocus[0] + pan[0], baseFocus[1] + pan[1]];
  const angle = rotation * Math.PI / 2;
  const direction: [number, number] = [Math.sign(10 * Math.cos(angle) + 12 * Math.sin(angle)), Math.sign(12 * Math.cos(angle) - 10 * Math.sin(angle))];
  const animated = !reducedMotion && pumps.some((pump) => pump.status.state === 'kritis' || pump.status.state === 'waspada');
  const layout = JSON.stringify(pumps.map((pump) => [pump.id, pump.location]));
  const slabW = columns * 3.6 + 3.2;
  const slabD = rows * 4.3 + 3.2;
  const padRects = pumps.map((_, index) => { const [x, z] = position(index); return { x: x + 0.2, z: z + 0.45, w: 3.3, d: 3.5 }; });
  const keepOut = [...padRects, { x: 0, z: 0, w: 0.8, d: slabD }, { x: 0, z: -slabD / 2 + 0.35, w: slabW, d: 0.7 }];
  return <Canvas orthographic frameloop={animated ? 'always' : 'demand'} dpr={[1, 1.5]} shadows={{ type: PCFSoftShadowMap }} camera={{ position: [10, 12, 12], zoom: 50, near: 0.1, far: 100 }} gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.15 }} onCreated={({ gl }) => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; }}>
    <Camera focus={focus} zoom={zoom} rotation={rotation} width={slabW} depth={slabD} reducedMotion={reducedMotion} />
    <PanControls enabled={zoom > 1} focus={baseFocus} width={slabW} depth={slabD} setPan={setPan} />
    <RefreshShadows layout={`${layout}-${rotation}`} />
    <hemisphereLight args={['#e4eef2', '#9aabae', 0.65]} />
    <directionalLight position={[8, 12, 6]} intensity={1.7} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-slabW} shadow-camera-right={slabW} shadow-camera-top={slabD} shadow-camera-bottom={-slabD} shadow-bias={-0.0004} shadow-normalBias={0.02} />
    <Environment resolution={128} frames={1}><Lightformer form="rect" intensity={2} position={[0, 6, 4]} scale={[10, 4, 1]} /><Lightformer form="rect" intensity={0.8} position={[-6, 3, -4]} scale={[8, 3, 1]} /></Environment>
    <Apron size={Math.hypot(slabW, slabD) * 3} />
    <mesh position={[0, -0.18, 0]} receiveShadow><boxGeometry args={[slabW, 0.3, slabD]} /><meshStandardMaterial color="#aabec2" /></mesh>
    <mesh position={[0, 0, 0]} receiveShadow><boxGeometry args={[slabW - 0.2, 0.08, slabD - 0.2]} /><meshStandardMaterial color="#e6eeec" /></mesh>
    <FloorMarkings width={slabW} depth={slabD} />
    {[-0.08, 0.08].map((x) => <mesh key={x} position={[x, 0.05, 0]}><boxGeometry args={[0.06, 0.02, slabD - 0.3]} /><meshStandardMaterial color="#b5a283" /></mesh>)}
    <mesh position={[0, 0.55, -direction[1] * (slabD / 2 - 0.1)]} receiveShadow><boxGeometry args={[slabW, 1.1, 0.16]} /><meshStandardMaterial color="#b3c1c2" /></mesh>
    <mesh position={[-direction[0] * (slabW / 2 - 0.1), 0.55, 0]} receiveShadow><boxGeometry args={[0.16, 1.1, slabD]} /><meshStandardMaterial color="#b3c1c2" /></mesh>
    {[-0.32, 0, 0.32].map((part) => <mesh key={part} position={[-direction[0] * (slabW / 2 - 0.2), 0.58, part * slabD]}><boxGeometry args={[0.16, 1.16, 0.12]} /><meshStandardMaterial color="#839493" metalness={0.2} /></mesh>)}
    <group position={[0, 0.04, -direction[1] * (slabD / 2 - 0.4)]}><PipeRack length={slabW - 1} /></group>
    {Array.from({ length: columns }, (_, index) => <mesh key={index} position={[(index - (columns - 1) / 2) * 3.6 + 1.5, 0.055, 0]} receiveShadow><boxGeometry args={[0.12, 0.03, slabD - 1]} /><meshStandardMaterial color="#889596" metalness={0.4} /></mesh>)}
    {pumps.map((pump, index) => { const [x, z] = position(index); return <group key={pump.id} position={[x + 1.35, 0, z]}><mesh position={[0, 0.055, 0]}><boxGeometry args={[0.42, 0.03, 0.12]} /><meshStandardMaterial color="#889596" metalness={0.4} /></mesh><mesh position={[-0.18, 0.2, 0]}><boxGeometry args={[0.09, 0.3, 0.09]} /><meshStandardMaterial color="#889596" metalness={0.4} /></mesh></group>; })}
    <FactoryProps width={slabW} depth={slabD} keepOut={keepOut} direction={direction} />
    <ContactShadows key={`${layout}-${rotation}`} position={[0, 0.16, 0]} scale={[slabW, slabD]} opacity={0.3} blur={2.5} far={4} resolution={512} frames={1} />
    {pumps.map((pump, index) => {
      const [x, z] = position(index);
      return <Machine key={pump.id} pump={pump} position={[x, z]} active={pump.id === selected} index={index} direction={direction} onSelect={onSelect} reducedMotion={reducedMotion} />;
    })}
  </Canvas>;
}
