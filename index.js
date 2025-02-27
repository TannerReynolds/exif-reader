var tags = require('./tags');

module.exports = function(buffer) {
  /*
  if (buffer.toString('ascii', 0, 5) !== 'Exif\0')
    throw new Error('Invalid EXIF data: buffer should start with "Exif".');
    */ 
  // No.

  var bigEndian = null;
  if (buffer[6] === 0x49 && buffer[7] === 0x49)
    bigEndian = false;
  else if (buffer[6] === 0x4d && buffer[7] === 0x4d)
    bigEndian = true;
  else
    throw new Error('Invalid EXIF data: expected byte order marker.');

  if (readUInt16(buffer, 8, bigEndian) !== 0x002A)
    throw new Error('Invalid EXIF data: expected 0x002A.');

  var ifdOffset = readUInt32(buffer, 10, bigEndian) + 6;
  if (ifdOffset < 8)
    throw new Error('Invalid EXIF data: ifdOffset < 8');

  var result = {};
  var ifd0 = readTags(buffer, ifdOffset, bigEndian, tags.exif);
  result.image = ifd0;

  var numEntries = readUInt16(buffer, ifdOffset, bigEndian);
  ifdOffset = readUInt32(buffer, ifdOffset + 2 + numEntries * 12, bigEndian);
  if (ifdOffset !== 0)
    result.thumbnail = readTags(buffer, ifdOffset + 6, bigEndian, tags.exif);

  if (ifd0.ExifOffset)
    result.exif = readTags(buffer, ifd0.ExifOffset + 6, bigEndian, tags.exif);

  if (ifd0.GPSInfo)
    result.gps = readTags(buffer, ifd0.GPSInfo + 6, bigEndian, tags.gps);

  if (ifd0.InteropOffset)
    result.interop = readTags(buffer, ifd0.InteropOffset + 6, bigEndian, tags.exif);

  return result;
};

var DATE_KEYS = {
  DateTimeOriginal: true,
  DateTimeDigitized: true,
  ModifyDate: true
};

function readTags(buffer, offset, bigEndian, tags) {
  var numEntries = readUInt16(buffer, offset, bigEndian);
  offset += 2;

  var res = {};
  for (var i = 0; i < numEntries; i++) {
    var tag = readUInt16(buffer, offset, bigEndian);
    offset += 2;

    var key = tags[tag] || tag;
    var val = readTag(buffer, offset, bigEndian);

    if (key in DATE_KEYS)
      val = parseDate(val);

    res[key] = val;
    offset += 10;
  }

  return res;
}

var SIZE_LOOKUP = [1, 1, 2, 4, 8, 1, 1, 2, 4, 8];

function readTag(buffer, offset, bigEndian) {
  var type = readUInt16(buffer, offset, bigEndian);
  var numValues = readUInt32(buffer, offset + 2, bigEndian);
  var valueSize = SIZE_LOOKUP[type - 1];
  var valueOffset = valueSize * numValues <= 4 ? offset + 6 : readUInt32(buffer, offset + 6, bigEndian) + 6;

  // Special case for ascii strings
  if (type === 2) {
    var string = buffer.toString('ascii', valueOffset, valueOffset + numValues);
    if (string[string.length - 1] === '\0') // remove null terminator
      string = string.slice(0, -1);

    return string;
  }

  // Special case for buffers
  if (type === 7)
    return buffer.slice(valueOffset, valueOffset + numValues);

  if (numValues === 1)
    return readValue(buffer, valueOffset, bigEndian, type);

  var res = [];
  for (var i = 0; i < numValues; i++) {
    res.push(readValue(buffer, valueOffset, bigEndian, type));
    valueOffset += valueSize;
  }

  return res;
}

function readValue(buffer, offset, bigEndian, type) {
  switch (type) {
    case 1: // uint8
      return buffer[offset];

    case 3: // uint16
      return readUInt16(buffer, offset, bigEndian);

    case 4: // uint32
      return readUInt32(buffer, offset, bigEndian);

    case 5: // unsigned rational
      return readUInt32(buffer, offset, bigEndian) / readUInt32(buffer, offset + 4, bigEndian);

    case 6: // int8
      return buffer.readInt8(offset);

    case 8: // int16
      return readInt16(buffer, offset, bigEndian);

    case 9: // int32
      return readInt32(buffer, offset, bigEndian);

    case 10: // signed rational
      return readInt32(buffer, offset, bigEndian) / readInt32(buffer, offset + 4, bigEndian);
  }
}

function parseDate(string) {
  if (typeof string !== 'string')
    return null;

  var match = string.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match)
    return null;

  var date = new Date(1970, 0, 2); // to prevent unexpected month change after setUTCMonth()
  date.setUTCFullYear(match[1]);
  date.setUTCMonth(match[2] - 1);
  date.setUTCDate(match[3]);
  date.setUTCHours(match[4]);
  date.setUTCMinutes(match[5]);
  date.setUTCSeconds(match[6]);
  date.setUTCMilliseconds(0);
  return date;
}

// Buffer reading helpers to help switching between endianness
function readUInt16(buffer, offset, bigEndian) {
  if (bigEndian)
    return buffer.readUInt16BE(offset);

  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset, bigEndian) {
  if (bigEndian)
    return buffer.readUInt32BE(offset);

  return buffer.readUInt32LE(offset);
}

function readInt16(buffer, offset, bigEndian) {
  if (bigEndian)
    return buffer.readInt16BE(offset);

  return buffer.readInt16LE(offset);
}

function readInt32(buffer, offset, bigEndian) {
  if (bigEndian)
    return buffer.readInt32BE(offset);

  return buffer.readInt32LE(offset);
}
