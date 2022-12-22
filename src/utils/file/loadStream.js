import { UploadToast } from '../toasts/index.js'


/**
 * Load a stream.
 * @param {ReadableStream<any>} stream The stream to load.
 * @param {string} name The name of the stream.
 * @param {number} [size] The total size of the stream.
 * @returns {ReadableStream<any>} The stream.
 */
export function loadStream(
  stream = new ReadableStream(),
  name = 'stream',
  size,
) {
  return stream
    .pipeThrough(new UploadToast(name, size).pipe);
}
