
/**
 * Compress a blob.
 * @param {Blob} blob The blob to compress.
 * @returns {Response} The compressed response.
 */
export function compressBlob(blob) {
  //noinspection JSUnresolvedFunction
  return new Response(
    blob
      .stream()
      .pipeThrough(new CompressionStream('gzip'))
  );
}
