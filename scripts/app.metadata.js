// https://www.media.mit.edu/pia/Research/deepview/exif.html
// https://web.archive.org/web/20131018091152/http://exif.org/Exif2-2.PDF
// http://www.libpng.org/pub/png/spec/1.2/PNG-Chunks.html
// https://www.w3.org/TR/png-3/#eXIf
// https://developers.google.com/speed/webp/docs/riff_container


async function readMetadata(file) {
	const metadata = {};
	const bytes = await file.slice(0, 80*1024).bytes(); // TODO read 20 bytes, more based on format

	if (bytes[0] == 0xFF && bytes[1] == 0xD8)
		metadata.type = "image/jpeg";
	else if (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47)
		metadata.type = "image/png";
	else if (bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x38)
		metadata.type = "image/gif";
	else if (bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50)
		metadata.type = "image/webp";
	else if (bytes[0] == 0x4D && bytes[1] == 0x4D && bytes[2] == 0x00 && bytes[3] == 0x2A)
		metadata.type = "image/tiff";
	else if (bytes[0] == 0x49 && bytes[1] == 0x49 && bytes[2] == 0x2A && bytes[3] == 0x00)
		metadata.type = "image/tiff";
	else if (bytes[0] == 0x42 && bytes[1] == 0x4D)
		metadata.type = "image/bmp";
	else if (bytes[0] == 0x00 && bytes[1] == 0x00 && bytes[2] == 0x01 && bytes[3] == 0x00)
		metadata.type = "image/ico";
	else if (bytes[4] == 0x66 && bytes[5] == 0x74 && bytes[6] == 0x79 && bytes[7] == 0x70 && bytes[8] == 0x61 && bytes[9] == 0x76 && bytes[10] == 0x69 && bytes[11] == 0x66)
		metadata.type = "image/avif";
	// TODO .svg (image/svg+xml)
	else
		metadata.type = null;

	if (metadata.type == "image/jpeg") {
		for (let i = 0; i < bytes.length; ) {
			while(bytes[i] == 0xFF) i++;
			let marker = bytes[i];  i++;
			if (0xD0 <= marker && marker <= 0xD7) continue; // RST
			if (marker == 0xD8) continue; // SOI
			if (marker == 0xD9) break;    // EOI
			if (marker == 0x01) continue; // TEM
			if (marker == 0x00) continue; // escaped 0xFF byte
			const len = (bytes[i]<<8) | bytes[i+1];  i+=2;
			if (marker == 0xE1)
				if (bytesEqual(bytes, i, 4, true, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00])) // EXIF header
					metadata.exif = readEXIF(bytes, i+6);
			if (marker == 0xC0) {
				metadata.height = (bytes[i+1]<<8) | bytes[i+2];
				metadata.width = (bytes[i+3]<<8) | bytes[i+4];
				break;
			}
			i+=len-2;
		}

	} else if (metadata.type == "image/png") {
		metadata.width  = bytesToNumber(bytes, 16, 4);
		metadata.height = bytesToNumber(bytes, 20, 4);
		// TODO metadata chunks can be located at the end of the file
		/*
		for (let i = 33; i < bytes.length; ) {
			if(bytesEqual(bytes, i+4, 4, true, [0x65, 0x58, 0x49, 0x66])) {
				metadata.exif = readEXIF(bytes, i+8);
				break;
			}
			i += bytesToNumber(bytes, i, 4) + 12;
		}
		*/

	} else if (metadata.type == "image/webp") {
		for (let i = 12; i < bytes.length; ) {
			// TODO EXIF data is supposed to be located at the end of the file
			/*
			if (bytesEqual(bytes, i, 4, [0x45, 0x58, 0x49, 0x46])) { // EXIF chunk
				metadata.exif = readEXIF(bytes, i+8);
			}
			*/
			if (bytesEqual(bytes, i, 4, true, [0x56, 0x50, 0x38, 0x20])) { // "VP8 " chunk
				metadata.width  = bytesToNumber(bytes, i+14, 2, false, false) & 0x3FFF;
				metadata.height = bytesToNumber(bytes, i+16, 2, false, false) & 0x3FFF;
				break; // assume metadata is before image data
			}
			let chunkSize = bytesToNumber(bytes, i+4, 4, false, false);
			i += chunkSize + 8 + (chunkSize%2 ? 1 : 0);
		}
	}

	return metadata;
}

function readEXIF(bytes, exifStart) {
	const exif = {};
	// search for link to SubIFD
	const bigEndian = bytes[exifStart] == "M".charCodeAt(0);
	const IFD0Offset = bytesToNumber(bytes, exifStart+4, 4, bigEndian, false);
	const numberOfIFD0Entries = bytesToNumber(bytes, exifStart+IFD0Offset, 2, bigEndian, false) - 1; // subtract link to IFD1
	for (let i = 0; i < numberOfIFD0Entries; i++) {
		let IFD0EntryStart = exifStart + IFD0Offset + 2 + 12*i;
		if (bytesEqual(bytes, IFD0EntryStart, 2, bigEndian, [0x87, 0x69])) {
			const subIFDOffset = bytesToNumber(bytes, IFD0EntryStart+8, 4, bigEndian, false);
			const numberOfSubIFDEntries = bytesToNumber(bytes, exifStart + subIFDOffset, 2, bigEndian, false) - 1;
			// search for DateTimeOriginal, TimeZoneOffset, and SubSecTimeOriginal entries inside SubIFD
			for (let j = 0; j < numberOfSubIFDEntries; j++) {
				let subIFDEntryStart = exifStart + subIFDOffset + 2 + 12*j;
				if (!exif.dateTimeOriginal && bytesEqual(bytes, subIFDEntryStart, 2, bigEndian, [0x90, 0x03])) {
					const dataOffset = bytesToNumber(bytes, subIFDEntryStart+8, 4, bigEndian, false);
					exif.dateTimeOriginal = "";
					for (let k = exifStart + dataOffset; k < exifStart + dataOffset + 19; k++)
						exif.dateTimeOriginal += String.fromCharCode(bytes[k]);
				} else if (!exif.timeZoneOffset && bytesEqual(bytes, subIFDEntryStart, 2, bigEndian, [0x88, 0x2A])) {
					exif.timeZoneOffset = "" + bytesToNumber(bytes, subIFDEntryStart+8, 2, bigEndian, true);
				} else if (!exif.subSecTimeOriginal && bytesEqual(bytes, subIFDEntryStart, 2, bigEndian, [0x92, 0x91])) {
					const dataSize = bytesToNumber(bytes, IFD0EntryStart+4, 4, bigEndian, false);
					exif.subSecTimeOriginal = "";
					if (dataSize <= 4) {
						for (let k = subIFDEntryStart + 8; k < subIFDEntryStart + 8 + dataSize; k++)
							exif.subSecTimeOriginal += String.fromCharCode(bytes[k]);
					} else {
						const dataOffset = bytesToNumber(bytes, subIFDEntryStart+8, 4, bigEndian, false);
						for (let k = exifStart + dataOffset; k < exifStart + dataOffset + dataSize; k++)
							exif.subSecTimeOriginal += String.fromCharCode(bytes[k]);
					}
				}
				if (exif.dateTimeOriginal && exif.timeZoneOffset && exif.subSecTimeOriginal) break;
			}

			break;
		}
	}
	// parse the date
	if (exif.dateTimeOriginal) {
		const match = exif.dateTimeOriginal.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
		if (match) {
			exif.dateTimeOriginal = new Date(
				match[1],
				parseInt(match[2])-1,
				match[3],
				match[4],
				match[5],
				match[6],
				exif.subSecTimeOriginal
			);
			console.log("found exif date");
			return exif;
		}
	}
	return null;
}

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
		const bytes = numberToBytes(offset, 2, true);
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

// blob is assumed to be metadata-free, either by removeMetadata or by canvas.toBlob
async function insertMetadata(blob, metadata) {
	//if (blob.type !== "image/jpeg" && blob.type !== "image/png" && blob.type !== "image/webp")
	if (blob.type !== "image/jpeg")
		return blob;

	const dataToCombine = [];
	const exif = createEXIF(metadata.exif);
	if (exif === null) {
		return blob;
	}

	if (blob.type == "image/jpeg") {
		const start = await blob.slice(0, 30).bytes();
		let i;
		for (i = 2; i < start.length-1; i++)
			if (start[i] == 0xFF && start[i+1] == 0xDB)
				break
		if (start[i] != 0xFF || start[i+1] != 0xDB)
			throw new Error("Unexpected JFIF/APP0 size");
		dataToCombine.push(start.slice(0, i))                     // JPG SOI + JFIF APP0
		dataToCombine.push([0xFF, 0xE1]);                         // APP1 header
		dataToCombine.push(numberToBytes(exif.length+8, 2));      // APP1 header size
		dataToCombine.push([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // EXIF header (JPG only)
		dataToCombine.push(exif);                                 // EXIF metadata
		const data = await blob.slice(i).bytes();
		dataToCombine.push(data);                                 // image data

	} /*else if (blob.type == "image/png") {
		// TODO metadata goes at the end
		let crc;
		const ihdr = await blob.slice(0, 33).bytes();
		dataToCombine.push(ihdr);                                 // PNG header + IHDR
		dataToCombine.push(numberToBytes(exif.length, 4));        // EXIF chunk size
		dataToCombine.push([0x65, 0x58, 0x49, 0x66]);             // EXIF chunk type
		dataToCombine.push(exif);                                 // EXIF data
		    crc = pngCRC([0x65, 0x58, 0x49, 0x66]);
			crc = pngCRC(exif, crc ^ 0xffffffff);
		dataToCombine.push(numberToBytes(crc, 4, true));          // CRC
		const data = await blob.slice(33).bytes();                // image data
		dataToCombine.push(data);

	} else if (blob.type == "image/webp") {
		dataToCombine.push(strToASCIIBytes("VP8X"));
		// TODO finish VP8X chunk

		const data = await blob.slice(12).bytes();                // Image data
		dataToCombine.push(data);

		dataToCombine.push(strToASCIIBytes("EXIF"));              // EXIF chunk type
		dataToCombine.push(numberToBytes(exif.length, 4));        // EXIF chunk size
		dataToCombine.push(exif);                                 // EXIF data
		if (exif.length%2)
			dataToCombine.push([0x00]);                           // pad to even length

		const filesize = dataToCombine.reduce((val, arr) => val + arr.length, 0);
		dataToCombine.unshift(
			strToASCIIBytes("RIFF"),                              // RIFF container header
			numberToBytes(filesize + 12, 4, false, false),        // file size
			strToASCIIBytes("WEBP"),                              // WEBP header
		);
		console.log(dataToCombine);
	}*/ else {
		return blob;
	}

	return combineData(dataToCombine, blob.type);
}

async function removeMetadata(file, type=null) {
	type = type || file.type;
	if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp")
		return null;

	const bytes = await file.bytes();

	if (type === "image/jpeg") {
		const dataToCombine = [];
		let i = 0;
		let spanStart = 0;
		while (i < bytes.length) {
			while (bytes[i] == 0xFF) i++;
			const marker = bytes[i]; i++;
			if (0xD0 <= marker && marker <= 0xD7) continue; // RST
			if (marker == 0xD8) continue; // SOI
			if (marker == 0xD9) break;    // EOI
			if (marker == 0x01) continue; // TEM
			if (marker == 0x00) continue; // escaped 0xFF byte
			const len = (bytes[i]<<8) | bytes[i+1];  i+=2;
			if (marker == 0xE0) { // APP0
				if (bytes[i] == 0x4A && bytes[i+1] == 0x46 && bytes[i+2] == 0x49 && bytes[i+3] == 0x46 && bytes[i+4] == 0x00) { // JFIF
					dataToCombine.push(bytes.slice(spanStart, i+14));
					dataToCombine.push([0x00, 0x00]);
					spanStart = i+len-2;
				} else if (bytes[i] == 0x4A && bytes[i+1] == 0x46 && bytes[i+2] == 0x58 && bytes[i+3] == 0x58 && bytes[i+4] == 0x00) { // JFXX thumbnail
					dataToCombine.push(bytes.slice(spanStart, i-4));
					spanStart = i+len-2;
				}
			} else if (marker == 0xE1 || marker == 0xED || marker == 0xFE) { // APP1 (EXIF, XMP), APP13 (photoshop), comment segment
					dataToCombine.push(bytes.slice(spanStart, i-4));
					spanStart = i+len-2;
			} else {
				dataToCombine.push(bytes.slice(spanStart));
				break;
			}
			i += len-2;
		}
		return combineData(dataToCombine, "image/jpeg");

	} else if (type === "image/png") {
		const dataToCombine = [];
		dataToCombine.push(bytes.slice(0, 8));
		for (let i = 8; i < bytes.length; ) {
			const size = bytesToNumber(bytes, i, 4);
			const chunk = ASCIIBytesToStr(bytes, i+4, 4);
			if (["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "hIST", "pHYs", "sPLT"].includes(chunk))
				dataToCombine.push(bytes.slice(i, i+size+12));
			if (chunk === "IEND")
				break;
			i += size+12;
		}
		return combineData(dataToCombine, "image/png");

	} else if (type === "image/webp") {
		const dataToCombine = [];
		for (let i = 12; i < bytes.length; ) {
			const chunk = ASCIIBytesToStr(bytes, i, 4);
			const size = bytesToNumber(bytes, i+4, 4, false, false);
			if (chunk == "VP8X") {
				dataToCombine.push(bytes.slice(i, i+8));
				const flags = bytes.slice(i+8, i+9);
				flags[0] &= 0xF3; // remove EXIF and XMP flags from VP8X chunk
				dataToCombine.push(flags);
				dataToCombine.push(bytes.slice(i+9, i+18));
			}
			else if (chunk != "EXIF" && chunk != "XMP ") {
				let j = i + 8 + size + (size%2 ? 1 : 0);
				dataToCombine.push(bytes.slice(i, j));
				if (size%2)
					dataToCombine.push([0x00]);
			}
			i += 8 + size + (size%2 ? 1 : 0);
		}
		const filesize = dataToCombine.reduce((val, arr) => val + arr.length, 0);
		dataToCombine.unshift(
			strToASCIIBytes("RIFF"),
			numberToBytes(filesize + 12, 4, false, false),
			strToASCIIBytes("WEBP"),
		);
		return combineData(dataToCombine, "image/webp");
	}
}





function combineData(dataToCombine, type) {
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
	dataToCombine.length = 0;
	return new Blob([combinedData], { type: type });
}

function numberToBytes(num, length, signed=false, bigEndian=true) {
	if (num == null || length == null)
		throw new Error("missing required parameter");
	if (num >= 2**(8*length - (signed ? 1 : 0)) || num < -(2**(8*length-1)))
		throw new Error("Overflow");
	if (!signed && num < 0)
		throw new Error("Unexpected negative input");

	if (num < 0)
		num = (-num ^ ((2**(8*length))-1)) + 1;
	const bytes = [];
	if (bigEndian)
		for (let i = 0; i < length; i++)
			bytes[i] = (num >>> (8*(length - 1 - i))) & 0xFF;
	else
		for (let i = 0; i < length; i++)
			bytes[i] = (num >>> (8*i)) & 0xFF;
	return bytes;
}

function bytesToNumber(bytes, start, length, bigEndian=true, signed=false) {
	if (bytes == null || start == null || length == null)
		throw new Error("missing required parameter");
	let num = 0;
	if (bigEndian)
		for (let i = start; i < start+length; i++)
			num = (num << 8) | bytes[i];
	else
		for (let i = start+length; i >= start; i--)
			num = (num << 8) | bytes[i];
	if (signed) {
		if (num > 0 && (num & (2**(8*length-1))))
			num = -((num ^ (2**(8*length)-1)) + 1);
	} else {
		if (num < 0) // 4-bytes wrongly interpretted as negative
			num = (num & 0x7FFFFFFF) + 2**31;
	}
	return num;
}

function ASCIIBytesToStr(bytes, start, length) {
	ascii = "";
	for (let i = start; i < start + length; i++)
		ascii += String.fromCharCode(bytes[i]);
	return ascii;
}

function strToASCIIBytes(str) {
	bytes = [];
	for (let i = 0; i < str.length; i++)
		bytes.push(str.charCodeAt(i));
	return bytes;
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
			c = 0xEDB88320 ^ ((c>>1)&0x7FFFFFFF);
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
