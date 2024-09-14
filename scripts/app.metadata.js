async function getFileMetadata(file) {
	let dateTimeOriginal   = "";
	let timeZoneOffset     = "";
	let subSecTimeOriginal = "";

	const data  = await file.arrayBuffer();
	const bytes = new Uint8Array(data);
	// find EXIF header
	let exifStart = null;
	for (let i = 6; i < 30; i++) {
		if (bytes[i] == 0x45 && bytes[i+1] == 0x78 && bytes[i+2] == 0x69 && bytes[i+3] == 0x66 && bytes[i+4] == 0x00 && bytes[i+5] == 0x00) { // EXIF header
			exifStart = i+6; // start of the TIFF header which all offsets are relative to
			break;
		}
	}
	if (exifStart) {
		// search for link to SubIFD
		const bigEndian = bytes[exifStart] == "M".charCodeAt(0);
		const IFD0Offset = bytesToNumber(bytes, exifStart+4, 4, bigEndian, signed=false);
		const numberOfIFD0Entries = bytesToNumber(bytes, exifStart+IFD0Offset, 2, bigEndian, signed=false) - 1; // subtract link to IFD1
		for (let i = 0; i < numberOfIFD0Entries; i++) {
			let IFD0EntryStart = exifStart + IFD0Offset + 2 + 12*i;
			if (bytesEqual(bytes, IFD0EntryStart, 2, bigEndian, [0x87, 0x69])) {
				const subIFDOffset = bytesToNumber(bytes, IFD0EntryStart+8, 4, bigEndian, signed=false);
				const numberOfSubIFDEntries = bytesToNumber(bytes, exifStart + subIFDOffset, 2, bigEndian, signed=false) - 1;
				// search for DateTimeOriginal, TimeZoneOffset, and SubSecTimeOriginal entries inside SubIFD
				for (let j = 0; j < numberOfSubIFDEntries; j++) {
					let subIFDEntryStart = exifStart + subIFDOffset + 2 + 12*j;
					if (bytesEqual(bytes, subIFDEntryStart, 2, bigEndian, [0x90, 0x03])) {
						const dataOffset = bytesToNumber(bytes, subIFDEntryStart+8, 4, bigEndian, signed=false);
						for (let k = exifStart + dataOffset; k < exifStart + dataOffset + 19; k++)
							dateTimeOriginal += String.fromCharCode(bytes[k]);
					} else if (bytesEqual(bytes, subIFDEntryStart, 2, bigEndian, [0x88, 0x2A])) {
						timeZoneOffset = bytesToNumber(bytes, subIFDEntryStart+8, 2, bigEndian, signed=true);
						timeZoneOffset = "" + timeZoneOffset;
					} else if (bytesEqual(bytes, subIFDEntryStart, 2, bigEndian, [0x92, 0x91])) {
						const dataSize = bytesToNumber(bytes, IFD0EntryStart+4, 4, bigEndian, signed=false);
						if (dataSize <= 4) {
							for (let k = subIFDEntryStart + 8; k < subIFDEntryStart + 8 + dataSize; k++) subSecTimeOriginal += String.fromCharCode(bytes[k]);
						} else {
							const dataOffset = bytesToNumber(bytes, subIFDEntryStart+8, 4, bigEndian, signed=false);
							for (let k = exifStart + dataOffset; k < exifStart + dataOffset + dataSize; k++) subSecTimeOriginal += String.fromCharCode(bytes[k]);
						}
					}
					if (dateTimeOriginal && timeZoneOffset && subSecTimeOriginal) break;
				}

				break;
			}
		}
		// parse the date
		if (dateTimeOriginal) {
			const match = dateTimeOriginal.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
			if (match) {
				dateTimeOriginal = new Date(
					match[1],
					parseInt(match[2])-1,
					match[3],
					match[4],
					match[5],
					match[6],
					subSecTimeOriginal
				);
				console.log("found exif date");
				return {
					dateTimeOriginal   : dateTimeOriginal,
					timeZoneOffset     : timeZoneOffset,
					subSecTimeOriginal : subSecTimeOriginal,
				}
			}
		}
	}
	return {};
}

// https://www.media.mit.edu/pia/Research/deepview/exif.html
// https://web.archive.org/web/20131018091152/http://exif.org/Exif2-2.PDF
// http://www.libpng.org/pub/png/spec/1.2/PNG-Chunks.html
// https://www.w3.org/TR/png-3/#eXIf
function createEXIF(metadata) {
	if (!Object.values(metadata).some(a => a)) {
		return null;
	}

	const encoder = new TextEncoder(); //encoder.encode(str) = uint8array of ascii
	const IFD0 = [];
	let numberOfIFD0Entries = 0;

	// Artist
	if (metadata.artist) {
		const bytes = Array.from(encoder.encode(metadata.artist));
		IFD0.push({
			tag    : [0x01, 0x3B],
			format : [0x00, 0x02], // ascii
			length : bytes.length,
			size   : bytes.length, // 1 byte/component
			data   : bytes
		});
		numberOfIFD0Entries++;
	}

	// ImageDescription
	if (metadata.title) {
		const bytes = Array.from(encoder.encode(metadata.title));
		IFD0.push({
			tag    : [0x01, 0x0E],
			format : [0x00, 0x02],
			length : bytes.length,
			size   : bytes.length,
			data   : bytes
		});
		numberOfIFD0Entries++;
	}

	// Copyright
	if (metadata.copyright) {
		const bytes = Array.from(encoder.encode(metadata.copyright));
		IFD0.push({
			tag    : [0x82, 0x98],
			format : [0x00, 0x02],
			length : bytes.length,
			size   : bytes.length,
			data   : bytes
		});
		numberOfIFD0Entries++;
	}

	// EXIFSubIFD is metadata introduced by Exif, not TIFF

	// DateTimeOriginal
	const EXIFSubIFD = [];
	if (metadata.dateTimeOriginal) {
		let localDate = makeEXIFDateString(metadata.dateTimeOriginal);
		const bytes = Array.from(encoder.encode(localDate));
		EXIFSubIFD.push({
			tag    : [0x90, 0x03],
			format : [0x00, 0x02],
			length : bytes.length, // max 20 components
			size   : bytes.length,
			data   : bytes
		});
	}

	// TimeZoneOffset
	if (metadata.timeZoneOffset) {
		const offset = parseInt(metadata.timeZoneOffset);
		const bytes = numberToBytes(offset & 0x7FFF, 2);
		bytes[0] = offset < 0 ? (bytes[0] | 0x8000) : bytes[0];
		EXIFSubIFD.push({
			tag    : [0x88, 0x2a],
			format : [0x00, 0x01], // signed short
			length : 1,
			size   : 2, // 2 byte/component
			data   : bytes
		});
	}

	// SubSecTimeOriginal
	if (metadata.subSecTimeOriginal) {
		const bytes = Array.from(encoder.encode(metadata.subSecTimeOriginal));
		EXIFSubIFD.push({
			tag    : [0x92, 0x91],
			format : [0x00, 0x02],
			length : bytes.length,
			size   : bytes.length,
			data   : bytes
		});
	}

	if (EXIFSubIFD.length) {
		numberOfIFD0Entries++; // IFD0 link to EXIFSubIFD
	}

	exif = [
		0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, // TIFF header: byte order (big-endian/Motorola) & IFD offset NOTE: ALL offsets are relative to the first 0x4D byte
	];
	exif = exif.concat(numberToBytes(numberOfIFD0Entries+1, 2)); // number of entries in IFD0 + 1 for link to IFD1 (even though the link will be all zeros)

	exif_data = [];
	offset = 8 + 2 + numberOfIFD0Entries*12 + 4; // tiff header + numberOfIFD0Entries + (IFD0 fields + link to subIFD) + link to IFD1

	for (let i = 0; i < IFD0.length; i++) {
		const field = IFD0[i];
		exif = exif.concat(field.tag);
		exif = exif.concat(field.format);
		exif = exif.concat(numberToBytes(field.length, 4));
		if (field.size <= 4) {
			exif = exif.concat(field.data);
			// padding is added to the right
			for (let j = field.size; j < 4; j++) {
				exif = exif.concat([0x00]);
			}
		} else {
			exif = exif.concat(numberToBytes(offset, 4));
			exif_data = exif_data.concat(field.data);
			offset += field.size;
		}
	}

	if (EXIFSubIFD.length) {
		exif = exif.concat([0x87, 0x69]); // EXIFSubIFD tag
		exif = exif.concat([0x00, 0x04]); // format, long uint
		exif = exif.concat([0x00, 0x00, 0x00, 0x01]); // one component
		exif = exif.concat(numberToBytes(offset, 4)); // link

	}

	exif = exif.concat([
		0x00, 0x00, 0x00, 0x00, // pointer to next IFD, all zeros since there is none
	]);

	exif = exif.concat(exif_data);

	// EXIFSubIFD

	if (EXIFSubIFD.length) {
		exif = exif.concat(numberToBytes(EXIFSubIFD.length+1, 2)); // number of entries in EXIFSubIFD
		exif_data = [];
		offset += 2 + EXIFSubIFD.length*12 + 4; // number of entries + EXIFSubIFD fields + end of EXIFSubIFD

		for (let i = 0; i < EXIFSubIFD.length; i++) {
			const field = EXIFSubIFD[i];
			exif = exif.concat(field.tag);
			exif = exif.concat(field.format);
			exif = exif.concat(numberToBytes(field.length, 4));
			if (field.size <= 4) {
				exif = exif.concat(field.data);
				// padding is added to the right
				for (let j = field.size; j < 4; j++) {
					exif = exif.concat([0x00]);
				}
			} else {
				exif = exif.concat(numberToBytes(offset, 4));
				exif_data = exif_data.concat(field.data);
				offset += field.size;
			}
		}

		exif = exif.concat([
			0x00, 0x00, 0x00, 0x00, // pointer to next IFD, all zeros since there is none
		]);

		exif = exif.concat(exif_data);
	}

	if (exif.length > 65535-6) {
		throw new Error("EXIF is too big");
	}

	return exif;
}

async function insertMetadata(blob, metadata) {
	if (blob.type !== "image/jpeg" && blob.type !== "image/png") {
		return blob;
	}

	const exif = createEXIF(metadata);
	if (exif === null) {
		return blob;
	}

	const dataToCombine = [];
	if (blob.type == "image/jpeg") {
		// insert after JFIF/APP0 (0xFFE0) and just before the quantization table (0xFFDB)
		// TODO there might be a JFIF extension APP0 marker segment with a thumbnail
		const start = await blob.slice(0, 30).bytes();
		let i;
		for (i = 2; i < start.length-1; i++)
			if (start[i] == 0xFF && start[i+1] == 0xDB)
				break
		if (start[i] != 0xFF || start[i+1] != 0xDB)
			throw new Error("Unexpected JFIF/APP0 size");
		dataToCombine.push(start.slice(0, i))                     // JPG SOI + JFIF/APP0
		dataToCombine.push([0xFF, 0xE1]);                         // APP1 header
		dataToCombine.push(numberToBytes(exif.length+8, 2));      // APP1 header size
		dataToCombine.push([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // EXIF header (JPG only)
		dataToCombine.push(exif);                                 // EXIF metadata
		const data = await blob.slice(i).bytes();
		dataToCombine.push(data);                                 // Image data
	} else {
		let crc;
		const ihdr = await blob.slice(0, 33).bytes();
		dataToCombine.push(ihdr);                                 // PNG header + IHDR
		// EXIF
		dataToCombine.push(numberToBytes(exif.length, 4));        // Chunk length
		dataToCombine.push([0x65, 0x58, 0x49, 0x66]);             // EXIF chunk type field
		dataToCombine.push(exif);                                 // EXIF metadata
		    crc = pngCRC([0x65, 0x58, 0x49, 0x66]);
			crc = pngCRC(exif, crc ^ 0xffffffff);
		dataToCombine.push(numberToBytes(crc, 4));                // CRC
		const data = await blob.slice(33).bytes();                // Image data
		dataToCombine.push(data);
	}

	let totalLength = 0;
	for (const arr of dataToCombine) {
		totalLength += arr.length;
	}
	let combinedData = new Uint8Array(totalLength);
	let ptr = 0;
	for (const arr of dataToCombine) {
		combinedData.set(arr, ptr);
		ptr += arr.length;
	}

	return new Blob([combinedData], { type: blob.type });
}












function numberToBytes(num, pad, signed=true) {
	if (num >= 2**(8*pad - (signed ? 1 : 0)) || num < -(2**(8*pad-1))) {
		throw new Error("Overflow");
	}
	if (!signed && num < 0) {
		throw new Error("Unexpected negative input");
	}
	const bytes = [];
	for (let i = 0; i < pad; i++) {
		bytes[i] = (num >>> (8*(pad - 1 - i))) & 0xFF;
	}
	return bytes;
}

function bytesToNumber(bytes, start, length, bigEndian=true, signed=true) {
	let num = 0;
	let j, neg;
	for (let i = start; i < start+length; i++) {
		j = bigEndian ? i : 2*start+length-i-1;
		num = (num << 8) + bytes[j];
	}
	if (signed && num & 1<<length)
		num = (num ^ (2**(8*length)-1)) + 1;
	return num;
}

function bytesEqual(bytes, start, length, bigEndian, bytes2) {
	let j;
	for (let i = 0; i < length; i++) {
		j = bigEndian ? i : length-i-1;
		if (bytes[start + j] != bytes2[i])
			return false;
	}
	return true;
}

function makeEXIFDateString(date=Date.now()) {
	date = new Date(date);
	const offsetMs = -date.getTimezoneOffset() * 60 * 1000;
	date.setTime(date.getTime() + offsetMs);
	date = date.toISOString().slice(0, 19);
	date = date.replaceAll("-", ":").replace("T", " ");
	return date;
}

const PNG_CRC_TABLE = [];
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) {
		if (c & 1)
			c = 0xedb88320 ^ ((c>>1)&0x7FFFFFFF);
		else
			c = ((c>>1)&0x7FFFFFFF);
	}
	PNG_CRC_TABLE[n] = c;
}

function pngCRC(bytes, crc = 0xffffffff) {
	for (let n = 0; n < bytes.length; n++) {
		crc = PNG_CRC_TABLE[(crc ^ bytes[n]) & 0xff] ^ ((crc>>8)&0xFFFFFF);
	}
	return crc ^ 0xffffffff;
}

/*
alert(numberToBytes(pngCRC([0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x13, 0x88, 0x00, 0x00, 0x13, 0x88, 0x08, 0x02, 0x00, 0x00, 0x00]), 4));
alert([0xd2, 0xfa, 0x10, 0x9c]); // IHDR CRC
let crc = pngCRC([0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x13, 0x88, 0x00, 0x00]);
crc     = pngCRC([0x13, 0x88, 0x08, 0x02, 0x00, 0x00, 0x00], crc ^ 0xffffffff);
alert(numberToBytes(crc, 4));
alert(numberToBytes(pngCRC([0x49, 0x45, 0x4e, 0x44]), 4));
alert([0xae, 0x42, 0x60, 0x82]); // IEND CRC
//*/
