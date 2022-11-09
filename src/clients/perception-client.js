import {boosts} from '../constants/prompts.js';

export async function getLabel(blob, {
  classes,
  threshold,
}) {
  const res = await fetch(`https://ov-seg.webaverse.com/label?classes=${classes.join(',')}&boosts=${boosts}&threshold=${threshold}`, {
    method: "POST",
    body: blob,
    headers: {
      "Content-Type": "image/png",
    },
    mode: 'cors',
  });
  if (res.ok) {
    const headers = Object.fromEntries(res.headers.entries());
    const blob = await res.blob();
    return {
      headers,
      blob,
    };
    /* try {
      console.log('form data 1');
      const formData = await res.formData();
      console.log('form data 2');
      return formData;
    } catch (err) {
      debugger;
    } */
  } else {
    // console.log('form data 3', res);
    debugger;
  }
}

//

// support darag and drop
if (typeof window !== 'undefined') {
  document.addEventListener('dragover', e => {
    e.preventDefault();
    e.stopPropagation();
  });
  document.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    const file = files[0];
    if (file) {
      const u = URL.createObjectURL(file);
      await globalThis.testWorldGen(u);
      URL.revokeObjectURL(u);
    }
  });
}