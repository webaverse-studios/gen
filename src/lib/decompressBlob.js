
/**
 * Decompress a blob.
 * @param {Blob} blob The blob to save.
 * @returns {Promise<FileSystemFileHandle>} The file handle.
 */
export function decompressBlob(blob) {
  const
    ds = new DecompressionStream('gzip'),
    decompressedStream = blob.stream().pipeThrough(ds);

  return new Response(decompressedStream);
}
