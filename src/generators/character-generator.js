import {ImageAiClient} from '../clients/image-client.js';
import {prompts} from '../constants/prompts.js';

//

const imageAiClient = new ImageAiClient();

//

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
    const editedImg = await imageAiClient.editImg(blob, maskBlob, prompt);
    editedImg.classList.add('editImg-' + i);
    document.body.appendChild(editedImg);

    // draw back to the global canvas
    globalCtx.drawImage(editedImg, dx * w - canvasBounds[0], dy * h - canvasBounds[1]);
  }));

  // console.log('return global canvas', globalCanvas);

  return globalCanvas;
};

export class CharacterGenerator {
  async generate(prompt = prompts.character) {
    /* const {
      canvas,
      maskCanvas,
    } = createSeedImage(
      512, // w
      512, // h
      128, // rw
      128, // rh
      1, // p
      256, // n
      'rectangle',
    );

    canvas.classList.add('mainCanvas');
    canvas.style.cssText = `\
      background: red;
    `;
    document.body.appendChild(canvas);
    maskCanvas.classList.add('maskCanvas');
    maskCanvas.style.cssText = `\
      background: red;
    `;
    document.body.appendChild(maskCanvas);

    const blob = await new Promise((accept, reject) => {
      canvas.toBlob(accept, 'image/png');
    });
    const maskBlob = await new Promise((accept, reject) => {
      maskCanvas.toBlob(accept, 'image/png');
    });
    const prompt = prompts.character;

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
    console.log('response data 1', responseData);
    let image_url = responseData.data[0].url;
    console.log('response data 2', image_url);

    const u2 = new URL('/api/proxy', location.href);
    u2.searchParams.set('url', image_url);
    image_url = u2.href; */

    const img = await imageAiClient.createImage(prompt);
    document.body.appendChild(img);

    const outpaintedCanvas = await outpaintImage(img, prompt, [
      [0, -0.5],
      [0, 0.5],
    ]);
    // console.log('done outpainting', outpaintedCanvas);
    document.body.appendChild(outpaintedCanvas);
  }
};