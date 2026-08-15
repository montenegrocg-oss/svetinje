import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("ZIP end-of-central-directory record was not found");
}

export function readZipEntries(buffer) {
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error(`Invalid ZIP central-directory entry at offset ${offset}`);
    }
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.set(name, { compression, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    names: [...entries.keys()],
    read(name) {
      const entry = entries.get(name);
      if (!entry) throw new Error(`ZIP entry not found: ${name}`);
      if (buffer.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE) {
        throw new Error(`Invalid ZIP local entry for ${name}`);
      }
      const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
      const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
      const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
      const data = entry.compression === 0
        ? Buffer.from(compressed)
        : entry.compression === 8
          ? inflateRawSync(compressed)
          : undefined;
      if (!data) throw new Error(`Unsupported ZIP compression method ${entry.compression} for ${name}`);
      if (data.length !== entry.uncompressedSize) throw new Error(`ZIP size mismatch for ${name}`);
      return data;
    },
  };
}
