/// <reference lib="webworker" />

import { parseLeapSecondKernel } from "../time/LeapSecondKernel.js";
import { TimeConverter } from "../time/TimeConverter.js";
import { SpkKernel } from "../spk/SpkKernel.js";
import { BinaryPck } from "../pck/BinaryPck.js";

interface OrientationKernelInit {
  readonly buffer: ArrayBuffer;
  readonly manifest: {
    readonly bodyId: number;
    readonly frameClassId: number;
    readonly displayName: string;
    readonly frameName: string;
    readonly baseFrameName: string;
    readonly quality: string;
  };
  readonly md5: string;
  readonly source: string;
}

interface InitMessage {
  readonly type: "init";
  readonly requestId: number;
  readonly buffer: ArrayBuffer;
  readonly manifest: { readonly displayName: string; readonly expectedMd5: string };
  readonly source: string;
  readonly leapSecondKernelText: string;
  readonly orientationKernels?: readonly OrientationKernelInit[];
}

interface StateMessage {
  readonly type: "states";
  readonly requestId: number;
  readonly bodies: readonly number[];
  readonly isoUtc: string;
}

type InputMessage = InitMessage | StateMessage;

interface LoadedPck {
  readonly kernel: BinaryPck;
  readonly manifest: OrientationKernelInit["manifest"];
  readonly md5: string;
  readonly source: string;
}

let spk: SpkKernel | null = null;
let time: TimeConverter | null = null;
const orientationByBody = new Map<number, LoadedPck>();

self.addEventListener("message", (event: MessageEvent<InputMessage>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      spk = new SpkKernel(message.buffer);
      const lsk = parseLeapSecondKernel(message.leapSecondKernelText, "NAIF naif0012.tls");
      time = new TimeConverter(lsk);
      orientationByBody.clear();

      for (const entry of message.orientationKernels ?? []) {
        const kernel = new BinaryPck(entry.buffer);
        const matchingSegment = kernel.segments.find(
          (segment) => segment.frameClassId === entry.manifest.frameClassId,
        );
        if (!matchingSegment) {
          throw new Error(
            `${entry.manifest.displayName} does not contain expected frame class ${entry.manifest.frameClassId}.`,
          );
        }
        orientationByBody.set(entry.manifest.bodyId, {
          kernel,
          manifest: entry.manifest,
          md5: entry.md5,
          source: entry.source,
        });
      }

      self.postMessage({
        type: "success",
        requestId: message.requestId,
        kernelName: spk.name || message.manifest.displayName,
      });
      return;
    }

    if (!spk || !time) throw new Error("Ephemeris worker is not initialized.");
    const instant = time.fromUtc(message.isoUtc);

    const states = message.bodies.map((bodyId) => {
      const state = spk!.state(bodyId, 0, instant.etSecondsPastJ2000);
      const pck = orientationByBody.get(bodyId);
      let orientation:
        | {
            bodyFixedToJ2000: readonly number[];
            j2000ToBodyFixed: readonly number[];
            frameClassId: number;
            baseFrameId: number;
            provenance: {
              dataset: string;
              kernelMd5: string;
              kernelSource: string;
              frameName: string;
              baseFrameName: string;
              quality: string;
            };
          }
        | undefined;
      let orientationUnavailableReason: string | undefined;

      if (pck) {
        try {
          const evaluated = pck.kernel.orientation(
            pck.manifest.frameClassId,
            instant.etSecondsPastJ2000,
          );
          orientation = {
            bodyFixedToJ2000: evaluated.bodyFixedToJ2000,
            j2000ToBodyFixed: evaluated.j2000ToBodyFixed,
            frameClassId: evaluated.frameClassId,
            baseFrameId: evaluated.baseFrameId,
            provenance: {
              dataset: pck.manifest.displayName,
              kernelMd5: pck.md5,
              kernelSource: pck.source,
              frameName: pck.manifest.frameName,
              baseFrameName: pck.manifest.baseFrameName,
              quality: pck.manifest.quality,
            },
          };
        } catch (error) {
          orientationUnavailableReason =
            error instanceof Error ? error.message : String(error);
        }
      }

      return {
        bodyId,
        epochUtc: instant.utcIso,
        etSecondsPastJ2000: instant.etSecondsPastJ2000,
        positionKm: state.positionKm,
        velocityKmPerSecond: state.velocityKmPerSecond,
        ...(orientation ? { orientation } : {}),
        ...(orientationUnavailableReason ? { orientationUnavailableReason } : {}),
      };
    });

    self.postMessage({ type: "success", requestId: message.requestId, states });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
