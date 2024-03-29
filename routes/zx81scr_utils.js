"use strict";

const zx81 = require("./zx81tables");
const zx80 = require("./zx80tables");
const Jimp = require("jimp");
const fs = require("fs");
var path = require("path");

var debug = require("debug")("zxinfo-services:scr");

/**
  y = 0-191

 */
function calculateDisplayFile(y) {
  var line = Math.floor(y / 8);
  var row = y - line * 8;

  var hiByte = line & 0b00011000;
  hiByte = hiByte + row;
  var loByte = (line << 5) & 0b11100000;

  return hiByte * 256 + loByte;
}

/**
 *
 * WRAPPER Around convertIMAGE, just keep for compability
 */
function convertBMP(filename, image, offsetx, offsety, model) {
  debug(`[convertBMP] - size WxH: ${image.bitmap.width}x${image.bitmap.height}`);
  return convertIMAGE(filename, image, offsetx, offsety, "./uploads/", model);
}

/**
 * Converts Image to SCR, s81, TXT & PNG
 *
 * @param {*} filename
 * @param {*} image
 * @param {*} offsetx
 * @param {*} offsety
 * @param {*} model ZX80
 *
 * Returns Base64 of Cleaned - PNG
 *
 * Handle different sizes.
 * EightyOne is known to produce the following sizes:
 *	* No Border:		256x192 pixels
 *	* Small Border:		264x200 pixels
 *	* Standard Border:	320x240 pixels
 *	* Large border:		400x300 pixels
 *	* Full frame:		413x312 pixels
 *
 * SZ81 is known to produce 320x240 or scaled (From sz18 manual: ALT-R Cycle between 960x720, 640x480 and 320x240)
 *
 * ZXSP is known to produce 320x240 in GIF format
 *
 * ZX81 by Kevin is known to produce 640 x 512 in PNG format
 * - on iOS/iPAD and JPG on macOS (via Photos)
 */
function convertIMAGE(filename, image, offsetx, offsety, outputfolder, model) {
  const basename = path.basename(filename);
  debug(`[convertIMAGE] - filename: ${filename}, basename: ${basename}`);
  debug(`[${basename}] - size WxH: ${image.bitmap.width}x${image.bitmap.height}`);
  debug(`[${basename}] - provided offset = (${offsetx},${offsety})`);

  var calulated_offset_x = 0;
  var calulated_offset_y = 0;

  const ratio = image.bitmap.height / image.bitmap.width;
  const remainder = image.bitmap.width % 256; // against org. screen, to determine if there is a border

  // resize to actual size, based on aspect ratio
  if (image.bitmap.width > 320 && image.bitmap.height > 256) {
    debug(`[${basename}] - ratio: ${ratio}, ${remainder === 0 ? "No border" : "Border" + remainder}`);

    if (remainder === 0) {
      debug(`[${basename}] - Resizing to: ${256} x ${256 * ratio} (no border)`);
      image.resize(256, 256 * ratio);
    } else {
      debug(`[${basename}] - Resizing to: ${320} x ${320 * ratio} (border)`);
      image.resize(320, 320 * ratio);
    }
  }

  calulated_offset_x = Math.round((image.bitmap.width - 256) / 2);
  calulated_offset_y = Math.round((image.bitmap.height - 192) / 2);

  // Semi ZX81 Emulator hack... ask Kevin?
  if (ratio === 0.8 && image.bitmap.height === 256) {
    calulated_offset_y++;
  }

  debug(`[${basename}] Calculating offset = (${calulated_offset_x},${calulated_offset_y})`);

  // If user provided are different from calculated, use user provided
  if (offsetx < 0) {
    offsetx = calulated_offset_x;
    debug(`[${basename}] Using calculated offsetx`);
  }
  if (offsety < 0) {
    offsety = calulated_offset_y;
    debug(`[${basename}] Using calculated offsety`);
  }

  debug(`[${basename}] Using offset = (${offsetx},${offsety})`);

  debug(`[${basename}] 1) - Create cleaned PNG of output`);
  /* GENERATE CLEAN PNG OF INPUT */
  let cleanimage = new Jimp(image.bitmap.width, image.bitmap.height, Jimp.cssColorToHex("#cdcdcd"), (err, image) => {
    if (err) throw err;
  });
  for (var x = 0; x < image.bitmap.width; x++) {
    for (var y = 0; y < image.bitmap.height; y++) {
      var color = Jimp.intToRGBA(image.getPixelColor(x, y));
      if (color.r > 127 && color.g > 127 && color.b > 127) {
        cleanimage.setPixelColor(Jimp.cssColorToHex("#cdcdcd"), x, y);
        // high contrast = white
      } else {
        cleanimage.setPixelColor(Jimp.cssColorToHex("#000000"), x, y);
      }
    }
  }

  debug(`[${basename}] 2) - Create overlay PNG showing offset used`);
  /* GENERATE PNG SHOWING OVERLAY */
  let overlay = new Jimp(256, 192, Jimp.cssColorToHex("#ff0000"), (err, image) => {
    if (err) throw err;
  });

  overlay = image.clone().composite(overlay, offsetx, offsety, {
    mode: Jimp.BLEND_MULTIPLY,
    opacitySource: 0.5,
    opacityDest: 0.9,
  });

  debug(`[${basename}] 3) - Convert to SCR, S81 and .TXT`);
  var valid = true; // BMP only contains ZX81 characters...
  var dfile = new Array(6912);

  var output_zx81 = [];
  var textline_utc = "";
  for (var y = 0; y < 24; y++) {
    for (var x = 0; x < 32; x++) {
      var posX = offsetx + x * 8;
      var posY = offsety + y * 8;
      var pattern = "";
      for (var dy = 0; dy < 8; dy++) {
        var scr_byte = 0;
        for (var dx = 0; dx < 8; dx++) {
          var color = Jimp.intToRGBA(image.getPixelColor(posX + dx, posY + dy));
          if (color.r > 127 && color.g > 127 && color.b > 127) {
            // high contrast = white
            scr_byte = (scr_byte << 1) & 254;
          } else {
            scr_byte = (scr_byte << 1) | 1;
            //cleanimage.setPixelColor(Jimp.cssColorToHex("#000000"), 32 + x * 8 + dx, 24 + y * 8 + dy);
          }
        }
        var dfile_y = calculateDisplayFile(posY + dy - offsety);
        dfile[dfile_y + x] = scr_byte & 255;

        var binary = scr_byte.toString(2);

        pattern += binary.padStart(8, "0");
      }
      var lookup = zx81.charmap.get(pattern);
      if (model === "ZX80") lookup = zx80.charmap.get(pattern);

      // console.log(`model: ${model}, lookup: ${lookup}`);
      valid &= lookup !== undefined;

      var chr = lookup == undefined ? "?" : lookup.chr;
      var chrs = lookup == undefined ? "?" : lookup.character;
      var utc = lookup == undefined ? 0x003f : lookup.utc;

      output_zx81.push(chr);

      if (chr < 128) {
        textline_utc += "\x1b[38;5;0m\x1b[48;5;7m" + chrs;
      } else {
        textline_utc += "\x1b[38;5;7m\x1b[48;5;0m" + chrs;
      }
    }
    textline_utc += "\n";
  }
  textline_utc += "\x1b[0m";
  const blackwhiteattr = 56;
  for (var i = 0; i < 768; i++) {
    dfile[6144 + i] = blackwhiteattr;
  }

  if (!valid) {
    debug(`[${basename}] Warning, image contains non ZX81/80 chars as well`);
  }

  debug(`[${basename}] 4) - Writing output files`);
  // var name = filename.split(".").slice(0, -1).join(".");
  const name = path.parse(basename).name;
  try {
    if (model === "ZX80") {
      debug(`[${basename}] - ${name}.s80`);
      fs.writeFileSync(outputfolder + name + ".s80", new Buffer.from(output_zx81));
    } else {
      debug(`[${basename}] - ${name}.s81`);
      fs.writeFileSync(outputfolder + name + ".s81", new Buffer.from(output_zx81));
    }

    debug(`[${basename}] - ${name}.txt`);
    fs.writeFileSync(outputfolder + name + ".txt", new Buffer.from(textline_utc));
    debug(`[${basename}] - ${name}.scr`);
    fs.writeFileSync(outputfolder + name + ".scr", new Buffer.from(dfile));
    debug(`[${basename}] - ${name}.png`);
    cleanimage.write(outputfolder + name + ".png");
    debug(`[${basename}] - ${name}_ovr.png`);
    overlay.write(outputfolder + name + "_ovr.png");
  } catch (e) {
    console.error(e);
  }

  return { png: cleanimage, ovr: overlay, txt: textline_utc, used_offsetx: offsetx, used_offsety: offsety };
  // return cleanimage;
}

function convertSCR(file, offsetx, offsety) {
  debug(`[convertSCR] - file: ${file}`);
  //var filename_base = file.originalname.split(".").slice(0, -1).join(".");

  const filename_base = path.parse(file.originalname).name;
  var scrData = fs.readFileSync(file.path);

  let image = new Jimp(256, 192, Jimp.cssColorToHex("#cdcdcd"), (err, image) => {
    if (err) throw err;
  });

  for (var y = 0; y < 192; y++) {
    for (var x = 0; x < 32; x++) {
      try {
        var dfile_y = calculateDisplayFile(y);
        var data = scrData[dfile_y + x];
        for (var dx = 0; dx < 8; dx++) {
          var bit = data & 128;
          if (bit > 0) {
            image.setPixelColor(Jimp.cssColorToHex("#000000"), x * 8 + dx, y);
          } else {
            image.setPixelColor(Jimp.cssColorToHex("#cdcdcd"), x * 8 + dx, y);
          }
          data = (data << 1) & 255;
        }
      } catch (e) {
        console.log(e);
      }
    }
  }
  return convertBMP(file.originalname, image, 0, 0);
}

function convertS81(file, offsetx, offsety, model) {
  debug(`[convertS81] - file: ${file}`);
  const filename_base = path.parse(file.originalname).name;
  var scrData = fs.readFileSync(file.path);

  function getByValueChr(map, searchValue) {
    for (let [key, value] of map.entries()) {
      if (value.chr === searchValue) return key;
    }
  }

  var charmap = zx81.charmap;

  if(model === "ZX80") {
    charmap = zx80.charmap;
  }

  let image = new Jimp(256, 192, Jimp.cssColorToHex("#cdcdcd"), (err, image) => {
    if (err) throw err;
  });

  for (var y = 0; y < 24; y++) {
    for (var x = 0; x < 32; x++) {
      var idx = y * 32 + x;
      var data = scrData[idx];
      var chr = getByValueChr(charmap, data);
      var bit_index = 0;
      for (var dy = 0; dy < 8; dy++) {
        for (var dx = 0; dx < 8; dx++) {
          var bit = chr.charAt(bit_index);
          var xpos = x * 8 + dx;
          var ypos = y * 8 + dy;
          if (bit === "1") {
            image.setPixelColor(Jimp.cssColorToHex("#000000"), xpos, ypos);
          } else {
            image.setPixelColor(Jimp.cssColorToHex("#cdcdcd"), xpos, ypos);
          }
          bit_index++;
        }
      }
    }
  }

  return convertBMP(file.originalname, image, 0, 0, model);
}

module.exports = {
  convertIMAGE: convertIMAGE,
  convertBMP: convertBMP,
  convertSCR: convertSCR,
  convertS81: convertS81,
};
