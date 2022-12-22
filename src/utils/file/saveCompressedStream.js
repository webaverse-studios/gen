import { compressStream } from '../compression.js'
import { saveStream } from './saveStream.js'


const gzipTypes = [{
  description: 'Gzip',
  accept: {
    'application/gzip': ['.gz'],
  }
}]


/**
 * Compresses a stream and save it to a file.
 * @param {ReadableStream<any>} stream The stream to compress.
 * @param {string} suggestedName The suggested name.
 * @param {number} [size] The total size of the stream.
 * @returns {Promise<FileSystemFileHandle>} The file handle.
 */
export function saveCompressedStream(stream, suggestedName, size) {
  return saveStream(compressStream(stream), gzipTypes, suggestedName, size);
}
