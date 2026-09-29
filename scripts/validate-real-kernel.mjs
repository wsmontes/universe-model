import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DE442S = Object.freeze({
  displayName: "JPL DE442s",
  url: "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de442s.bsp",
  expectedBytes: 32_701_440,
  expectedMd5: "cc49327e06088124c0e39d8dde9f0b58",
});

const HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api";
const J2000_JD_TDB = 2_451_545.0;
const SECONDS_PER_DAY = 86_400;

const EPOCHS_JD_TDB = Object.freeze([
  2_451_545.0, // J2000
  2_461_311.5, // modern-era regression point
  2_469_807.5, // 2050-era regression point
]);

// Horizons currently exposes DE440/441-family major-body trajectories while
// this project pins DE442s. These are deliberately cross-ephemeris tolerances:
// tight enough to catch sign/frame/center/chain failures, not advertised as
// bit-for-bit equality between different JPL ephemeris solutions.
const CASES = Object.freeze([
  Object.freeze({
    name: "Moon relative to Earth",
    target: 301,
    center: 399,
    horizonsCenter: "500@399",
    maxPositionErrorKm: 10,
    maxVelocityErrorKmPerSecond: 0.001,
  }),
  Object.freeze({
    name: "Sun relative to Earth",
    target: 10,
    center: 399,
    horizonsCenter: "500@399",
    maxPositionErrorKm: 100,
    maxVelocityErrorKmPerSecond: 0.005,
  }),
  Object.freeze({
    name: "Earth relative to SSB",
    target: 399,
    center: 0,
    horizonsCenter: "500@0",
    maxPositionErrorKm: 1_000,
    maxVelocityErrorKmPerSecond: 0.01,
  }),
]);

function compileValidationModules() {
  const compile = spawnSync("tsc", ["-p", "tsconfig.test.json"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (compile.status !== 0) {
    process.exit(compile.status ?? 1);
  }
}

function asArrayBuffer(bytes) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

function independentMd5(bytes) {
  return createHash("md5").update(bytes).digest("hex");
}

async function verifyKernelBytes(bytes, md5Hex) {
  if (bytes.byteLength !== DE442S.expectedBytes) {
    throw new Error(
      `${DE442S.displayName} byte length mismatch: expected ${DE442S.expectedBytes}, got ${bytes.byteLength}.`,
    );
  }

  const projectDigest = md5Hex(bytes);
  const nodeDigest = independentMd5(bytes);
  if (projectDigest !== nodeDigest) {
    throw new Error(
      `MD5 implementation disagreement: project=${projectDigest}, node=${nodeDigest}.`,
    );
  }
  if (projectDigest !== DE442S.expectedMd5) {
    throw new Error(
      `${DE442S.displayName} MD5 mismatch: expected ${DE442S.expectedMd5}, got ${projectDigest}.`,
    );
  }
}

async function loadRealKernel(md5Hex) {
  const override = process.env.UNIVERSE_MODEL_DE442S;
  if (override) {
    const bytes = new Uint8Array(await readFile(override));
    await verifyKernelBytes(bytes, md5Hex);
    return { bytes, source: override };
  }

  const cacheDirectory = new URL("../.cache/", import.meta.url);
  const cacheUrl = new URL("de442s.bsp", cacheDirectory);
  await mkdir(cacheDirectory, { recursive: true });

  try {
    const cached = new Uint8Array(await readFile(cacheUrl));
    await verifyKernelBytes(cached, md5Hex);
    return { bytes: cached, source: fileURLToPath(cacheUrl) };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      // Expected on first run.
    } else {
      await rm(cacheUrl, { force: true });
      if (error instanceof Error) {
        console.warn(`Ignoring invalid cached DE442s: ${error.message}`);
      }
    }
  }

  console.log(`Downloading ${DE442S.displayName} from NASA/JPL NAIF…`);
  const response = await fetch(DE442S.url, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(
      `Unable to download ${DE442S.displayName}: HTTP ${response.status}.`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await verifyKernelBytes(bytes, md5Hex);
  await writeFile(cacheUrl, bytes);
  return { bytes, source: DE442S.url };
}

function quoted(value) {
  return `'${value}'`;
}

function horizonsUrl(target, center) {
  const url = new URL(HORIZONS_API);
  const params = url.searchParams;
  params.set("format", "json");
  params.set("COMMAND", quoted(String(target)));
  params.set("OBJ_DATA", quoted("NO"));
  params.set("MAKE_EPHEM", quoted("YES"));
  params.set("EPHEM_TYPE", quoted("VECTORS"));
  params.set("CENTER", quoted(center));
  params.set(
    "TLIST",
    EPOCHS_JD_TDB.map((jd) => quoted(jd.toFixed(9))).join(" "),
  );
  params.set("TLIST_TYPE", quoted("JD"));
  params.set("TIME_TYPE", quoted("TDB"));
  params.set("REF_PLANE", quoted("FRAME"));
  params.set("REF_SYSTEM", quoted("ICRF"));
  params.set("OUT_UNITS", quoted("KM-S"));
  params.set("VEC_TABLE", quoted("2"));
  params.set("VEC_CORR", quoted("NONE"));
  params.set("VEC_LABELS", quoted("YES"));
  params.set("CSV_FORMAT", quoted("NO"));
  params.set("TIME_DIGITS", quoted("FRACSEC"));
  return url;
}

const NUMBER = "([+\\-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[EeDd][+\\-]?\\d+)?)";
const POSITION_PATTERN = new RegExp(
  `X\\s*=\\s*${NUMBER}\\s+Y\\s*=\\s*${NUMBER}\\s+Z\\s*=\\s*${NUMBER}`,
  "g",
);
const VELOCITY_PATTERN = new RegExp(
  `VX\\s*=\\s*${NUMBER}\\s+VY\\s*=\\s*${NUMBER}\\s+VZ\\s*=\\s*${NUMBER}`,
  "g",
);

function numeric(value) {
  return Number(value.replace(/[dD]/g, "E"));
}

function parseTriplets(block, pattern, label) {
  return [...block.matchAll(pattern)].map((match) => {
    const x = match[1];
    const y = match[2];
    const z = match[3];
    if (!x || !y || !z) throw new Error(`Malformed Horizons ${label} vector.`);
    return Object.freeze({ x: numeric(x), y: numeric(y), z: numeric(z) });
  });
}

function parseHorizonsVectors(payload) {
  if (typeof payload.error === "string" && payload.error) {
    throw new Error(`Horizons API error: ${payload.error}`);
  }
  if (typeof payload.result !== "string") {
    throw new Error("Horizons API response does not contain a text result.");
  }

  const match = payload.result.match(/\$\$SOE\s*([\s\S]*?)\s*\$\$EOE/);
  if (!match?.[1]) {
    throw new Error("Horizons response does not contain an ephemeris block.");
  }

  const positions = parseTriplets(match[1], POSITION_PATTERN, "position");
  const velocities = parseTriplets(match[1], VELOCITY_PATTERN, "velocity");
  if (
    positions.length !== EPOCHS_JD_TDB.length ||
    velocities.length !== EPOCHS_JD_TDB.length
  ) {
    throw new Error(
      `Horizons returned ${positions.length} positions and ${velocities.length} velocities; expected ${EPOCHS_JD_TDB.length} of each.`,
    );
  }

  return EPOCHS_JD_TDB.map((jd, index) => Object.freeze({
    jdTdb: jd,
    positionKm: positions[index],
    velocityKmPerSecond: velocities[index],
  }));
}

async function horizonsVectors(target, center) {
  const url = horizonsUrl(target, center);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Horizons API HTTP ${response.status} for target ${target}.`);
  }
  const payload = await response.json();
  return parseHorizonsVectors(payload);
}

function maxComponentError(a, b) {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.z - b.z),
  );
}

function finiteVector(vector, label) {
  for (const [axis, value] of Object.entries(vector)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} has non-finite ${axis}: ${value}`);
    }
  }
}

compileValidationModules();

const [{ SpkKernel }, { md5Hex }] = await Promise.all([
  import("../.test-dist/src/astronomy/spk/SpkKernel.js"),
  import("../.test-dist/src/data/md5.js"),
]);

const loaded = await loadRealKernel(md5Hex);
const kernel = new SpkKernel(asArrayBuffer(loaded.bytes));

console.log(
  `Validated ${DE442S.displayName} identity (${DE442S.expectedBytes.toLocaleString()} bytes, MD5 ${DE442S.expectedMd5}).`,
);
console.log(`Kernel source: ${loaded.source}`);
console.log("Comparing geometric ICRF/J2000 states against JPL Horizons…");

const rows = [];
let failed = false;

for (const check of CASES) {
  const references = await horizonsVectors(check.target, check.horizonsCenter);
  for (const reference of references) {
    const etSeconds =
      (reference.jdTdb - J2000_JD_TDB) * SECONDS_PER_DAY;
    const actual = kernel.state(check.target, check.center, etSeconds);

    finiteVector(actual.positionKm, `${check.name} position`);
    finiteVector(actual.velocityKmPerSecond, `${check.name} velocity`);

    const positionErrorKm = maxComponentError(
      actual.positionKm,
      reference.positionKm,
    );
    const velocityErrorKmPerSecond = maxComponentError(
      actual.velocityKmPerSecond,
      reference.velocityKmPerSecond,
    );

    const passed =
      positionErrorKm <= check.maxPositionErrorKm &&
      velocityErrorKmPerSecond <= check.maxVelocityErrorKmPerSecond;
    failed ||= !passed;

    rows.push({
      check: check.name,
      jdTdb: reference.jdTdb.toFixed(1),
      maxPositionErrorKm: positionErrorKm.toExponential(4),
      positionLimitKm: check.maxPositionErrorKm,
      maxVelocityErrorKmPerSecond:
        velocityErrorKmPerSecond.toExponential(4),
      velocityLimitKmPerSecond: check.maxVelocityErrorKmPerSecond,
      result: passed ? "PASS" : "FAIL",
    });
  }
}

console.table(rows);

if (failed) {
  throw new Error(
    "Real-kernel/Horizons validation exceeded a cross-ephemeris tolerance.",
  );
}

console.log(
  "PASS: real DE442s parsing, center chaining, J2000/ICRF convention, position, and analytic velocity agree with Horizons within declared cross-ephemeris tolerances.",
);
