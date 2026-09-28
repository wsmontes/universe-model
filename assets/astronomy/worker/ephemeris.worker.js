/// <reference lib="webworker" />
import { parseLeapSecondKernel } from "../time/LeapSecondKernel.js";
import { TimeConverter } from "../time/TimeConverter.js";
import { SpkKernel } from "../spk/SpkKernel.js";
let spk = null;
let time = null;
self.addEventListener("message", (event) => {
    const message = event.data;
    try {
        if (message.type === "init") {
            spk = new SpkKernel(message.buffer);
            const lsk = parseLeapSecondKernel(message.leapSecondKernelText, "NAIF naif0012.tls");
            time = new TimeConverter(lsk);
            self.postMessage({ type: "success", requestId: message.requestId, kernelName: spk.name || message.manifest.displayName });
            return;
        }
        if (!spk || !time)
            throw new Error("Ephemeris worker is not initialized.");
        const instant = time.fromUtc(message.isoUtc);
        const states = message.bodies.map((bodyId) => {
            const state = spk.state(bodyId, 0, instant.etSecondsPastJ2000);
            return {
                bodyId,
                epochUtc: instant.utcIso,
                etSecondsPastJ2000: instant.etSecondsPastJ2000,
                positionKm: state.positionKm,
                velocityKmPerSecond: state.velocityKmPerSecond,
            };
        });
        self.postMessage({ type: "success", requestId: message.requestId, states });
    }
    catch (error) {
        self.postMessage({
            type: "error",
            requestId: message.requestId,
            message: error instanceof Error ? error.message : String(error),
        });
    }
});
