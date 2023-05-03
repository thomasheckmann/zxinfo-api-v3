/**
 * Test program for SCR converter
 *
 * DEBUG=* node index.js
 *
 * Program used for testing:
 * ------------------------------------------------------------------
 * A) Centipede, LLamasoft (Normal, A), CENTIPED.P
 * B) Forty Niner, Software Farm (Pseudo hi-res, B), FORTYNI.P
 * C) ZX81 Racing, Jim Bagley (WRX hi-res, C), JBRACIN2.P
 * D) 3D Skeleton Maze, Bukster Games (Pure text, to test 'OCR'), 3DSMAZE.P
 * E) XXX, XXX (Offset needs adjustment), XXX
 * KNOWN Formats and types:
 *
 * EightyOne
 *
 * SZ81
 * - [BMP] 320x240 - ratio: 0.75
 * - [BMP] 640x480 - ratio : 0.75
 * - [BMP] 960x720 - ratio : 0.75
 *
 * ZXSP (does not support >1K WRX as of 0.8.33-beta)
 * - [GIF] 320x240 - ratio: 0.75
 *
 * ZX81
 * - [PNG] 320x256 on iOS - ratio: 0.8
 * - [JPG] 640x512, exported from Photos on macOS - ratio: 0.8
 *
 * Clock Signal
 * - [PNG] Different sizes....
 *
 * ---- OLD
 * EightyOne is known to produce the following sizes:
 *	* No Border:		256x192 pixels
 *	* Small Border:		264x200 pixels
 *	* Standard Border:	320x240 pixels
 *	* Large border:		400x300 pixels
 *	* Full frame:		413x312 pixels
 *
 * SZ81 is known to produce 320x240 or scaled (From sz18 manual: ALT-R Cycle between 960x720, 640x480 and 320x240)
 */

const fs = require("fs");
const Jimp = require("jimp");
const converter = require("../../routes/zx81scr_utils");

const inputFolder = "./images/";
const outputFolder = "./output/";

console.log(`[TESTING ZX81 SCREEN CONVERTER]`);
console.log(`We are going to test converting images:`);
console.log(`- Normal images`);
console.log(`- Pseudo Hi-Res`);
console.log(`- WRX Hi-Res`);
console.log(`- Text only (OCR)`);
console.log();

console.log(`Creating output dir...`);
if (fs.existsSync(outputFolder)) {
  console.log(`- folder exists, removing for cleanup`);
  fs.rmSync(outputFolder, { recursive: true });
}
fs.mkdirSync(outputFolder);
console.log(`'${outputFolder}' folder created.`);

console.log(`Reading 'A.ZXSP 320x240 - Centipede.gif'`);

const fileObjs = fs.readdirSync(inputFolder, { withFileTypes: false });
fileObjs.forEach((fileName) => {
  const filePath = inputFolder + fileName;
  Jimp.read(filePath, (err, image) => {
    if (err) {
      console.error(`Error processing file: ${fileName} - skipping`);
    } else {
      console.log(`- size WxH: ${image.bitmap.width}x${image.bitmap.height}`);
      var r = converter.convertIMAGE(filePath, image, -1, -1, outputFolder);
    }
  });
});
