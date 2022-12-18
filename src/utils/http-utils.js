import { saveCompressedBlob } from '../lib/index.js'


export const getFormData = o => {
  const formData = new FormData();
  for (const k in o) {
    formData.append(k, o[k]);
  }
  return formData;
};

export async function downloadFile(file, filename) {
  return saveCompressedBlob(file, filename)
}
