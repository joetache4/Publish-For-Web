# Publish For Web

A simple web page to prepare images for posting online. There are options to rename, resize, change format, change the last modified time, and insert/strip metadata.

**>> [Try it in your browser](https://joetache4.github.io/Publish-For-Web/) <<**

Only static images (JPG, PNG, WEBP, TIFF, and BMP) are supported. The page can accept single files or a folder as input, either chosen by a file-picker or drag-and-dropped anywhere onto the page. If a single file is supplied, then the output will be automatically downloaded as an image, while multiple files will be processed and returned in a zip file.

## Output Options

<div align="center">
<h3>File Name</h3>
</div>

*Choose 1 below.*

**`Remove whitespace & convert to lowercase`** (Default) This will remove leading and trailing spaces and replace all remaining runs of spaces with a single hyphen ("-"). Uppercase characters will change to lowercase.

**`Template`** Using certain format tokens, you can define a pattern that new image file names will follow. You can, for example, join a prefix or suffix, include metadata, or generate random characters for every file name.

> [!NOTE]
> Some formatting tokens may introduce characters that your OS cannot handle in file names. In these events, your browser will replace the "evil" characters with underscores ("_").

**`No change`** File name of output will match input.

<div align="center">
<h3>Max Dimensions</h3>
</div>

Any image that has a width or height greater than these values will be scaled down so both are at or below these limits. Images are scaled using Lanczos resampling with 3 lobes.

If left blank, then the corresponding dimension will have no limit.

*Set any or all below.*

**`Width`** (Default: 1280)

**`Height`** (Default: 1024)

<div align="center">
<h3>Format</h3>
</div>

*Choose 1 below.*

**`JPG`** (Default) Output all files as JPG. *Set the following.*

- *Quality:* The quality of the JPG output. Acceptable range is between 0.0 and 1.0. However, ".001" is the lowest *practical* limit. (Default: 0.9)

**`PNG`** Output all files as PNG.

**`No change`** Will attempt to save images in the same format as they were inputted.

<div align="center">
<h3>Last Modified Time</h3>
</div>

The Last Modified Time (modtime) is metadata indicating when a file was last altered. It is not when the file was created.

> [!IMPORTANT]
> These options will have no effect when processing single file inputs. Browsers will always change the modtime to "now" for downloaded files. As a workaround, you can upload multiple images, all of which will have the correct modtime when zipped together.

*Choose 1 below.*

**`Now`** (Default) Set modtime to now.

**`Set`** Set modtime to a date of your choosing.

**`Interpret from filename`** Search a file name for a string of exactly 8 digits, followed by exactly 6 digits. There may or may not be other non-digit characters surrounding these two groups. The first group will be interpreted as a date in "YYYYMMDD" format, while the second will be interpreted as a time in "hhmmss" format.

**`No change`** Output will match input's modtime.

<div align="center">
<h3>Metadata</h3>
</div>

Only basic metadata is supported, including Artist, Title/Description, Copyright, and DateTimeOriginal (the date the picture was taken/made). All other metadata will be removed. Each text field has a character limit of 280 ASCII characters.

How metadata is stored depends on output format, as described below.

<div align="center">
<table>
<tr><th> Output Format </th><th> Supported Metadata </th></tr>
<tr><td>JPG </td><td> EXIF, XMP </td></tr>
<tr><td>PNG </td><td> EXIF, XMP </td></tr>
<tr><td>others </td><td> not yet supported </td></tr>
</table>
</div>

*Set any or all below.*

**`Artist`** The artist or photographer who created the picture. (Default: [blank])

**`Title`** The title or description of the work. (Default: [blank])

**`Copyright`** Who owns the copyright. (Default: [blank])

**`DateTimeOriginal`** The date the picture was taken or made, at millisecond granularity if possible. *Choose 1 below.*

> [!WARNING]
> Includes timezone data.

- *None:* (Default) Do not set DateTimeOriginal metadata.

- *Read JPG EXIF:* Will attempt to read existing EXIF DateTimeOriginal from input image.

- *From old modtime:* Will set DateTimeOriginal to the modtime of the input image.

- *From new modtime:* Will set DateTimeOriginal to the modtime of the output image.

- *Interpret from filename:* Will set DateTimeOriginal to the date interpreted from the file name. See the Last Modified Time section for more details.