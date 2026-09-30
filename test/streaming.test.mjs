import test from "node:test";
import assert from "node:assert/strict";
import {
  RequestScheduler,
  StreamingRequestCancelledError,
} from "../.test-dist/src/streaming/RequestScheduler.js";
import {
  StreamingTelemetry,
} from "../.test-dist/src/streaming/StreamingTelemetry.js";
import {
  HttpRangeFetcher,
  RangeNotSupportedError,
} from "../.test-dist/src/streaming/HttpRangeFetcher.js";
import {
  evidenceCacheIdentity,
} from "../.test-dist/src/streaming/EvidenceCacheIdentity.js";
import {
  metersPerPixelAtDistance,
  screenSpaceErrorPixels,
  shouldRefineLod,
  targetGeometricErrorMeters,
} from "../.test-dist/src/streaming/LodPolicy.js";
import {
  BudgetedLruCache,
  ResourceBudgetExceededError,
} from "../.test-dist/src/streaming/BudgetedLruCache.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("scheduler runs higher-priority queued work first", async () => {
  const scheduler = new RequestScheduler({
    maxConcurrency: 1,
  });
  const gate = deferred();
  const order = [];

  const blocker = scheduler.schedule({
    key: "blocker",
    priority: 0,
    async run() {
      order.push("blocker-start");
      await gate.promise;
      order.push("blocker-end");
      return "blocker";
    },
  });

  await Promise.resolve();

  const low = scheduler.schedule({
    key: "low",
    priority: 1,
    async run() {
      order.push("low-start");
      return "low";
    },
  });

  const high = scheduler.schedule({
    key: "high",
    priority: 10,
    async run() {
      order.push("high-start");
      return "high";
    },
  });

  gate.resolve();

  assert.deepEqual(
    await Promise.all([
      blocker.promise,
      low.promise,
      high.promise,
    ]),
    ["blocker", "low", "high"],
  );

  assert.deepEqual(order, [
    "blocker-start",
    "blocker-end",
    "high-start",
    "low-start",
  ]);
  scheduler.dispose();
});

test("deduplicated consumers can cancel independently", async () => {
  const telemetry = new StreamingTelemetry();
  const scheduler = new RequestScheduler({
    maxConcurrency: 1,
    telemetry,
  });
  const gate = deferred();
  let runCount = 0;

  const first = scheduler.schedule({
    key: "tile:1",
    priority: 1,
    async run() {
      runCount += 1;
      await gate.promise;
      return 42;
    },
  });

  const second = scheduler.schedule({
    key: "tile:1",
    priority: 5,
    async run() {
      throw new Error(
        "deduplicated run must not execute",
      );
    },
  });

  const firstRejected = assert.rejects(
    first.promise,
    StreamingRequestCancelledError,
  );
  first.cancel("consumer left view");
  await firstRejected;

  gate.resolve();
  assert.equal(await second.promise, 42);
  assert.equal(runCount, 1);

  const snapshot = telemetry.snapshot();
  assert.equal(
    snapshot.physicalRequests,
    1,
  );
  assert.equal(
    snapshot.deduplicatedConsumers,
    1,
  );
  assert.equal(
    snapshot.cancelledConsumers,
    1,
  );
  assert.equal(
    snapshot.completedRequests,
    1,
  );
  scheduler.dispose();
});

test("late resolution after cancellation releases scheduler capacity", async () => {
  const telemetry = new StreamingTelemetry();
  const scheduler = new RequestScheduler({
    maxConcurrency: 1,
    telemetry,
  });
  const gate = deferred();

  const ignoredAbort = scheduler.schedule({
    key: "ignores-abort",
    priority: 1,
    async run() {
      await gate.promise;
      return "late";
    },
  });

  await Promise.resolve();

  const cancelled = assert.rejects(
    ignoredAbort.promise,
    StreamingRequestCancelledError,
  );
  ignoredAbort.cancel(
    "camera moved elsewhere",
  );
  await cancelled;

  let secondStarted = false;
  const second = scheduler.schedule({
    key: "next",
    priority: 1,
    async run() {
      secondStarted = true;
      return "next";
    },
  });

  assert.equal(secondStarted, false);
  gate.resolve();
  assert.equal(
    await second.promise,
    "next",
  );
  assert.equal(
    scheduler.activeRequests,
    0,
  );
  assert.equal(
    telemetry.snapshot()
      .cancelledRequests,
    1,
  );
  scheduler.dispose();
});

test("HTTP Range fetcher validates exact 206 response and records bytes", async () => {
  const originalFetch = globalThis.fetch;
  const telemetry = new StreamingTelemetry();

  globalThis.fetch = async (
    input,
    init,
  ) => {
    assert.equal(
      String(input),
      "https://example.test/data.bin",
    );
    assert.equal(
      new Headers(init?.headers).get(
        "range",
      ),
      "bytes=10-13",
    );
    return new Response(
      new Uint8Array([1, 2, 3, 4]),
      {
        status: 206,
        headers: {
          "content-range":
            "bytes 10-13/100",
          "content-type":
            "application/octet-stream",
        },
      },
    );
  };

  try {
    const result =
      await new HttpRangeFetcher(
        telemetry,
      ).fetchRange(
        "https://example.test/data.bin",
        {
          start: 10,
          endInclusive: 13,
        },
      );

    assert.equal(
      result.buffer.byteLength,
      4,
    );
    assert.equal(
      result.totalBytes,
      100,
    );
    assert.deepEqual(
      result.returnedRange,
      {
        start: 10,
        endInclusive: 13,
      },
    );
    assert.equal(
      telemetry.snapshot()
        .transferredBytes,
      4,
    );
  } finally {
    globalThis.fetch =
      originalFetch;
  }
});

test("HTTP Range fetcher refuses silent full-file fallback", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      new Uint8Array([1, 2, 3]),
      { status: 200 },
    );

  try {
    await assert.rejects(
      () =>
        new HttpRangeFetcher()
          .fetchRange(
            "https://example.test/huge.bin",
            {
              start: 0,
              endInclusive: 2,
            },
          ),
      RangeNotSupportedError,
    );
  } finally {
    globalThis.fetch =
      originalFetch;
  }
});

function cacheEvidence(overrides = {}) {
  return {
    source: {
      id: "source",
      name: "Source",
      authority: "official",
      product: "Product",
      version: "v1",
    },
    resolution: {
      spatialMeters: 30,
    },
    referenceFrame: "ITRF93",
    kind: "measurement",
    license: { name: "test" },
    attribution: { text: "test" },
    integrity: {
      verified: true,
      digest: "abc123",
    },
    payload: {
      kind: "terrain-tile",
      uri: "https://example.test/tile",
    },
    ...overrides,
  };
}

test("cache identity only marks verified immutable evidence persistent-safe", () => {
  const verified =
    evidenceCacheIdentity(
      cacheEvidence(),
    );
  assert.equal(
    verified.persistentSafe,
    true,
  );

  const unverified =
    evidenceCacheIdentity(
      cacheEvidence({
        integrity: {
          verified: false,
          immutableId: "release-1",
        },
      }),
    );
  assert.equal(
    unverified.persistentSafe,
    false,
  );
  assert.notEqual(
    verified.key,
    unverified.key,
  );
});


test("LOD policy converts physical geometric error to screen pixels", () => {
  const view = {
    distanceMeters: 1000,
    viewportHeightPixels: 1000,
    verticalFovRadians:
      Math.PI / 2,
  };

  assert.ok(
    Math.abs(
      metersPerPixelAtDistance(view) -
        2,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(
      screenSpaceErrorPixels(
        10,
        view,
      ) - 5,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(
      targetGeometricErrorMeters(
        view,
        2,
      ) - 4,
    ) < 1e-12,
  );
  assert.equal(
    shouldRefineLod(
      10,
      view,
      2,
    ),
    true,
  );
  assert.equal(
    shouldRefineLod(
      2,
      view,
      2,
    ),
    false,
  );
});


test("budgeted LRU evicts least-recently-used unpinned resources", () => {
  const evicted = [];
  const cache =
    new BudgetedLruCache({
      maxBytes: 10,
      onEvict(key) {
        evicted.push(key);
      },
    });

  cache.set("a", "A", 4);
  cache.set("b", "B", 4);
  assert.equal(cache.get("a"), "A");
  cache.set("c", "C", 4);

  assert.equal(
    cache.has("a"),
    true,
  );
  assert.equal(
    cache.has("b"),
    false,
  );
  assert.equal(
    cache.has("c"),
    true,
  );
  assert.deepEqual(
    evicted,
    ["b"],
  );
  assert.equal(
    cache.snapshot().usedBytes,
    8,
  );
});

test("budgeted LRU never evicts pinned resources to admit new data", () => {
  const cache =
    new BudgetedLruCache({
      maxBytes: 8,
    });

  cache.set("active", "A", 8);
  cache.pin("active");

  assert.throws(
    () =>
      cache.set(
        "incoming",
        "B",
        1,
      ),
    ResourceBudgetExceededError,
  );

  assert.equal(
    cache.get("active"),
    "A",
  );
  assert.equal(
    cache.has("incoming"),
    false,
  );
});
