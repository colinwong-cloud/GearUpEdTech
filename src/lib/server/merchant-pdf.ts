import { deflateSync, inflateSync } from "zlib";
import { readFileSync } from "fs";

function pdfSafe(value: string): string {
  return String(value || "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function buildTextPdf(title: string, lines: string[]): Buffer {
  const commands = ["BT", "/F1 11 Tf", "50 800 Td", "16 TL"];
  commands.push(`(${pdfSafe(title)}) Tj`, "T*");
  for (const line of lines) {
    const safe = pdfSafe(line).slice(0, 110);
    commands.push(`(${safe}) Tj`, "T*");
  }
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  return assemblePdf(objects);
}

type RgbImage = { width: number; height: number; rgb: Buffer };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePngToRgb(png: Buffer): RgbImage {
  if (png.toString("ascii", 1, 4) !== "PNG") throw new Error("Company stamp is not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error("Company stamp must be an 8-bit PNG");
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = Buffer.alloc(height * stride);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    const row = Buffer.from(raw.subarray(src, src + stride));
    src += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error("Unsupported PNG filter");
    }
    row.copy(rows, y * stride);
    prev = row;
  }
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < rows.length; i += channels, j += 3) {
    const alpha = channels === 4 ? rows[i + 3] / 255 : 1;
    rgb[j] = Math.round(rows[i] * alpha + 255 * (1 - alpha));
    rgb[j + 1] = Math.round(rows[i + 1] * alpha + 255 * (1 - alpha));
    rgb[j + 2] = Math.round(rows[i + 2] * alpha + 255 * (1 - alpha));
  }
  return { width, height, rgb };
}

let stampImage: RgbImage | null = null;

export function companyStampImage(): RgbImage {
  if (!stampImage) {
    const png = readFileSync(new URL("./assets/gearup-stamp.png", import.meta.url));
    stampImage = decodePngToRgb(png);
  }
  return stampImage;
}

export type PdfText = {
  text: string;
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  color?: [number, number, number];
  align?: "left" | "right";
};

function textWidth(text: string, size: number): number {
  return pdfSafe(text).length * size * 0.5;
}

export function buildLayoutPdf(input: { texts: PdfText[]; drawings: string[]; image: RgbImage }): Buffer {
  const commands = [...input.drawings];
  for (const item of input.texts) {
    const color = item.color || [0.1, 0.16, 0.28];
    const safe = pdfSafe(item.text).slice(0, 90);
    const x = item.align === "right" ? item.x - textWidth(safe, item.size) : item.x;
    commands.push(
      `${color[0]} ${color[1]} ${color[2]} rg`,
      "BT",
      `/${item.bold ? "F2" : "F1"} ${item.size} Tf`,
      `${x.toFixed(1)} ${item.y.toFixed(1)} Td`,
      `(${safe}) Tj`,
      "ET"
    );
  }
  const stamp = input.image;
  const stampWidth = 118;
  const stampHeight = (stamp.height / stamp.width) * stampWidth;
  commands.push("q", `${stampWidth.toFixed(2)} 0 0 ${stampHeight.toFixed(2)} 430 210 cm`, "/Im1 Do", "Q");
  const stream = commands.join("\n");
  const imageStream = deflateSync(stamp.rgb);
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Im1 7 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    "6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n",
    `7 0 obj << /Type /XObject /Subtype /Image /Width ${stamp.width} /Height ${stamp.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${imageStream.length} >> stream\n`,
  ];
  return assemblePdf(objects, imageStream);
}

function assemblePdf(objects: string[], binaryTail?: Buffer): Buffer {
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  for (const object of objects) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    chunks.push(Buffer.from(object));
    if (binaryTail && object.includes("/Subtype /Image")) {
      chunks.push(binaryTail);
      chunks.push(Buffer.from("\nendstream\nendobj\n"));
    }
  }
  const xrefAt = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}
