import {createImage, outpaintImage} from '../clients/ai-client.js';
import {prompts} from '../constants/prompts.js';

export class CharacterGenerator {
  async generate() {
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

    const prompt = prompts.character;
    const img = await createImage(prompt);
    document.body.appendChild(img);

    const outpaintedCanvas = await outpaintImage(img, prompt, [
      [0, -0.5],
      [0, 0.5],
    ]);
    console.log('done outpainting', outpaintedCanvas);
    document.body.appendChild(outpaintedCanvas);
  }
};