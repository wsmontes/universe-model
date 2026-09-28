function leftRotate(value, amount) {
    return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}
const SHIFT = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
function writeUint32Le(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
}
function hexWordLe(value) {
    return [0, 8, 16, 24]
        .map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, "0"))
        .join("");
}
export function md5Hex(input) {
    const source = input instanceof Uint8Array ? input : new Uint8Array(input);
    const bitLength = BigInt(source.byteLength) * 8n;
    const paddedLength = Math.ceil((source.byteLength + 9) / 64) * 64;
    const bytes = new Uint8Array(paddedLength);
    bytes.set(source);
    bytes[source.byteLength] = 0x80;
    const low = Number(bitLength & 0xffffffffn) >>> 0;
    const high = Number((bitLength >> 32n) & 0xffffffffn) >>> 0;
    writeUint32Le(bytes, paddedLength - 8, low);
    writeUint32Le(bytes, paddedLength - 4, high);
    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const words = new Uint32Array(16);
    const view = new DataView(bytes.buffer);
    for (let offset = 0; offset < paddedLength; offset += 64) {
        for (let j = 0; j < 16; j += 1) {
            words[j] = view.getUint32(offset + j * 4, true);
        }
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;
        for (let i = 0; i < 64; i += 1) {
            let f;
            let g;
            if (i < 16) {
                f = (b & c) | (~b & d);
                g = i;
            }
            else if (i < 32) {
                f = (d & b) | (~d & c);
                g = (5 * i + 1) % 16;
            }
            else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            }
            else {
                f = c ^ (b | ~d);
                g = (7 * i) % 16;
            }
            const sum = (a + f + (K[i] ?? 0) + (words[g] ?? 0)) >>> 0;
            const nextB = (b + leftRotate(sum, SHIFT[i] ?? 0)) >>> 0;
            a = d;
            d = c;
            c = b;
            b = nextB;
        }
        a0 = (a0 + a) >>> 0;
        b0 = (b0 + b) >>> 0;
        c0 = (c0 + c) >>> 0;
        d0 = (d0 + d) >>> 0;
    }
    return hexWordLe(a0) + hexWordLe(b0) + hexWordLe(c0) + hexWordLe(d0);
}
