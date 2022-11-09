import {Configuration, OpenAIApi} from 'openai';
import {getFormData} from '../utils/http-utils.js';
import {OPENAI_API_KEY} from '../constants/auth.js';

const configuration = new Configuration({
  apiKey: OPENAI_API_KEY,
  // formDataCtor: FormData,
});
const openai = new OpenAIApi(configuration);

export const createImage = async (prompt) => {
  const response = await openai.createImage({
    prompt,
    n: 1,
    size: "1024x1024",
  });
  let image_url = response.data.data[0].url;

  const u2 = new URL('/api/proxy', location.href);
  u2.searchParams.set('url', image_url);
  image_url = u2.href;

  const img = new Image();
  await new Promise((accept, reject) => {
    img.onload = accept;
    img.onerror = reject;
    img.crossOrigin = 'Anonymous';
    img.src = image_url;
  });
  return img;
};

export const createImageBlob = async (prompt) => {
  const response = await openai.createImage({
    prompt,
    n: 1,
    size: "1024x1024",
  });
  let image_url = response.data.data[0].url;

  const u2 = new URL('/api/proxy', location.href);
  u2.searchParams.set('url', image_url);
  image_url = u2.href;

  const res = await fetch(image_url);
  const blob = await res.blob();
  return blob;
};

export const editImg = async (blob, maskBlob, prompt) => {
  const fd = getFormData({
    image: blob,
    mask: maskBlob,
    prompt,
    n: 1,
    size: '1024x1024',
  });
  const response = await fetch(`https://api.openai.com/v1/images/edits`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: fd,
  });
  const responseData = await response.json();
  let image_url = responseData.data[0].url;

  const u2 = new URL('/api/proxy', location.href);
  u2.searchParams.set('url', image_url);
  image_url = u2.href;

  const img = new Image();
  await new Promise((accept, reject) => {
    img.onload = accept;
    img.onerror = reject;
    img.crossOrigin = 'Anonymous';
    img.src = image_url;
  });
  // document.body.appendChild(img);
  return img;
};

// spec is like [[0, 1], [2, 3]]
export const outpaintImage = async (img, prompt, specs) => {
  const w = img.width;
  const h = img.height;

  // prepare global canvas
  let canvasBounds = null;
  for (let i = 0; i < specs.length; i++) {
    const [dx, dy] = specs[i];
    if (!canvasBounds) {
      canvasBounds = [
        dx * img.width,
        dy * img.width,
        dx * img.width + img.width,
        dy * img.height + img.height,
      ];
    } else {
      canvasBounds[0] = Math.min(canvasBounds[0], dx * img.width);
      canvasBounds[1] = Math.min(canvasBounds[1], dy * img.height);
      canvasBounds[2] = Math.max(canvasBounds[2], dx * img.width + img.width);
      canvasBounds[3] = Math.max(canvasBounds[3], dy * img.height + img.height);
    }
  }
  // create global canvas
  const globalCanvas = document.createElement('canvas');
  globalCanvas.width = canvasBounds[2] - canvasBounds[0];
  globalCanvas.height = canvasBounds[3] - canvasBounds[1];
  globalCanvas.classList.add('globalCanvas');
  const globalCtx = globalCanvas.getContext('2d');
  // draw the base image in the center
  globalCtx.drawImage(img, -canvasBounds[0], -canvasBounds[1]);

  // outpaint all specs in parallel
  await Promise.all(specs.map(async (spec, i) => {
    const [dx, dy] = spec;

    const canvas = document.createElement('canvas');
    if (!canvas.classList) {
      debugger;
    }
    canvas.classList.add('canvas-' + i);
    canvas.width = w;
    canvas.height = h;
    canvas.style.cssText = `\
      background: red;
    `;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFF';
    ctx.fillRect(0, 0, w, h);
    document.body.appendChild(canvas);

    const maskCanvas = document.createElement('canvas');
    // if (!maskCanvas.classList) {
    //   debugger;
    // }
    maskCanvas.classList.add('maskCanvas-' + i);
    maskCanvas.width = w;
    maskCanvas.height = h;
    maskCanvas.style.cssText = `\
      background: red;
    `;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.fillStyle = '#FFF';
    maskCtx.fillRect(0, 0, w, h);
    document.body.appendChild(maskCanvas);

    // draw the offsetted canvas
    ctx.drawImage(img, -dx * w, -dy * h);
    maskCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    maskCtx.globalCompositeOperation = 'destination-out';
    maskCtx.fillRect(dx * w, dy * h, w, h);

    const blob = await new Promise((accept, reject) => {
      canvas.toBlob(accept, 'image/png');
    });
    const maskBlob = await new Promise((accept, reject) => {
      maskCanvas.toBlob(accept, 'image/png');
    });

    // fetch from openai
    const editedImg = await editImg(blob, maskBlob, prompt);
    // console.log('got edited img', editedImg);
    if (!editedImg.classList) {
      debugger;
    }
    editedImg.classList.add('editImg-' + i);
    document.body.appendChild(editedImg);

    // draw back to the global canvas
    globalCtx.drawImage(editedImg, dx * w - canvasBounds[0], dy * h - canvasBounds[1]);
  }));

  // console.log('return global canvas', globalCanvas);

  return globalCanvas;
};