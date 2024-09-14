var DateTime = luxon.DateTime;

const MIME = {
	".jpg" : "image/jpeg",
	".jpeg": "image/jpeg",
	".png" : "image/png",
	".webp": "image/webp",
	".zip" : "application/zip",
};

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

function splitFilename(name) {
	name = name.endsWith("/") ? name.substring(0, name.length-1) : name;
	const lastDotIndex = name.lastIndexOf(".");
	const lastSlashIndex = name.lastIndexOf("/");

	const dir      = lastSlashIndex !== -1 ? name.substring(0, lastSlashIndex+1) : "";
	const basename = lastDotIndex   !== -1 ? name.substring(lastSlashIndex+1, lastDotIndex) : name.substring(lastSlashIndex+1);
	const ext      = lastDotIndex   !== -1 ? name.substring(lastDotIndex     ) : "";
	return [dir, basename, ext];
}

function safeParseInt(str, def) {
  const parsedValue = parseInt(str, 10);
  return isNaN(parsedValue) ? def : parsedValue;
}

function safeParseFloat(str, def) {
  const parsedValue = parseFloat(str, 10);
  return isNaN(parsedValue) ? def : parsedValue;
}

function clamp(num, min, max) {
	return Math.min(Math.max(num, min), max);
}

function numberToBytes(num, pad) {
	if (num >= 2**(8*pad)) {
		throw new Error("Overflow");
	}
	const bytes = [];
	for (let i = 0; i < pad; i++) {
		bytes[i] = (num >>> (8*(pad - 1 - i))) & 0xFF;
	}
	return bytes;
}

function pngCRC(bytes, c = 0xffffffff) {
	for (let n = 0; n < bytes.length; n++) {
		c = PNG_CRC_TABLE[(c ^ bytes[n]) & 0xff] ^ ((c>>8)&0xFFFFFF);
	}
	return c ^ 0xffffffff;
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

function interpretDateFromFilename(file) {
	const [dir, basename, ext] = splitFilename(file.name);
	const found = basename.replaceAll(/[^\d]/g, " ").trim().match(/^(\d{8}) *(\d{6})$/); // TODO some filenames include a final triplet (e.g., _123) for milliseconds
	if (found !== null) {
		const dayNumber = found[1], timeNumber = found[2];
		const year   = parseInt(dayNumber.substring(0, 4));
		const month  = parseInt(dayNumber.substring(4, 6)) - 1; // Months are 0-indexed
		const day    = parseInt(dayNumber.substring(6, 8));
		const hour   = parseInt(timeNumber.substring(0, 2));
		const minute = parseInt(timeNumber.substring(2, 4));
		const second = parseInt(timeNumber.substring(4, 6));
		date = new Date(year, month, day, hour, minute, second);
		return date;
	}
	return null;
}

// TODO? Due to the following problems, only download zips
function saveAs(content, filename, modtime=Date.now()) {
	const [dir, basename, ext] = splitFilename(filename);
	const mime = MIME[ext];
	console.log("downloading: " + mime);
	const file = new File([content], filename, { type: mime, lastModified: modtime }); // lastModified currently has no actual effect
	const url = URL.createObjectURL(file);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click(); // certain characters, including %, will be replaced with _ unless the images are in a .zip
	URL.revokeObjectURL(url);
}

function getRadioValue(groupName) {
	const radioButtons = document.getElementsByName(groupName);
	for (let i = 0; i < radioButtons.length; i++) {
		if (radioButtons[i].checked) {
			return radioButtons[i].value;
		}
	}
	return null;
}

function getInputOrDefault(id) {
	const tag = document.getElementById(id);
	const val = tag.value || tag.getAttribute("default");
	return val;
}

function getDatePickerDateString(localDate=Date.now()) {
	if (typeof localDate === "number")
		localDate = new Date(localDate);
	const offsetMs = -localDate.getTimezoneOffset() * 60 * 1000;
	localDate.setTime(localDate.getTime() + offsetMs);
	localDate = localDate.toISOString().slice(0, 19);
	return localDate;
}

function getXMPDateString(localDate=Date.now(), timeZoneOffset=null) {
	if (typeof localDate === "number")
		localDate = new Date(localDate);
	if (timeZoneOffset == null || timeZoneOffset == "")
		timeZoneOffset = -localDate.getTimezoneOffset(); //minutes
	let date = getDatePickerDateString(localDate);
	const H = ("" + Math.floor(Math.abs(timeZoneOffset)/60)).padStart(2, "0");
	const M = ("" + Math.abs(timeZoneOffset)%60).padStart(2, "0");
	date += (timeZoneOffset < 0 ? "-" : "+") + H + ":" + M;
	return date;
}

function getEXIFDateString(localDate=Date.now()) {
	let date = getDatePickerDateString(localDate);
	date = date.slice(0,19).replaceAll("-", ":").replace("T", " ");
	return date;
}











function* getNewFilename(file, width, height) {
	const val = getRadioValue("option-filename");
	let [dir, basename, ext] = splitFilename(file.webkitRelativePath || file.name);

	if (val === "filename-whitespace") {
		basename = basename.trim().toLowerCase().replaceAll(/ +/g, "-");
	} else if (val === "filename-template") {
		const template = getInputOrDefault("filename-template-text");
		let out = "";
		let command = "", arg = "";

		for (let i = 0; i < template.length; i++) {
			let c = template.charAt(i);
			if (command) {
				if (c === "}") {
					if (command === "r") {
						arg = safeParseInt(arg, 1);
						out += Math.floor(Math.random() * 10**arg);
					} else if (command === "R") {
						arg = safeParseInt(arg, 1);
						const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
						for (let j = 0; j < arg; j++) {
							const randomIndex = Math.floor(Math.random() * characters.length);
							out += characters.charAt(randomIndex);
						}
					} else if (command === "d") {
						out += DateTime.fromISO(new Date(getNewModtime(file)).toISOString()).toFormat(arg);
					} else if (command === "D") {
						out += DateTime.fromISO(new Date().toISOString()).toFormat(arg);
					}
					command = "";
					arg = "";
				} else {
					arg += c;
				}
			} else if (c == "%") {
				i++;
				if (i === template.length) break;
				command = template.charAt(i);
				if (command === "f") {
					out += basename.trim().toLowerCase().replaceAll(/ +/g, "-");
					command = "";
				} else if (command === "F") {
					out += basename.trim().replaceAll(/ +/g, "-");
					command = "";
				} else if (command === "G") {
					out += basename;
					command = "";
				} else if (command === "x") {
					out += ext.substring(1); // old extension
					command = "";
				} else if (command === "w") {
					out += width;
					command = "";
				} else if (command === "h") {
					out += height;
					command = "";
				} else if (command === "d") {
					i++;
				} else if (command === "D") {
					i++;
				} else if (command === "r") {
					i++;
				} else if (command === "R") {
					i++;
				} else if (command === "%") {
					out += "%";
					command = "";
				} else {
					// error, uncrecognized command
					throw new Error("Uncrecognized command in template");
				}
			} else {
				out += c;
			}
		}

		basename = out;
	}
	let format = getNewFormat(file);
	if (format == "image/jpeg") {
		ext = ".jpg";
	} else if (format == "image/png") {
		ext = ".png";
	}

	for (let i = 0; ; i++) {
		if (i)
			yield [dir, basename, "-", i, ext].join("");
		else
			yield [dir, basename, ext].join("");
	}
}

function getNewDimensions(img) {
	let newWidth = img.width, newHeight = img.height;
	let maxWidth = parseInt(document.getElementById("image-maxwidth").value);
	let maxHeight = parseInt(document.getElementById("image-maxheight").value);

	if (isNaN(maxWidth)) {
		maxWidth = img.width;
	}
	if (isNaN(maxHeight)) {
		maxWidth = img.height;
	}

	if (newWidth > maxWidth) {
		newHeight = newHeight * maxWidth / newWidth;
		newWidth = maxWidth;
	}
	if (newHeight > maxHeight) {
		newWidth = newWidth * maxHeight / newHeight;
		newHeight = maxHeight;
	}
	newWidth = Math.floor(newWidth + 0.0001);
	newHeight = Math.floor(newHeight + 0.0001);
	return [newWidth, newHeight];
}

function getNewFormat(file) {
	const val = getRadioValue("option-filetype");
	if (val === "filetype-jpg") {
		return "image/jpeg";
	} else if (val === "filetype-png") {
		return "image/png";
	} else {
		const [dir, basename, ext] = splitFilename(file.name); //drag-and-dropped files don't have a type for some reason, need to look at file ext
		let mime = MIME[ext];
		if (mime === undefined) {
			mime = "image/jpeg";
		}
		if (mime === "image/webp" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent)) { // safari does not support webp
			mime = "image/jpeg";
		}
		return mime;
	}
}

function getNewQuality() {
	let quality = parseFloat(getInputOrDefault("jpg-quality-text"));
	quality = clamp(quality, 0.0, 1.0);
	return quality;
}

function getNewModtime(file) {
	const val = getRadioValue("option-modtime");
	let date = null;
	if (val === "modtime-interpret") {
		date = interpretDateFromFilename(file);
	} else if (val === "modtime-now") {
		date = new Date();
	} else if (val === "modtime-set") {
		dateval = document.getElementById("modtime-date-picker").value;
		if (dateval !== "")
			date = new Date(dateval);
	} else if (val === "modtime-carry") {
		date = new Date(file.lastModified);
	}
	if (date === null) {
		date = new Date(file.lastModified)
	}
	return date;
}

async function getNewMetadata(file) {
	const artist    = document.getElementById("meta-artist").value;
	const title     = document.getElementById("meta-title").value;
	const copyright = document.getElementById("meta-copyright").value;
	const dateTimeOriginalSelection = document.getElementById("meta-date").value;
	let dateTimeOriginal   = "";
	let timeZoneOffset     = "";
	let subSecTimeOriginal = "";
	if (dateTimeOriginalSelection == "meta-date-exif") {
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
			const IFD0Offset = bytes[exifStart+4]*256**3 + bytes[exifStart+5]*256**2 + bytes[exifStart+6]*256**1 + bytes[exifStart+7]*256**0;
			const numberOfIFD0Entries = bytes[exifStart+IFD0Offset]*256 + bytes[exifStart+IFD0Offset+1] - 1; // subtract link to IFD1
			for (let i = 0; i < numberOfIFD0Entries; i++) {
				let IFD0EntryStart = exifStart + IFD0Offset + 2 + 12*i;
				if (bytes[IFD0EntryStart] == 0x87 && bytes[IFD0EntryStart+1] == 0x69) {
					const subIFDOffset = bytes[IFD0EntryStart+8]*256**3 + bytes[IFD0EntryStart+9]*256**2 + bytes[IFD0EntryStart+10]*256**1 + bytes[IFD0EntryStart+11]*256**0;
					const numberOfSubIFDEntries = bytes[exifStart + subIFDOffset]*256 + bytes[exifStart + subIFDOffset + 1] - 1;
					// search for DateTimeOriginal, TimeZoneOffset, and SubSecTimeOriginal entries inside SubIFD
					// store each value as a string
					for (let j = 0; j < numberOfSubIFDEntries; j++) {
						let subIFDEntryStart = exifStart + subIFDOffset + 2 + 12*j;
						if (dateTimeOriginal === "" && bytes[subIFDEntryStart] == 0x90 && bytes[subIFDEntryStart+1] == 0x03) {
							const dataOffset = bytes[subIFDEntryStart+8]*256**3 + bytes[subIFDEntryStart+9]*256**2 + bytes[subIFDEntryStart+10]*256**1 + bytes[subIFDEntryStart+11]*256**0;
							for (let k = exifStart + dataOffset; k < exifStart + dataOffset + 19; k++)
								dateTimeOriginal += String.fromCharCode(bytes[k]);
						} else if (timeZoneOffset === "" && bytes[subIFDEntryStart] == 0x88 && bytes[subIFDEntryStart+1] == 0x2A) {
							timeZoneOffset = (bytes[subIFDEntryStart+8] & 0x8000 ? -1 : 1) * ((bytes[subIFDEntryStart+8] & 0x7FFF)*256 + bytes[subIFDEntryStart+9]);
							timeZoneOffset = "" + timeZoneOffset;
						} else if (subSecTimeOriginal === "" && bytes[subIFDEntryStart] == 0x92 && bytes[subIFDEntryStart+1] == 0x91) {
							const dataSize = bytes[IFD0EntryStart+4]*256**3 + bytes[IFD0EntryStart+5]*256**2 + bytes[IFD0EntryStart+6]*256**1 + bytes[IFD0EntryStart+7]*256**0;
							if (dataSize <= 4) {
								for (let k = subIFDEntryStart + 8; k < subIFDEntryStart + 8 + dataSize; k++) subSecTimeOriginal += String.fromCharCode(bytes[k]);
							} else {
								const dataOffset = bytes[subIFDEntryStart+8]*256**3 + bytes[subIFDEntryStart+9]*256**2 + bytes[subIFDEntryStart+10]*256**1 + bytes[subIFDEntryStart+11]*256**0;
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
				}
			}
		}
	} else if (dateTimeOriginalSelection == "meta-date-modtime-old") {
		dateTimeOriginal   = new Date(file.lastModified);
		timeZoneOffset     = "" + -dateTimeOriginal.getTimezoneOffset(); // zero is a valid value
		subSecTimeOriginal = "" +  dateTimeOriginal.getMilliseconds();
	} else if (dateTimeOriginalSelection == "meta-date-modtime-new") {
		dateTimeOriginal   = new Date(getNewModtime(file));
		timeZoneOffset     = "" + -dateTimeOriginal.getTimezoneOffset();
		subSecTimeOriginal = "" +  dateTimeOriginal.getMilliseconds();
	} else if (dateTimeOriginalSelection == "meta-date-interpret") {
		dateTimeOriginal   = interpretDateFromFilename(file);
		if (dateTimeOriginal) {
			timeZoneOffset     = "" + -dateTimeOriginal.getTimezoneOffset();
			subSecTimeOriginal = "" +  dateTimeOriginal.getMilliseconds();
		}
	}

	return {
		artist             : artist,
		title              : title,
		copyright          : copyright,
		dateTimeOriginal   : dateTimeOriginal,
		timeZoneOffset     : timeZoneOffset,
		subSecTimeOriginal : subSecTimeOriginal
	};
}











// https://www.media.mit.edu/pia/Research/deepview/exif.html
// https://web.archive.org/web/20131018091152/http://exif.org/Exif2-2.PDF
// http://www.libpng.org/pub/png/spec/1.2/PNG-Chunks.html
// https://www.w3.org/TR/png-3/#eXIf
// https://archimedespalimpsest.net/Documents/External/XMP/XMPSpecificationPart3.pdf
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
		let localDate = getEXIFDateString(metadata.dateTimeOriginal);
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

	const xmp = createXMP(metadata);

	const dataToCombine = [];
	if (blob.type == "image/jpeg") {
		// insert after JFIF/APP0 (0xFFE0) and just before the quantization table (0xFFDB)
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
		// XMP
		dataToCombine.push(numberToBytes(xmp.length+22, 4));      // Chunk length
		dataToCombine.push([0x69, 0x54, 0x58, 0x74]);             // XMP chunk type field
		dataToCombine.push([0x58, 0x4D, 0x4C, 0x3A, 0x63, 0x6F, 0x6D, 0x2E, 0x61, 0x64, 0x6F, 0x62, 0x65, 0x2E, 0x78, 0x6D, 0x70]); // "XML:com.adobe.xmp"
		dataToCombine.push([0x00, 0x00, 0x00, 0x00, 0x00]);       // Compression options
		dataToCombine.push(xmp);                                  // XMP metadata
		    crc = pngCRC([0x69, 0x54, 0x58, 0x74]);
			crc = pngCRC([0x58, 0x4D, 0x4C, 0x3A, 0x63, 0x6F, 0x6D, 0x2E, 0x61, 0x64, 0x6F, 0x62, 0x65, 0x2E, 0x78, 0x6D, 0x70], crc ^ 0xffffffff);
			crc = pngCRC([0x00, 0x00, 0x00, 0x00, 0x00], crc ^ 0xffffffff);
			crc = pngCRC(xmp, crc ^ 0xffffffff);
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











function processFiles(f) {
	if (f.length == 1 && !f[0].webkitRelativePath.includes("/")) {
		processSingle(f[0]);
	} else {
		processMultiple(f);
	}
}

function processSingle(f) {
	console.log("beginning file: " + f.name);
	let blob, width, height;
	return resizeImage(f)
	.then(resolved => {
		const [b, w, h] = resolved;
		blob = b, width = w, height = h;
		return getNewMetadata(f);
	})
	.then(metadata => {
		return insertMetadata(blob, metadata);
	})
	.then(metaBlob => {
		const newName    = getNewFilename(f, width, height).next().value;
		const newModtime = getNewModtime(f).getTime();

		console.log("renaming to: " + newName);
		saveAs(metaBlob, newName, newModtime);
	})
	.catch(err => {
		console.log(err);
	});
}

function processMultiple(files) {
	if (!files.length) return;

	const zip = new JSZip();
	const usedFilenames = new Set();

	const progress = document.getElementById("progress-message");
	const spinner = document.getElementById("spinner");

	if (!spinner.classList.contains("hidden")) return; // another job is running

	console.log("input: " + files.length);
	progress.textContent = "Reading files...";
	spinner.classList.remove("hidden");

	Promise.all(
		Array.from(files).map(f => {

			console.log("beginning file: " + f.name);
			let blob, width, height;
			return resizeImage(f)
			.then(resolved => {
				const [b, w, h] = resolved;
				blob = b, width = w, height = h;
				return getNewMetadata(f);
			})
			.then(metadata => {
				return insertMetadata(blob, metadata);
			})
			.then(metaBlob => {
				// get unique file name
				let newName;
				for(newName of getNewFilename(f, width, height)) {
					if (!usedFilenames.has(newName)) {
						usedFilenames.add(newName);
						break;
					}
				}
				// set modtime, JSZip assumes UTC
				const newModtime = getNewModtime(f);
				newModtime.setTime(newModtime.getTime() - newModtime.getTimezoneOffset()*60*1000);
				//const newModtimeUTC = new Date(newModtime.toUTCString().substring(0, 25));

				console.log("adding file: " + newName);
				zip.file(newName, metaBlob, {date: newModtime});
			});
		})
	)
	.then(() => {

		console.log("generating zip");
		progress.textContent = "Zipping files...";
		zip.generateAsync({ type: "blob", compression: "STORE" })
		.then(content => {
			saveAs(content, "images.zip");
			progress.textContent = "Your new images were downloaded.";
			spinner.classList.add("hidden");
		});
	})
	.catch(err => {
		progress.textContent = "There was an error reading your files. Make sure they are all valid images.";
		spinner.classList.add("hidden");
		console.log(err);
	});
}

function resizeImage(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			const img = new Image();
			img.onload = () => {
				const [newWidth, newHeight] = getNewDimensions(img);

				const canvas = document.createElement("canvas");
				const fcanvas = new fabric.Canvas(canvas, {
					imageSmoothingEnabled: false,
					enableRetinaScaling: false,
				});
				fcanvas.setWidth(newWidth);
				fcanvas.setHeight(newHeight);

				const lanczosFilter = new fabric.Image.filters.Resize({
					scaleX: 1,
					scaleY: 1,
					resizeType: "lanczos",
					lanczosLobes: 3,
				});

				const fimg = new fabric.Image(img).scale(newWidth / img.width);
				const r = fcanvas.getRetinaScaling();
				lanczosFilter.scaleX = lanczosFilter.scaleY = fimg.scaleX * r;
				fimg.filters = [lanczosFilter];
				fimg.applyFilters();
				fcanvas.add(fimg);
				fcanvas.renderAll();

				const newFormat  = getNewFormat(file);
				const newQuality = getNewQuality(file) ** (1.0/6); // take root b/c lanczos quality seems to increase exponentially

				console.log("converting image: " + newFormat + " " + newQuality);
				canvas.toBlob(blob => {
					resolve([blob, newWidth, newHeight]);
				}, newFormat, newQuality);
			};
			img.onerror = (error) => {
				reject(error);
			};

			console.log("interpretting image");
			img.src = event.target.result;
		};
		reader.onerror = (error) => {
			reject(error);
		};

		console.log("reading file");
		reader.readAsDataURL(file);
	});
}

function filePicker(dirs) {
	if (dirs) {
		document.getElementById("input-dirs").click();
	} else {
		document.getElementById("input-files").click();
	}
}

fileInputHandler = (event) => {
	try {
		processFiles(event.target.files);
	} finally {
		event.target.value = "";
	}
}
document.getElementById("input-files").oninput = fileInputHandler;
document.getElementById("input-dirs").oninput = fileInputHandler;

document.addEventListener("dragover", (event) => {
	event.preventDefault();
});

document.addEventListener("drop", (event) => {
	event.preventDefault();
	const items = event.dataTransfer.items;
	const files = [];

	let count = items.length;

	const onFile = (file) => {
		files.push(file);
		if (!--count) processFiles(files);
	}
	const onEntries = (entries) => {
		count += entries.length;
		for (const entry of entries) {
			scanFiles(entry);
		}
		if (!--count) processFiles(files);
	};
	const onErr = (err) => {
		console.log(err);
		if (!--count) processFiles(files);
	}

	// can scan subdriectories with FileSystemDirectoryEntry, but not with File
	const scanFiles = (entry) => {
		if (entry.isFile) {
			entry.file(onFile, onErr);
		} else {
			entry.createReader().readEntries(onEntries, onErr);
		}
	}

	for (const item of items) {
		const entry = item.webkitGetAsEntry();
		if (entry) {
			scanFiles(entry);
		} else {
			if (!--count) processFiles(files);
		}
	}
}, false);











function resetInputs() {
	document.querySelectorAll("input").forEach(tag => {
		if (tag.hasAttribute("default")) {
			if (tag.type == "radio") {
				tag.checked = true;
			} else {
				tag.value = tag.getAttribute("default");
			}
		}
	});
	document.getElementById("jpg-quality-text").disabled = false;
	document.getElementById("meta-date").value = "meta-date-none";
}

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		resetInputs();
	}
});

document.querySelectorAll("input[name='option-filename']").forEach(tag => {
	tag.addEventListener("input", (event) => {
		document.getElementById("filename-template-text").disabled = (event.target.value !== "filename-template");
	});
});

document.querySelectorAll("input[name='option-filetype']").forEach(tag => {
	tag.addEventListener("input", (event) => {
		document.getElementById("jpg-quality-text").disabled = (event.target.value !== "filetype-jpg");
	});
});

document.querySelectorAll("input[name='option-modtime']").forEach(tag => {
	tag.addEventListener("input", (event) => {
		document.getElementById("modtime-date-picker").disabled = (event.target.value !== "modtime-set");
	});
});

document.getElementById("filename-template-text").addEventListener("input", (event) => {
	event.target.value = event.target.value.replace(/[\x00-\x1F\x7F-\x9F\\\/:*?"<>|]/g, ""); // filename-safe chars only (exclude control characters and Windows-forbidden chars)
});

document.getElementById("meta-artist").addEventListener("input", (event) => {
	event.target.value = event.target.value.replace(/[^ -~]/g, ""); // printable ascii only
});

document.getElementById("meta-title").addEventListener("input", (event) => {
	event.target.value = event.target.value.replace(/[^ -~]/g, "");
});

document.getElementById("meta-copyright").addEventListener("input", (event) => {
	event.target.value = event.target.value.replace(/[^ -~]/g, "");
});

document.getElementById("jpg-quality-text").addEventListener("input", (event) => {
	event.target.value = event.target.value.replace(/[^0-9.]/g, ""); // rational numbers only
});

document.getElementById("image-maxwidth").addEventListener("input", (event) => {
	event.target.value = event.target.value.replace(/[^0-9]/g, ""); // integers only
});

document.getElementById("image-maxheight").addEventListener("input", (event) => {
	event.target.value = event.target.value.replace(/[^0-9]/g, "");
});

document.getElementById("image-maxwidth").addEventListener("focus", (event) => {
	event.target.value = "";
});

document.getElementById("image-maxheight").addEventListener("focus", (event) => {
	event.target.value = "";
});

document.querySelectorAll("input").forEach(tag => {
	if (tag.hasAttribute("fill-blank")) {
		tag.addEventListener("blur", (event) => {
			if (tag.value === "") {
				tag.value = tag.getAttribute("default");
			}
		});
	}
});

window.addEventListener("DOMContentLoaded", () => {
	if (window.navigator.userAgent.includes("Win")) {
		for (const e of document.querySelectorAll(".hide-windows")) {
			e.style.display = "none";
		}
	} else {
		for (const e of document.querySelectorAll(".hide-linux")) {
			e.style.display = "none";
		}
	}

	document.getElementById("filename-template-text").disabled = (getRadioValue("option-filename") != "filename-template");
	document.getElementById("jpg-quality-text").disabled = (getRadioValue("option-filetype") != "filetype-jpg");
	document.getElementById("modtime-date-picker").disabled = (getRadioValue("option-modtime") != "modtime-set");

	document.getElementById("modtime-date-picker").value = getDatePickerDateString();

	document.getElementById("js-off").classList.toggle("hidden");
	document.getElementById("js-on").classList.toggle("hidden");
});











function createXMP(metadata) {
	const encoder = new TextEncoder();
	const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.6-c067 79.157747, 2015/03/30-23:40:42        ">
   <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
	  <rdf:Description rdf:about=""
			xmlns:xmp="http://ns.adobe.com/xap/1.0/"
			xmlns:dc="http://purl.org/dc/elements/1.1/"
			xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">
		 <xmp:CreateDate>${getXMPDateString(metadata.dateTimeOriginal, metadata.timeZoneOffset)}</xmp:CreateDate>
		 <dc:title>
			<rdf:Alt>
			   <rdf:li xml:lang="x-default">${metadata.title}</rdf:li>
			</rdf:Alt>
		 </dc:title>
		 <dc:creator>
			<rdf:Seq>
			   <rdf:li>${metadata.artist}</rdf:li>
			</rdf:Seq>
		 </dc:creator>
		 <dc:description>
			<rdf:Alt>
			   <rdf:li xml:lang="x-default">${metadata.title}</rdf:li>
			</rdf:Alt>
		 </dc:description>
		 <dc:rights>
			<rdf:Alt>
			   <rdf:li xml:lang="x-default">${metadata.copyright}</rdf:li>
			</rdf:Alt>
		 </dc:rights>
		 <xmpRights:Marked>${metadata.copyright ? "True" : "False"}</xmpRights:Marked>
	  </rdf:Description>
   </rdf:RDF>
</x:xmpmeta>`
	return encoder.encode(xmp);
}
