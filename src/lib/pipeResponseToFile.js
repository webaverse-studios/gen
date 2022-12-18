
/**
 * Pipe a response to a file.
 * @param {Response} response The response to pipe.
 * @param {FileSystemFileHandle} handle The file handle.
 * @returns {Promise<FileSystemFileHandle>} The file handle.
 */
export async function pipeResponseToFile(response, handle) {
  response.body.pipeTo( await handle.createWritable())
  return handle;
}
