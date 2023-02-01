import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {makePromise} from './promise-utils.js';

export const getMeshes = model => {
  const meshes = [];
  model.traverse(o => {
    if (o.isMesh) {
      meshes.push(o);
    }
  });
  return meshes;
};

export const loadGltf = avatarUrl => {
  const p = makePromise();
  const gltfLoader = new GLTFLoader();
  gltfLoader.load(avatarUrl, gltf => {
    p.resolve(gltf);
  }, function onProgress(xhr) {
    // console.log('progress', xhr.loaded / xhr.total);
  }, p.reject);
  return p;
};