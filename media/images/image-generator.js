import {stableDiffusionUrl} from '../../constants/endpoints.js';

// seed args:
// character: [512, 512, 64, 128, 1, 256]
// backpack: [512, 512, 64, 128, 1, 256]
// sword: [512, 512, 32, 128, 1, 256]
// rifle: [512, 512, 128, 64, 1, 256]
// pistol: [512, 512, 64, 64, 1, 256]
// potion: [512, 512, 64, 64, 1, 256]
// chestArmor: [512, 512, 64, 128, 1, 256]
// legArmor: [512, 512, 64, 128, 1, 256]
// helmet: [512, 512, 64, 64, 1, 256]
// location: [512, 512, 64, 64, 1, 256]
// map: [512, 512, 64, 64, 1, 256]

export const generateImage = ({
  modelName,
  suffix,
  seed,
}) => async description => {
  if (!seed) {
    const s = `${description}, ${suffix}`;
    const u = `${stableDiffusionUrl}/image?s=${encodeURIComponent(s)}${modelName ? `&model=${modelName}` : ''}`;
    console.log('generate image url 1', {u});
    const res = await fetch(u);
    // console.log('generate image url 2', {u, status: res.status});
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
  } else {
    throw new Error(`seed based generation not implemented`);
  }
};