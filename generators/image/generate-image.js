import {stableDiffusionUrl} from '../../constants/endpoints.js';

export const generateImage = ({
  modelName,
  prefix,
}) => async ({
  name,
  description,
} = {}) => {
  const s = `${prefix} ${description}`;
  const u = `${stableDiffusionUrl}/image?s=${encodeURIComponent(s)}&model=${modelName}`;
  console.log('generate image url 1', {u});
  const res = await fetch(u);
  console.log('generate image url 2', {u, status: res.status});
  if (res.ok) {
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > 0) {
      return arrayBuffer;
    } else {
      throw new Error(`generated empty image`);
    }
  } else {
    throw new Error(`invalid status: ${res.status}`);
  }
};