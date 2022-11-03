import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// import {
//   chunkSize,
// } from '../../constants/procgen-constants.js';
// import {
//   spacing,
// } from '../../constants/map-constants.js';

//

export class Target2DMesh extends THREE.Mesh {
  constructor() {
    // draw a the corner part with two rectangles
    const lengthness = 8;
    const fatness = 2;
    const s = 1/8;
    const topLeftTopGeometry = new THREE.PlaneGeometry(lengthness, fatness)
      .translate(lengthness/2 - fatness/2, 0, 0)
      .rotateX(-Math.PI / 2);
    const topLeftBottomGeometry = new THREE.PlaneGeometry(fatness, lengthness - 1)
      .translate(0, -(lengthness - 1) / 2, 0)
      .rotateX(-Math.PI / 2);
    const cornerGeometry = BufferGeometryUtils.mergeBufferGeometries([
      topLeftTopGeometry,
      topLeftBottomGeometry,
    ]);
    cornerGeometry.scale(s, s, s);
    
    const topLeftGeometry = cornerGeometry.clone()
      .scale(s, s, s)
      .translate(-0.5, 0, -0.5);
    const bottomLeftGeometry = cornerGeometry.clone()
      .rotateY(Math.PI / 2)
      .scale(s, s, s)
      .translate(-0.5, 0, 0.5);
    const bottomRightGeometry = cornerGeometry.clone()
      .rotateY(Math.PI)
      .scale(s, s, s)
      .translate(0.5, 0, 0.5);
    const topRightGeometry = cornerGeometry.clone()
      .rotateY(-Math.PI / 2)
      .scale(s, s, s)
      .translate(0.5, 0, -0.5);
    // const geometry = new THREE.BoxBufferGeometry(1, 1, 1);
    const geometry = BufferGeometryUtils.mergeBufferGeometries([
      topLeftGeometry,
      bottomLeftGeometry,
      bottomRightGeometry,
      topRightGeometry,
    ]);
    const material = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      // opacity: 0.5,
    });
    super(geometry, material);
  }
  setOpacity(opacity) {
    this.material.opacity = opacity;
  }
}