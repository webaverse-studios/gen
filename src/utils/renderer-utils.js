import {
  makeRenderer,
} from '../zine/zine-utils.js';

//

export const getMeshes = model => {
  const meshes = [];
  model.traverse(o => {
    if (o.isMesh) {
      meshes.push(o);
    }
  });
  return meshes;
};

//

export const makeRendererWithBackground = (canvas) => {
  const renderer = makeRenderer(canvas);
  renderer.setClearColor(0xFFFFFF, 1);
  return renderer;
};