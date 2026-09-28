export interface SphereMesh {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

export function createUnitSphereMesh(longitudeSegments = 128, latitudeSegments = 64): SphereMesh {
  if (longitudeSegments < 3 || latitudeSegments < 2) throw new Error("Sphere tessellation is too small.");
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let lat = 0; lat <= latitudeSegments; lat += 1) {
    const theta = (lat / latitudeSegments) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let lon = 0; lon <= longitudeSegments; lon += 1) {
      const phi = (lon / longitudeSegments) * Math.PI * 2;
      vertices.push(
        sinTheta * Math.cos(phi),
        sinTheta * Math.sin(phi),
        cosTheta,
      );
    }
  }

  const row = longitudeSegments + 1;
  for (let lat = 0; lat < latitudeSegments; lat += 1) {
    for (let lon = 0; lon < longitudeSegments; lon += 1) {
      const a = lat * row + lon;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
