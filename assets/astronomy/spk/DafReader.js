const DAF_RECORD_BYTES = 1024;
function ascii(view, offset, length) {
    let out = "";
    for (let i = 0; i < length; i += 1) {
        out += String.fromCharCode(view.getUint8(offset + i));
    }
    return out;
}
export class DafReader {
    view;
    fileRecord;
    constructor(buffer) {
        if (buffer.byteLength < DAF_RECORD_BYTES) {
            throw new Error("DAF buffer is smaller than one 1024-byte record.");
        }
        this.view = new DataView(buffer);
        this.fileRecord = this.parseFileRecord();
    }
    parseFileRecord() {
        const idWord = ascii(this.view, 0, 8);
        if (!idWord.startsWith("DAF/")) {
            throw new Error(`Not a DAF file: IDWORD=${JSON.stringify(idWord)}`);
        }
        const binaryFormat = ascii(this.view, 88, 8).trim();
        if (binaryFormat !== "LTL-IEEE" && binaryFormat !== "BIG-IEEE") {
            throw new Error(`Unsupported DAF binary format: ${binaryFormat || "<blank>"}`);
        }
        const littleEndian = binaryFormat === "LTL-IEEE";
        return Object.freeze({
            idWord,
            nd: this.view.getInt32(8, littleEndian),
            ni: this.view.getInt32(12, littleEndian),
            internalFileName: ascii(this.view, 16, 60).trimEnd(),
            firstSummaryRecord: this.view.getInt32(76, littleEndian),
            lastSummaryRecord: this.view.getInt32(80, littleEndian),
            firstFreeAddress: this.view.getInt32(84, littleEndian),
            binaryFormat,
            littleEndian,
        });
    }
    summaries() {
        const { nd, ni, firstSummaryRecord, littleEndian } = this.fileRecord;
        const summaryDoubleWords = nd + Math.ceil(ni / 2);
        const summaryBytes = summaryDoubleWords * 8;
        const summaries = [];
        const visited = new Set();
        let recordNumber = firstSummaryRecord;
        while (recordNumber > 0) {
            if (visited.has(recordNumber))
                throw new Error("Cycle detected in DAF summary records.");
            visited.add(recordNumber);
            const offset = (recordNumber - 1) * DAF_RECORD_BYTES;
            if (offset + DAF_RECORD_BYTES > this.view.byteLength) {
                throw new Error(`DAF summary record ${recordNumber} exceeds file bounds.`);
            }
            const next = Math.round(this.view.getFloat64(offset, littleEndian));
            const count = Math.round(this.view.getFloat64(offset + 16, littleEndian));
            if (count < 0 || count > Math.floor((DAF_RECORD_BYTES - 24) / summaryBytes)) {
                throw new Error(`Invalid DAF summary count ${count} in record ${recordNumber}.`);
            }
            for (let i = 0; i < count; i += 1) {
                const summaryOffset = offset + 24 + i * summaryBytes;
                const doubles = [];
                for (let j = 0; j < nd; j += 1) {
                    doubles.push(this.view.getFloat64(summaryOffset + j * 8, littleEndian));
                }
                const integers = [];
                const integerOffset = summaryOffset + nd * 8;
                for (let j = 0; j < ni; j += 1) {
                    integers.push(this.view.getInt32(integerOffset + j * 4, littleEndian));
                }
                summaries.push(Object.freeze({
                    startEtSeconds: doubles[0] ?? 0,
                    endEtSeconds: doubles[1] ?? 0,
                    integers: Object.freeze(integers),
                }));
            }
            recordNumber = next;
        }
        return summaries;
    }
}
