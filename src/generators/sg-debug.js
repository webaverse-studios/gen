import * as THREE from 'three';
import {
  panelSize,
} from '../constants/sg-constants.js';
import {
  setCameraViewPositionFromViewZ,
} from '../clients/reconstruction-client.js';
import {colors, rainbowColors, detectronColors} from '../constants/detectron-colors.js';

//

const localVector = new THREE.Vector3();
const localColor = new THREE.Color();

//

export const depthFloats2Canvas = (depthFloats, width, height, camera, scale = 30) => {
  const canvas = document.createElement('canvas');
  canvas.classList.add('reconstructionCanvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const imageData = context.createImageData(canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < depthFloats.length; i++) {
    const x = (i % canvas.width);
    const y = Math.floor(i / canvas.width);

    const px = x / canvas.width;
    const py = y / canvas.height;

    const viewZ = depthFloats[i];
    const worldPoint = setCameraViewPositionFromViewZ(px, py, viewZ, camera, localVector);

    const index = y * canvas.width + x;
    data[index*4 + 0] = -worldPoint.z / scale * 255;
    data[index*4 + 1] = 0;
    data[index*4 + 2] = 0;
    data[index*4 + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
};

//

export const distanceFloats2Canvas = (distanceFloatImageData, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.classList.add('outlineCanvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const imageData = context.createImageData(canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < distanceFloatImageData.length; i += 4) {
    const r = distanceFloatImageData[i];
    const g = distanceFloatImageData[i+1];
    const b = distanceFloatImageData[i+2];
    const a = distanceFloatImageData[i+3];

    const j = i / 4;
    const x = j % canvas.width;
    const y = Math.floor(j / canvas.width);

    const expectedPoint = new THREE.Vector2(x, y);
    const realPoint = new THREE.Vector2(r, g);
    const d = realPoint.distanceTo(expectedPoint);
    const f = Math.max(1 - d / canvas.width, 0);

    // flip y
    const index = (canvas.height - y - 1) * canvas.width + x;
    data[index*4 + 0] = r / canvas.width * 255 * f;
    data[index*4 + 1] = g / canvas.width * 255 * f;
    data[index*4 + 2] = b / canvas.width * 255 * f;
    data[index*4 + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
};

//

export const maskIndex2Canvas = (maskIndex, width, height) => {
  // draw maskIndex to canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.classList.add('maskIndexCanvas');
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  for (let i = 0; i < maskIndex.length; i++) {
    const j = i * 4;
    const index = maskIndex[i];
    data[j + 0] = ((index & 0xFF0000) >> 16);
    data[j + 1] = ((index & 0x00FF00) >> 8);
    data[j + 2] = (index & 0x0000FF);
    data[j + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

//

export  const segmentsImg2Canvas = (imageBitmap, {
  color = false,
} = {})  => {  
  const canvas = document.createElement('canvas');
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const {data} = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i + 0];
    const segmentIndex = r;

    if (color) {
      const c = localColor.setHex(colors[segmentIndex % colors.length]);
      data[i + 0] = c.r * 255;
      data[i + 1] = c.g * 255;
      data[i + 2] = c.b * 255;
      data[i + 3] = 255;
    } else {
      data[i + 0] = segmentIndex;
      data[i + 1] = segmentIndex;
      data[i + 2] = segmentIndex;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  // resize the canvas to the image size
  const canvas2 = document.createElement('canvas');
  canvas2.width = panelSize;
  canvas2.height = panelSize;

  const ctx2 = canvas2.getContext('2d');
  ctx2.imageSmoothingEnabled = false;
  ctx2.drawImage(canvas, 0, 0, canvas2.width, canvas2.height);

  return canvas2;
};

//

export const planesMask2Canvas = (planesMask, {
  color = false,
} = {}) => {
  const canvas = document.createElement('canvas');
  canvas.width = panelSize;
  canvas.height = panelSize;

  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const {data} = imageData;
  for (let i = 0; i < planesMask.length; i++) {
    const baseIndex = i * 4;
    const planeIndex = planesMask[i];
    
    if (color) {
      const c = localColor.setHex(rainbowColors[planeIndex % rainbowColors.length]);

      data[baseIndex + 0] = c.r * 255;
      data[baseIndex + 1] = c.g * 255;
      data[baseIndex + 2] = c.b * 255;
      data[baseIndex + 3] = 255;
    } else {
      data[baseIndex + 0] = planeIndex;
      data[baseIndex + 1] = planeIndex;
      data[baseIndex + 2] = planeIndex;
      data[baseIndex + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
};