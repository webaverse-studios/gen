

/**
 * Compress a blob and return a readable stream.
 * @param {ReadableStream<any>} stream The stream to compress.
 * @returns {ReadableStream<any>} The compressed stream.
 */
export function compressStream(stream) {
  //noinspection JSUnresolvedFunction
  return stream.pipeThrough(new CompressionStream('gzip'));
}


/**
 * Decompress a blob and return a readable stream.
 * @param {ReadableStream<any>} stream The stream to decompress.
 * @returns {ReadableStream<any>} The decompressed stream.
 */
export function decompressStream(stream) {
  //noinspection JSUnresolvedFunction
  return stream.pipeThrough(new DecompressionStream('gzip'));
}
