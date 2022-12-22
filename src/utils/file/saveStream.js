import { pipeResponseToFile } from './pipeResponseToFile.js';


const defaultTypes = [{
  description: 'File',
  accept: {
    'application/octet-stream': ['.bin'],
  }
}];


/**
 * Get the first file extension from a types object.
 */
function getFirstExtension(types) {
  return Object.values(types[0].accept)[0][0];
}


/**
 * Save a stream to a file.
 * @param {ReadableStream<any>} stream The blob to save.
 * @param {Array<object>} types The file types.blob
 * @param {string} suggestedName The suggested filename.
 * @param {number} [size] The total size of the stream.
 * @returns {Promise<FileSystemFileHandle>} The file handle.
 */
export async function saveStream(
  stream = new ReadableStream(),
  types = defaultTypes,
  suggestedName = `file${getFirstExtension(types)}`,
  size,
) {
  // Prepare a response and get a file handle.
  //noinspection JSUnresolvedFunction
  const handle = await window.showSaveFilePicker({ types, suggestedName });

  await pipeResponseToFile(new Response(stream), handle, size);
  return handle;
}
