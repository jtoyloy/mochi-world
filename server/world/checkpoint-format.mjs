import { inflateRawSync } from "node:zlib";
// ZIP container integrity only; learning/pack contents remain Cadence's responsibility.
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc(bytes) {
  let n = 0xffffffff;
  for (const b of bytes) n = table[(n ^ b) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
}
export function validateLife(bytes) {
  const bad = () => {
    throw Error("Invalid Cadence checkpoint ZIP integrity");
  };
  if (bytes.length < 1000 || bytes[0] !== 80 || bytes[1] !== 75) bad();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  if (
    end < 0 ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0
  )
    bad();
  const count = bytes.readUInt16LE(end + 10),
    start = bytes.readUInt32LE(end + 16);
  let at = start,
    total = 0;
  if (!count || count === 65535 || start + bytes.readUInt32LE(end + 12) !== end)
    bad();
  try {
    for (let i = 0; i < count; i++) {
      if (at + 46 > end || bytes.readUInt32LE(at) !== 0x02014b50) bad();
      const flags = bytes.readUInt16LE(at + 8),
        method = bytes.readUInt16LE(at + 10),
        expected = bytes.readUInt32LE(at + 16),
        compressed = bytes.readUInt32LE(at + 20),
        size = bytes.readUInt32LE(at + 24),
        local = bytes.readUInt32LE(at + 42);
      total += size;
      if (
        flags & 1 ||
        total > 256 * 1024 * 1024 ||
        local + 30 > start ||
        bytes.readUInt32LE(local) !== 0x04034b50
      )
        bad();
      const dataAt =
        local +
        30 +
        bytes.readUInt16LE(local + 26) +
        bytes.readUInt16LE(local + 28);
      if (dataAt + compressed > start) bad();
      const data = bytes.subarray(dataAt, dataAt + compressed);
      const decoded =
        method === 0
          ? data
          : method === 8
            ? inflateRawSync(data, { maxOutputLength: Math.max(1, size) })
            : null;
      if (!decoded || decoded.length !== size || crc(decoded) !== expected)
        bad();
      at +=
        46 +
        bytes.readUInt16LE(at + 28) +
        bytes.readUInt16LE(at + 30) +
        bytes.readUInt16LE(at + 32);
    }
    if (at !== end) bad();
  } catch {
    bad();
  }
  return true;
}
