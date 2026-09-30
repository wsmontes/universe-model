import {
  StreamingTelemetry,
} from "./StreamingTelemetry.js";

export interface StreamingRequestSpec<T> {
  readonly key: string;
  /**
   * Larger numbers run first. A later consumer may raise the priority
   * of an already queued request with the same key.
   */
  readonly priority: number;
  readonly estimatedBytes?: number;
  readonly run: (
    signal: AbortSignal,
  ) => Promise<T>;
}

export interface ScheduledRequestHandle<T> {
  readonly key: string;
  readonly promise: Promise<T>;
  cancel(reason?: string): void;
}

export interface RequestSchedulerOptions {
  readonly maxConcurrency?: number;
  readonly telemetry?: StreamingTelemetry;
}

type TaskState =
  | "queued"
  | "active"
  | "settled"
  | "cancelled";

interface Consumer<T> {
  readonly id: number;
  settled: boolean;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

interface Task<T> {
  readonly key: string;
  priority: number;
  readonly sequence: number;
  readonly estimatedBytes: number;
  readonly run: (
    signal: AbortSignal,
  ) => Promise<T>;
  readonly controller: AbortController;
  readonly consumers:
    Map<number, Consumer<T>>;
  state: TaskState;
}

export class StreamingRequestCancelledError
  extends Error
{
  readonly key: string;

  constructor(
    key: string,
    reason = "request consumer cancelled",
  ) {
    super(
      `Streaming request ${key} cancelled: ${reason}`,
    );
    this.name =
      "StreamingRequestCancelledError";
    this.key = key;
  }
}

function validateConcurrency(
  value: number,
): number {
  if (
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new RangeError(
      "maxConcurrency must be an integer >= 1.",
    );
  }
  return value;
}

function validateSpec<T>(
  spec: StreamingRequestSpec<T>,
): void {
  if (!spec.key.trim()) {
    throw new Error(
      "Streaming request key must not be empty.",
    );
  }
  if (!Number.isFinite(spec.priority)) {
    throw new RangeError(
      "Streaming request priority must be finite.",
    );
  }
  if (
    spec.estimatedBytes !== undefined &&
    (
      !Number.isFinite(
        spec.estimatedBytes,
      ) ||
      spec.estimatedBytes < 0
    )
  ) {
    throw new RangeError(
      "estimatedBytes must be finite and >= 0 when supplied.",
    );
  }
}

export class RequestScheduler {
  readonly telemetry:
    StreamingTelemetry;

  private readonly maxConcurrency:
    number;
  private readonly tasks =
    new Map<string, Task<unknown>>();
  private readonly queue:
    Task<unknown>[] = [];
  private activeCount = 0;
  private nextSequence = 1;
  private nextConsumerId = 1;
  private disposed = false;

  constructor(
    options: RequestSchedulerOptions = {},
  ) {
    this.maxConcurrency =
      validateConcurrency(
        options.maxConcurrency ?? 6,
      );
    this.telemetry =
      options.telemetry ??
      new StreamingTelemetry();
  }

  schedule<T>(
    spec: StreamingRequestSpec<T>,
  ): ScheduledRequestHandle<T> {
    if (this.disposed) {
      throw new Error(
        "RequestScheduler is disposed.",
      );
    }
    validateSpec(spec);

    const existing =
      this.tasks.get(spec.key) as
        | Task<T>
        | undefined;

    if (
      existing &&
      (
        existing.state === "queued" ||
        existing.state === "active"
      )
    ) {
      if (
        spec.priority >
        existing.priority
      ) {
        existing.priority =
          spec.priority;
        if (
          existing.state ===
          "queued"
        ) {
          this.sortQueue();
        }
      }
      this.telemetry
        .recordDeduplicatedConsumer();
      return this.addConsumer(
        existing,
      );
    }

    const task: Task<T> = {
      key: spec.key,
      priority: spec.priority,
      sequence:
        this.nextSequence++,
      estimatedBytes:
        spec.estimatedBytes ?? 0,
      run: spec.run,
      controller:
        new AbortController(),
      consumers: new Map(),
      state: "queued",
    };

    this.tasks.set(
      task.key,
      task as Task<unknown>,
    );
    this.queue.push(
      task as Task<unknown>,
    );
    this.sortQueue();
    this.telemetry.recordRequest(
      task.estimatedBytes,
    );

    const handle =
      this.addConsumer(task);
    this.pump();
    return handle;
  }

  cancelKey(
    key: string,
    reason =
      "request key cancelled",
  ): boolean {
    const task =
      this.tasks.get(key);
    if (!task) return false;

    const error =
      new StreamingRequestCancelledError(
        key,
        reason,
      );

    for (
      const consumer of
      task.consumers.values()
    ) {
      if (consumer.settled) continue;
      consumer.settled = true;
      consumer.reject(error);
      this.telemetry
        .recordCancelledConsumer();
    }
    task.consumers.clear();
    this.cancelPhysicalTask(
      task,
      reason,
    );
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (
      const key of
      [...this.tasks.keys()]
    ) {
      this.cancelKey(
        key,
        "scheduler disposed",
      );
    }
    this.queue.length = 0;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  get activeRequests(): number {
    return this.activeCount;
  }

  private addConsumer<T>(
    task: Task<T>,
  ): ScheduledRequestHandle<T> {
    const id =
      this.nextConsumerId++;

    let consumer:
      Consumer<T>;

    const promise =
      new Promise<T>(
        (resolve, reject) => {
          consumer = {
            id,
            settled: false,
            resolve,
            reject,
          };
          task.consumers.set(
            id,
            consumer,
          );
        },
      );

    const cancel = (
      reason =
        "consumer no longer needs request",
    ): void => {
      const current =
        task.consumers.get(id);
      if (
        !current ||
        current.settled
      ) {
        return;
      }

      current.settled = true;
      task.consumers.delete(id);
      current.reject(
        new StreamingRequestCancelledError(
          task.key,
          reason,
        ),
      );
      this.telemetry
        .recordCancelledConsumer();

      if (
        task.consumers.size === 0
      ) {
        this.cancelPhysicalTask(
          task as Task<unknown>,
          reason,
        );
      }
    };

    return Object.freeze({
      key: task.key,
      promise,
      cancel,
    });
  }

  private cancelPhysicalTask(
    task: Task<unknown>,
    reason: string,
  ): void {
    if (
      task.state === "settled" ||
      task.state === "cancelled"
    ) {
      return;
    }

    task.state = "cancelled";
    this.tasks.delete(task.key);

    if (
      task.controller.signal
        .aborted === false
    ) {
      task.controller.abort(reason);
    }

    const queueIndex =
      this.queue.indexOf(task);
    if (queueIndex >= 0) {
      this.queue.splice(
        queueIndex,
        1,
      );
      this.telemetry
        .recordCancelledRequest();
      this.pump();
    }
  }

  private sortQueue(): void {
    this.queue.sort(
      (a, b) =>
        b.priority - a.priority ||
        a.sequence - b.sequence,
    );
  }

  private pump(): void {
    while (
      !this.disposed &&
      this.activeCount <
        this.maxConcurrency &&
      this.queue.length > 0
    ) {
      const task =
        this.queue.shift();
      if (
        !task ||
        task.state !== "queued" ||
        task.consumers.size === 0
      ) {
        continue;
      }

      task.state = "active";
      this.activeCount += 1;

      void task.run(
        task.controller.signal,
      ).then(
        (value) => {
          this.finishSuccess(
            task,
            value,
          );
        },
        (error) => {
          this.finishFailure(
            task,
            error,
          );
        },
      );
    }
  }

  private finishSuccess(
    task: Task<unknown>,
    value: unknown,
  ): void {
    if (
      task.state === "cancelled"
    ) {
      this.activeCount -= 1;
      this.telemetry
        .recordCancelledRequest();
      this.pump();
      return;
    }

    if (
      task.state !== "active"
    ) {
      return;
    }

    task.state = "settled";
    this.activeCount -= 1;
    this.tasks.delete(task.key);
    this.telemetry.recordCompleted();

    for (
      const consumer of
      task.consumers.values()
    ) {
      if (consumer.settled) continue;
      consumer.settled = true;
      consumer.resolve(value);
    }
    task.consumers.clear();
    this.pump();
  }

  private finishFailure(
    task: Task<unknown>,
    error: unknown,
  ): void {
    if (
      task.state === "cancelled"
    ) {
      this.activeCount -= 1;
      this.telemetry
        .recordCancelledRequest();
      this.pump();
      return;
    }

    if (
      task.state !== "active"
    ) {
      return;
    }

    task.state = "settled";
    this.activeCount -= 1;
    this.tasks.delete(task.key);
    this.telemetry.recordFailed();

    for (
      const consumer of
      task.consumers.values()
    ) {
      if (consumer.settled) continue;
      consumer.settled = true;
      consumer.reject(error);
    }
    task.consumers.clear();
    this.pump();
  }
}
