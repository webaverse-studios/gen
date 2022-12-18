import { compressBlob } from './compressBlob.js'
import { pipeResponseToFile } from './pipeResponseToFile.js'


const types = [
  {
    description: 'Zine',
    accept: {
      'application/octet-stream': ['.zine'],
    }
  }
]


/**
 * Save a blob.
 * @param {Blob} blob The blob to save.
 * @param {string} filename The suggested filename.
 * @param {string} id The file picker ID.
 * @returns {Promise<FileSystemFileHandle>} The file handle.
 */
export async function saveBlob(
  blob = new Blob(),
  filename = 'file.gz',
  id = 'download',
) {
  const
    response = new Response(blob),

    handle = await window.showSaveFilePicker({
      types,
      suggestedName: filename,
      id: 'zine',
    });

  await pipeResponseToFile(response, handle);
  return handle;
}
