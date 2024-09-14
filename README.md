# Publish For Web

A simple web page to prepare images for posting online. There are options to rename, change format resize, and insert or strip metadata.

**>> [Try it in your browser](https://joetache4.github.io/Publish-For-Web/) <<**

Only static images (JPG, PNG, WEBP, TIFF, and BMP) are supported. The page can accept single files or a folder as input, either chosen by a file-picker or drag-and-dropped anywhere onto the page. If a single file is supplied, then the output will be automatically downloaded as an image, while multiple files will be processed and returned in a zip file.

## Output Options

<div align="center">
<h3>File Name</h3>
</div>

*Choose 1 below.*

**`Remove whitespace & convert to lowercase`** (Default) This will remove leading and trailing spaces and replace all remaining runs of spaces with a single hyphen ("-"). Uppercase characters will change to lowercase.

**`Template`** Using certain format tokens, you can define a pattern that new image file names will follow. You can, for example, join a prefix or suffix, include metadata, or generate random characters for every file name. (Default: **web-%f-%wx%h**)

> [!NOTE]
> Some formatting tokens may introduce characters that your OS or browser cannot handle in file names. In these events, your browser will replace the "evil" characters with underscores ("_").

**`No change`** File name of output will match input.

<div align="center">
<h3>Format</h3>
</div>

*Choose 1 below.*

**`JPG`** (Default) Output all files as JPG. *Optionally set the following.*

- *Quality:* The quality of the JPG output. Acceptable range is between 0.0 and 1.0. However, ".001" is the lowest practical limit. (Default: **0.9**)

**`PNG`** Output all files as PNG.

**`WEBP`** Output all files as PNG.

**`Match Input`** Will attempt to save JPG, PNG, and WEBP images in the same format as they were inputted. Other files will be saved as JPGs.

<div align="center">
<h3>Max Dimensions</h3>
</div>

If necessary, images will be scaled down to not exceed these limits. Images are scaled using Lanczos resampling with 3 lobes.

If left blank, then the corresponding dimension will have no limit.

*Set any or all below.*

**`Width`** (Default: **1280**)

**`Height`** (Default: **1024**)

<div align="center">
<h3>Metadata</h3>
</div>

Only basic EXIF metadata is supported, including Artist, Title/Description, Copyright, and DateTimeOriginal (the date the picture was taken/made). All other metadata will be removed. Each text field has a character limit of 280 ASCII characters.

Metadata is supported for JPGs only.

*Set any or all below.*

**`Artist`** The artist or photographer who created the picture. (Default: *[blank]*)

**`Title`** The title or description of the work. (Default: *[blank]*)

**`Copyright`** Who owns the copyright. (Default: *[blank]*)

**`DateTimeOriginal`** The date the picture was taken or made, at millisecond granularity if possible. Includes timezone data. Checking this option will attempt to get the creation date in the following order of priority: existing EXIF DateTimeOriginal, interpret from filename, file last modified time. (Default: *[off]*)
