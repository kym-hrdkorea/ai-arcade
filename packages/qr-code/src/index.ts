export type QrSvgOptions = {
  backgroundColor?: string;
  foregroundColor?: string;
  quietZone?: number;
};

const byteCapacityByVersion = [0, 14, 26, 42, 62, 84, 106] as const;
const totalCodewordsByVersion = [0, 26, 44, 70, 100, 134, 172] as const;
const eccCodewordsPerBlockM = [0, 10, 16, 26, 18, 24, 16] as const;
const numErrorCorrectionBlocksM = [0, 1, 1, 1, 2, 2, 4] as const;
const maxSupportedVersion = 6;
const maskPattern = 0;

class BitBuffer {
  private readonly bits: number[] = [];

  get length() {
    return this.bits.length;
  }

  appendBits(value: number, length: number) {
    for (let index = length - 1; index >= 0; index -= 1) {
      this.bits.push((value >>> index) & 1);
    }
  }

  appendBytes(bytes: Uint8Array) {
    for (const byte of bytes) {
      this.appendBits(byte, 8);
    }
  }

  toCodewords(capacityBytes: number): number[] {
    const capacityBits = capacityBytes * 8;
    const terminatorLength = Math.min(4, capacityBits - this.bits.length);
    this.appendBits(0, terminatorLength);

    while (this.bits.length % 8 !== 0) {
      this.bits.push(0);
    }

    const codewords: number[] = [];

    for (let index = 0; index < this.bits.length; index += 8) {
      let value = 0;

      for (let offset = 0; offset < 8; offset += 1) {
        value = (value << 1) | (this.bits[index + offset] ?? 0);
      }

      codewords.push(value);
    }

    const padBytes = [0xec, 0x11];
    let padIndex = 0;

    while (codewords.length < capacityBytes) {
      codewords.push(padBytes[padIndex % padBytes.length] ?? 0xec);
      padIndex += 1;
    }

    return codewords;
  }
}

class QrMatrix {
  readonly isFunction: boolean[][];
  readonly modules: boolean[][];
  readonly size: number;

  constructor(version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => Array(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => Array(this.size).fill(false));
  }

  get(x: number, y: number) {
    return this.modules[y]?.[x] ?? false;
  }

  isFunctionModule(x: number, y: number) {
    return this.isFunction[y]?.[x] ?? false;
  }

  setData(x: number, y: number, dark: boolean) {
    const row = this.modules[y];

    if (!row) {
      return;
    }

    row[x] = dark;
  }

  setFunction(x: number, y: number, dark: boolean) {
    const moduleRow = this.modules[y];
    const functionRow = this.isFunction[y];

    if (!moduleRow || !functionRow) {
      return;
    }

    moduleRow[x] = dark;
    functionRow[x] = true;
  }
}

const gfExp = new Uint8Array(512);
const gfLog = new Uint8Array(256);

let gfValue = 1;

for (let index = 0; index < 255; index += 1) {
  gfExp[index] = gfValue;
  gfLog[gfValue] = index;
  gfValue <<= 1;

  if ((gfValue & 0x100) !== 0) {
    gfValue ^= 0x11d;
  }
}

for (let index = 255; index < gfExp.length; index += 1) {
  gfExp[index] = gfExp[index - 255] ?? 0;
}

function gfMultiply(first: number, second: number) {
  if (first === 0 || second === 0) {
    return 0;
  }

  return gfExp[(gfLog[first] ?? 0) + (gfLog[second] ?? 0)] ?? 0;
}

function reedSolomonGenerator(degree: number) {
  let polynomial = [1];

  for (let index = 0; index < degree; index += 1) {
    const next = Array(polynomial.length + 1).fill(0);
    const root = gfExp[index] ?? 0;

    polynomial.forEach((coefficient, coefficientIndex) => {
      next[coefficientIndex] = (next[coefficientIndex] ?? 0) ^ coefficient;
      next[coefficientIndex + 1] =
        (next[coefficientIndex + 1] ?? 0) ^ gfMultiply(coefficient, root);
    });

    polynomial = next;
  }

  return polynomial.slice(1);
}

function reedSolomonRemainder(data: number[], degree: number) {
  const generator = reedSolomonGenerator(degree);
  const result = Array(degree).fill(0);

  for (const byte of data) {
    const factor = byte ^ (result[0] ?? 0);

    for (let index = 0; index < degree - 1; index += 1) {
      result[index] = result[index + 1] ?? 0;
    }

    result[degree - 1] = 0;

    for (let index = 0; index < degree; index += 1) {
      result[index] = (result[index] ?? 0) ^ gfMultiply(generator[index] ?? 0, factor);
    }
  }

  return result;
}

function pickVersion(byteLength: number) {
  for (let version = 1; version <= maxSupportedVersion; version += 1) {
    const capacity = byteCapacityByVersion[version] ?? 0;

    if (byteLength <= capacity) {
      return version;
    }
  }

  throw new Error("QR value is too long for the local QR generator.");
}

function createDataCodewords(text: string, version: number) {
  const bytes = new TextEncoder().encode(text);
  const capacityBytes =
    (totalCodewordsByVersion[version] ?? 0) -
    (eccCodewordsPerBlockM[version] ?? 0) * (numErrorCorrectionBlocksM[version] ?? 0);
  const buffer = new BitBuffer();

  buffer.appendBits(0b0100, 4);
  buffer.appendBits(bytes.length, 8);
  buffer.appendBytes(bytes);

  if (buffer.length > capacityBytes * 8) {
    throw new Error("QR value exceeds byte mode capacity.");
  }

  return buffer.toCodewords(capacityBytes);
}

function createCodewords(dataCodewords: number[], version: number) {
  const rawCodewords = totalCodewordsByVersion[version] ?? 0;
  const eccLength = eccCodewordsPerBlockM[version] ?? 0;
  const blockCount = numErrorCorrectionBlocksM[version] ?? 0;
  const shortBlockCount = blockCount - (rawCodewords % blockCount);
  const shortBlockLength = Math.floor(rawCodewords / blockCount);
  const shortDataLength = shortBlockLength - eccLength;
  const blocks: Array<{ data: number[]; ecc: number[] }> = [];
  let dataIndex = 0;

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const dataLength = shortDataLength + (blockIndex < shortBlockCount ? 0 : 1);
    const data = dataCodewords.slice(dataIndex, dataIndex + dataLength);
    dataIndex += dataLength;
    blocks.push({
      data,
      ecc: reedSolomonRemainder(data, eccLength),
    });
  }

  const result: number[] = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));

  for (let index = 0; index < maxDataLength; index += 1) {
    for (const block of blocks) {
      const value = block.data[index];

      if (value !== undefined) {
        result.push(value);
      }
    }
  }

  for (let index = 0; index < eccLength; index += 1) {
    for (const block of blocks) {
      result.push(block.ecc[index] ?? 0);
    }
  }

  return result;
}

function drawFinder(matrix: QrMatrix, left: number, top: number) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const moduleX = left + x;
      const moduleY = top + y;

      if (
        moduleX < 0 ||
        moduleY < 0 ||
        moduleX >= matrix.size ||
        moduleY >= matrix.size
      ) {
        continue;
      }

      const isFinder =
        x >= 0 &&
        x <= 6 &&
        y >= 0 &&
        y <= 6 &&
        (x === 0 ||
          x === 6 ||
          y === 0 ||
          y === 6 ||
          (x >= 2 && x <= 4 && y >= 2 && y <= 4));

      matrix.setFunction(moduleX, moduleY, isFinder);
    }
  }
}

function drawAlignment(matrix: QrMatrix, centerX: number, centerY: number) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y));
      matrix.setFunction(centerX + x, centerY + y, distance !== 1);
    }
  }
}

function drawFormatBits(matrix: QrMatrix) {
  const bits = getFormatBits(maskPattern);

  for (let index = 0; index <= 5; index += 1) {
    matrix.setFunction(8, index, getBit(bits, index));
  }

  matrix.setFunction(8, 7, getBit(bits, 6));
  matrix.setFunction(8, 8, getBit(bits, 7));
  matrix.setFunction(7, 8, getBit(bits, 8));

  for (let index = 9; index < 15; index += 1) {
    matrix.setFunction(14 - index, 8, getBit(bits, index));
  }

  for (let index = 0; index < 8; index += 1) {
    matrix.setFunction(matrix.size - 1 - index, 8, getBit(bits, index));
  }

  for (let index = 8; index < 15; index += 1) {
    matrix.setFunction(8, matrix.size - 15 + index, getBit(bits, index));
  }

  matrix.setFunction(8, matrix.size - 8, true);
}

function drawFunctionPatterns(matrix: QrMatrix, version: number) {
  drawFinder(matrix, 0, 0);
  drawFinder(matrix, matrix.size - 7, 0);
  drawFinder(matrix, 0, matrix.size - 7);

  for (let index = 8; index < matrix.size - 8; index += 1) {
    const dark = index % 2 === 0;
    matrix.setFunction(index, 6, dark);
    matrix.setFunction(6, index, dark);
  }

  if (version >= 2) {
    drawAlignment(matrix, matrix.size - 7, matrix.size - 7);
  }

  drawFormatBits(matrix);
}

function drawData(matrix: QrMatrix, codewords: number[]) {
  const bits = codewords.flatMap((codeword) =>
    Array.from({ length: 8 }, (_, index) => (codeword >>> (7 - index)) & 1),
  );
  let bitIndex = 0;
  let upward = true;

  for (let right = matrix.size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1;
    }

    for (let vertical = 0; vertical < matrix.size; vertical += 1) {
      const y = upward ? matrix.size - 1 - vertical : vertical;

      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;

        if (matrix.isFunctionModule(x, y)) {
          continue;
        }

        const bit = bits[bitIndex] ?? 0;
        const masked = ((x + y) % 2 === 0 ? bit ^ 1 : bit) !== 0;
        matrix.setData(x, y, masked);
        bitIndex += 1;
      }
    }

    upward = !upward;
  }
}

function getFormatBits(mask: number) {
  const data = mask;
  let remainder = data << 10;

  for (let index = 14; index >= 10; index -= 1) {
    if (((remainder >>> index) & 1) !== 0) {
      remainder ^= 0x537 << (index - 10);
    }
  }

  return ((data << 10) | remainder) ^ 0x5412;
}

function getBit(value: number, index: number) {
  return ((value >>> index) & 1) !== 0;
}

function createMatrix(text: string) {
  const byteLength = new TextEncoder().encode(text).length;
  const version = pickVersion(byteLength);
  const matrix = new QrMatrix(version);
  const dataCodewords = createDataCodewords(text, version);
  const codewords = createCodewords(dataCodewords, version);

  drawFunctionPatterns(matrix, version);
  drawData(matrix, codewords);
  drawFormatBits(matrix);

  return matrix;
}

export function createQrSvg(text: string, options: QrSvgOptions = {}) {
  const matrix = createMatrix(text);
  const quietZone = Math.max(0, Math.floor(options.quietZone ?? 4));
  const foregroundColor = options.foregroundColor ?? "#0b1020";
  const backgroundColor = options.backgroundColor ?? "#f8fafc";
  const viewBoxSize = matrix.size + quietZone * 2;
  const path = Array.from({ length: matrix.size }, (_, y) =>
    Array.from({ length: matrix.size }, (_, x) =>
      matrix.get(x, y) ? `M${x + quietZone},${y + quietZone}h1v1h-1z` : "",
    )
      .filter(Boolean)
      .join(" "),
  )
    .filter(Boolean)
    .join(" ");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="${backgroundColor}"/>`,
    `<path d="${path}" fill="${foregroundColor}"/>`,
    "</svg>",
  ].join("");
}

export function createQrSvgDataUrl(text: string, options: QrSvgOptions = {}) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(createQrSvg(text, options))}`;
}
