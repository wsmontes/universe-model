import {
  StreamingTelemetry,
} from "./StreamingTelemetry.js";

export interface HttpByteRange {
  readonly start: number;
  readonly endInclusive: number;
}

export interface HttpRangeResult {
  readonly url: string;
  readonly requestedRange:
    HttpByteRange;
  readonly returnedRange:
    HttpByteRange;
  readonly totalBytes:
    number | null;
  readonly buffer: ArrayBuffer;
  readonly contentType:
    string | null;
}

export class RangeNotSupportedError
  extends Error
{
  readonly url: string;

  constructor(url: string) {
    super(
      `HTTP Range is not supported by ${url}; refusing to download the full resource.`,
    );
    this.name =
      "RangeNotSupportedError";
    this.url = url;
  }
}

function validateRange(
  range: HttpByteRange,
): void {
  if (
    !Number.isSafeInteger(range.start) ||
    !Number.isSafeInteger(
      range.endInclusive,
    ) ||
    range.start < 0 ||
    range.endInclusive <
      range.start
  ) {
    throw new RangeError(
      "HTTP byte range must use safe integers with 0 <= start <= endInclusive.",
    );
  }
}

function parseContentRange(
  value: string | null,
): {
  range: HttpByteRange;
  totalBytes: number | null;
} {
  const match =
    value?.match(
      /^bytes (\d+)-(\d+)\/(\d+|\*)$/,
    );

  if (!match) {
    throw new Error(
      `Invalid or missing Content-Range header: ${value ?? "none"}.`,
    );
  }

  const start = Number(match[1]);
  const endInclusive =
    Number(match[2]);
  const totalBytes =
    match[3] === "*"
      ? null
      : Number(match[3]);

  const range = {
    start,
    endInclusive,
  };
  validateRange(range);

  if (
    totalBytes !== null &&
    (
      !Number.isSafeInteger(
        totalBytes,
      ) ||
      totalBytes <=
        endInclusive
    )
  ) {
    throw new Error(
      `Invalid Content-Range total length ${totalBytes}.`,
    );
  }

  return {
    range,
    totalBytes,
  };
}

export class HttpRangeFetcher {
  constructor(
    private readonly telemetry:
      StreamingTelemetry =
        new StreamingTelemetry(),
  ) {}

  async fetchRange(
    url: string,
    range: HttpByteRange,
    signal?: AbortSignal,
  ): Promise<HttpRangeResult> {
    validateRange(range);

    const response = await fetch(
      url,
      {
        mode: "cors",
        cache: "default",
        ...(signal
          ? { signal }
          : {}),
        headers: {
          Range:
            `bytes=${range.start}-${range.endInclusive}`,
        },
      },
    );

    if (response.status === 200) {
      throw new RangeNotSupportedError(
        url,
      );
    }

    if (
      response.status !== 206
    ) {
      throw new Error(
        `Range request for ${url} returned HTTP ${response.status}; expected 206 Partial Content.`,
      );
    }

    const parsed =
      parseContentRange(
        response.headers.get(
          "content-range",
        ),
      );

    if (
      parsed.range.start !==
        range.start ||
      parsed.range.endInclusive !==
        range.endInclusive
    ) {
      throw new Error(
        `Range response for ${url} returned bytes ${parsed.range.start}-${parsed.range.endInclusive}; requested ${range.start}-${range.endInclusive}.`,
      );
    }

    const buffer =
      await response.arrayBuffer();
    const expectedBytes =
      range.endInclusive -
      range.start +
      1;

    if (
      buffer.byteLength !==
      expectedBytes
    ) {
      throw new Error(
        `Range response for ${url} returned ${buffer.byteLength} bytes; expected ${expectedBytes}.`,
      );
    }

    this.telemetry.recordTransfer(
      buffer.byteLength,
    );

    return Object.freeze({
      url,
      requestedRange:
        Object.freeze({
          ...range,
        }),
      returnedRange:
        Object.freeze({
          ...parsed.range,
        }),
      totalBytes:
        parsed.totalBytes,
      buffer,
      contentType:
        response.headers.get(
          "content-type",
        ),
    });
  }
}
