import { DownloadToast } from '../toasts/index.js'


/**
 * Pipe a response to a file.
 * @param {Response} response The response to pipe.
 * @param {FileSystemFileHandle} handle The file handle.
 * @param {number} [size] The total size of the response.
 * @returns {Promise<FileSystemFileHandle>} The file handle.
 */
export async function pipeResponseToFile(response, handle, size) {
  //noinspection JSUnresolvedFunction
  const writable = await handle.createWritable();

  // Notify the user that the download has begun.
  const toast = new DownloadToast(handle.name, size);

  await response.body
    .pipeThrough(toast.pipe)
    .pipeTo(writable)

  return handle;
}
