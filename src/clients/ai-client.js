import {Configuration, OpenAIApi} from 'openai';
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