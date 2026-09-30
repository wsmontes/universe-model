export interface StreamingTelemetrySnapshot {
  readonly physicalRequests: number;
  readonly deduplicatedConsumers: number;
  readonly completedRequests: number;
  readonly failedRequests: number;
  readonly cancelledRequests: number;
  readonly cancelledConsumers: number;
  readonly estimatedBytesScheduled: number;
  readonly transferredBytes: number;
  readonly cacheHits: number;
  readonly cacheHitBytes: number;
}

export class StreamingTelemetry {
  private physicalRequests = 0;
  private deduplicatedConsumers = 0;
  private completedRequests = 0;
  private failedRequests = 0;
  private cancelledRequests = 0;
  private cancelledConsumers = 0;
  private estimatedBytesScheduled = 0;
  private transferredBytes = 0;
  private cacheHits = 0;
  private cacheHitBytes = 0;

  recordRequest(
    estimatedBytes = 0,
  ): void {
    this.physicalRequests += 1;
    if (
      Number.isFinite(estimatedBytes) &&
      estimatedBytes > 0
    ) {
      this.estimatedBytesScheduled +=
        estimatedBytes;
    }
  }

  recordDeduplicatedConsumer(): void {
    this.deduplicatedConsumers += 1;
  }

  recordCompleted(): void {
    this.completedRequests += 1;
  }

  recordFailed(): void {
    this.failedRequests += 1;
  }

  recordCancelledRequest(): void {
    this.cancelledRequests += 1;
  }

  recordCancelledConsumer(): void {
    this.cancelledConsumers += 1;
  }

  recordTransfer(bytes: number): void {
    if (
      Number.isFinite(bytes) &&
      bytes >= 0
    ) {
      this.transferredBytes += bytes;
    }
  }

  recordCacheHit(bytes = 0): void {
    this.cacheHits += 1;
    if (
      Number.isFinite(bytes) &&
      bytes > 0
    ) {
      this.cacheHitBytes += bytes;
    }
  }

  snapshot(): StreamingTelemetrySnapshot {
    return Object.freeze({
      physicalRequests:
        this.physicalRequests,
      deduplicatedConsumers:
        this.deduplicatedConsumers,
      completedRequests:
        this.completedRequests,
      failedRequests:
        this.failedRequests,
      cancelledRequests:
        this.cancelledRequests,
      cancelledConsumers:
        this.cancelledConsumers,
      estimatedBytesScheduled:
        this.estimatedBytesScheduled,
      transferredBytes:
        this.transferredBytes,
      cacheHits: this.cacheHits,
      cacheHitBytes:
        this.cacheHitBytes,
    });
  }
}
