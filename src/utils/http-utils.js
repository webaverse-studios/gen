import {
  devServerTmpUrl,
} from '../constants/generator-constants.js';

export const getFormData = o => {
  const formData = new FormData();
  for (const k in o) {
    formData.append(k, o[k]);
  }
  return formData;
};

export function downloadFile(file, filename) {
  const blobURL = URL.createObjectURL(file);
  const tempLink = document.createElement('a');
  tempLink.style.display = 'none';
  tempLink.href = blobURL;
  tempLink.setAttribute('download', filename);

  document.body.appendChild(tempLink);
  tempLink.click();
  document.body.removeChild(tempLink);
}

let ids = 0;
export async function openZineFile(file) {
  const u = `${devServerTmpUrl}/zine-${++ids}.zine`;
  const res = await fetch(u, {
    method: 'PUT',
    body: file,
  });
  // console.log('got res', u, res);
  const blob2 = await res.blob();
  // console.log('got result', u, blob2);

  // const devServerUrl 
  const u2 = new URL(`https://local.webaverse.com/`);
  u2.searchParams.set('src', u);

  // console.log('got u', u2.href, blob2);

  // open in new tab
  window.open(u2.href, '_blank');
}