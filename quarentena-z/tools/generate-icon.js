const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height) {
  // Cria canvas raw RGBA para 256x256 com o símbolo tático de Quarentena Z (círculo esmeralda com biohazard estilizado)
  const rowBytes = width * 4;
  const rawData = Buffer.alloc((rowBytes + 1) * height);

  const cx = width / 2;
  const cy = height / 2;
  const rOuter = width * 0.44;
  const rInner = width * 0.38;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowBytes + 1);
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      // Fundo circular esmeralda escuro
      if (dist <= rOuter) {
        if (dist >= rInner) {
          // Borda brilhante #10B981
          rawData[pxOffset + 0] = 0x10; // R
          rawData[pxOffset + 1] = 0xB9; // G
          rawData[pxOffset + 2] = 0x81; // B
          rawData[pxOffset + 3] = 0xFF; // A
        } else {
          // Interior #1E2228 grafite
          const angle = Math.atan2(dy, dx);
          // Símbolo tri-radial (biohazard / quarentena)
          const inBlade = Math.sin(angle * 3) > 0.1 && dist > 20 && dist < rInner - 8;
          const inCenter = dist < 14;

          if (inBlade || inCenter) {
            // Emblema esmeralda vivo #34D399
            rawData[pxOffset + 0] = 0x34;
            rawData[pxOffset + 1] = 0xD3;
            rawData[pxOffset + 2] = 0x99;
            rawData[pxOffset + 3] = 0xFF;
          } else {
            rawData[pxOffset + 0] = 0x1E;
            rawData[pxOffset + 1] = 0x22;
            rawData[pxOffset + 2] = 0x28;
            rawData[pxOffset + 3] = 0xF5;
          }
        }
      } else {
        // Transparente fora do círculo
        rawData[pxOffset + 0] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  const crcTable = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[i] = c;
  }

  function chunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const typeAndData = buf.subarray(4, 8 + len);
    buf.writeUInt32BE(crc32(typeAndData), 8 + len);
    return buf;
  }

  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk('IHDR', ihdrData);

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

const assetsDir = path.resolve(__dirname, '..', 'assets');
const pngBuffer = createPng(256, 256);
fs.writeFileSync(path.join(assetsDir, 'icon.png'), pngBuffer);

// Cria um formato ICO encapsulando o PNG
const icoHeader = Buffer.alloc(6 + 16);
icoHeader.writeUInt16LE(0, 0); // reservado
icoHeader.writeUInt16LE(1, 2); // tipo 1 = ICO
icoHeader.writeUInt16LE(1, 4); // 1 imagem

// Diretório de imagem ICO
icoHeader[6] = 0; // 256px de largura (0 = 256)
icoHeader[7] = 0; // 256px de altura
icoHeader[8] = 0; // número de cores
icoHeader[9] = 0; // reservado
icoHeader.writeUInt16LE(1, 10); // planos de cor
icoHeader.writeUInt16LE(32, 12); // bits por pixel
icoHeader.writeUInt32LE(pngBuffer.length, 14); // tamanho do PNG
icoHeader.writeUInt32LE(22, 18); // offset do dado do PNG (6 + 16 = 22)

const icoBuffer = Buffer.concat([icoHeader, pngBuffer]);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);

console.log('Ícones icon.png e icon.ico gerados com sucesso em assets/!');
