import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('3D asset and production content policy', () => {
  it('keeps the compressed, baked asset compatible with both frontend policies', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] };
    const policy = config.headers[0].headers.find((header) => header.key === 'Content-Security-Policy')!.value;
    expect(readFileSync('nginx.conf', 'utf8')).toContain(`Content-Security-Policy "${policy}"`);
    const scriptSources = policy.split(';').find((directive) => directive.trim().startsWith('script-src '))!.trim().split(/\s+/);
    expect(scriptSources).toContain("'wasm-unsafe-eval'");
    expect(scriptSources).not.toContain("'unsafe-eval'");

    const asset = readFileSync('public/models/hydraulic-unit.glb');
    expect(asset.toString('ascii', 0, 4)).toBe('glTF');
    const jsonLength = asset.readUInt32LE(12);
    const gltf = JSON.parse(asset.subarray(20, 20 + jsonLength).toString('utf8')) as {
      extensionsRequired: string[]; images?: unknown[]; meshes: { primitives: { attributes: Record<string, number> }[] }[];
    };
    expect(gltf.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(gltf.images ?? []).toHaveLength(0);
    expect(gltf.meshes.flatMap((mesh) => mesh.primitives).every((primitive) => primitive.attributes.COLOR_0 !== undefined)).toBe(true);
  });
});
