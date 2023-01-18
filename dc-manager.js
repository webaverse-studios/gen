/*
dc wasm integration.
*/

import Module from './public/dc.module.js';
import {Allocator, ScratchStack} from './geometry-util.js';

const dc = {};

let loadPromise = null;
// let scratchStack = null;
// dc.loaded = false;
dc.waitForLoad =  () => {
  if (!loadPromise) {
    loadPromise = (async () => {
      await Module.waitForLoad();

      // Module._initialize();

      // const scratchStackSize = 8 * 1024 * 1024;
      // scratchStack = new ScratchStack(Module, scratchStackSize);

      // dc.loaded = true;
    })();
  }
  return loadPromise;
};

const fillModes = ['floodFill', 'surfaceOnly', 'raycastFill'];
dc.fillModes = fillModes;

const dcWorker = (() => {
  const w = {};
  w.alloc = (constructor, count) => {
    if (count > 0) {
      const size = constructor.BYTES_PER_ELEMENT * count;
      const ptr = Module._doMalloc(size)
      return new constructor(Module.HEAP8.buffer, ptr, count);
    } else {
      return new constructor(Module.HEAP8.buffer, 0, 0);
    }
  };
  w.free = (ptr) => {
    Module._doFree(ptr)
  };
  w.createInstance = ({
    chunkSize,
    range,
    fatness,
  }) => {
    return Module._createInstance(
      chunkSize,
      range,
      fatness,
    );
  };
  w.destroyInstance = (...args) => {
    return Module._destroyInstance(...args);
  };
  w.createPointCloudMesh = (instance, positions) => {
    const allocator = new Allocator(Module);

    const positionsTypedArray = allocator.alloc(Float32Array, positions.length);
    positionsTypedArray.set(positions);

    const outputLengthArray = allocator.alloc(Uint32Array, 1);

    const outputBufferOffset = Module._createPointCloudMesh(
      instance,
      positionsTypedArray.byteOffset,
      positionsTypedArray.length,
      outputLengthArray.byteOffset,
    );

    const outputLength = outputLengthArray[0];
    const outputBuffer = new Uint8Array(
      Module.HEAP8.buffer,
      outputBufferOffset,
      outputLength
    ).slice();

    allocator.freeAll();
    Module._doFree(outputBufferOffset);

    return outputBuffer;
  };
  w.marchCubes = (instance, positions) => {
    const allocator = new Allocator(Module);

    const positionsTypedArray = allocator.alloc(Float32Array, positions.length);
    positionsTypedArray.set(positions);

    const outputLengthArray = allocator.alloc(Uint32Array, 1);

    const outputBufferOffset = Module._marchCubes(
      instance,
      positionsTypedArray.byteOffset,
      positionsTypedArray.length,
      outputLengthArray.byteOffset,
    );

    const outputLength = outputLengthArray[0];
    const outputBuffer = new Uint8Array(
      Module.HEAP8.buffer,
      outputBufferOffset,
      outputLength
    ).slice();

    allocator.freeAll();
    Module._doFree(outputBufferOffset);

    return outputBuffer;
  };
  // class Parameters
  // {
  // public:
  //     IUserCallback*      m_callback{nullptr};            // Optional user provided callback interface for progress
  //     IUserLogger*        m_logger{nullptr};              // Optional user provided callback interface for log messages
  //     IUserTaskRunner*    m_taskRunner{nullptr};          // Optional user provided interface for creating tasks
  //     uint32_t            m_maxConvexHulls{ 64 };         // The maximum number of convex hulls to produce
  //     uint32_t            m_resolution{ 400000 };         // The voxel resolution to use
  //     double              m_minimumVolumePercentErrorAllowed{ 1 }; // if the voxels are within 1% of the volume of the hull, we consider this a close enough approximation
  //     uint32_t            m_maxRecursionDepth{ 10 };        // The maximum recursion depth
  //     bool                m_shrinkWrap{true};             // Whether or not to shrinkwrap the voxel positions to the source mesh on output
  //     FillMode            m_fillMode{ FillMode::FLOOD_FILL }; // How to fill the interior of the voxelized mesh
  //     uint32_t            m_maxNumVerticesPerCH{ 64 };    // The maximum number of vertices allowed in any output convex hull
  //     bool                m_asyncACD{ true };             // Whether or not to run asynchronously, taking advantage of additional cores
  //     uint32_t            m_minEdgeLength{ 2 };           // Once a voxel patch has an edge length of less than 4 on all 3 sides, we don't keep recursing
  //     bool                m_findBestPlane{ false };       // Whether or not to attempt to split planes along the best location. Experimental feature. False by default.
  // };
  w.vhacd = ({
    positions,
    indices,
    
    maxConvexHulls = 64,
    resolution = 400000,
    minimumVolumePercentErrorAllowed = 1,
    maxRecursionDepth = 10,
    shrinkWrap = true,
    fillMode = fillModes[0],
    maxNumVerticesPerCH = 64,
    minEdgeLength = 2,
    findBestPlane = false,
  }) => {
    const allocator = new Allocator(Module);

    const positionsTypedArray = allocator.alloc(Float32Array, positions.length);
    positionsTypedArray.set(positions);

    const indicesTypedArray = allocator.alloc(Uint32Array, indices.length);
    indicesTypedArray.set(indices);

    const outputLengthArray = allocator.alloc(Uint32Array, 1);

    const shrinkWrapInt = +shrinkWrap;
    const fillModeIndex = fillModes.indexOf(fillMode);
    if (fillModeIndex === -1) {
      throw new Error('invalid fill mode: ' + fillMode);
    }
    const findBestPlaneInt = +findBestPlane;

    const outputBufferOffset = Module._vhacd(
      positionsTypedArray.byteOffset,
      positionsTypedArray.length,
      indicesTypedArray.byteOffset,
      indicesTypedArray.length,

      outputLengthArray.byteOffset,

      maxConvexHulls,
      resolution,
      minimumVolumePercentErrorAllowed,
      maxRecursionDepth,
      shrinkWrapInt,
      fillModeIndex,
      maxNumVerticesPerCH,
      minEdgeLength,
      findBestPlaneInt,
    );

    const outputLength = outputLengthArray[0];
    const outputBuffer = new Uint8Array(
      Module.HEAP8.buffer,
      outputBufferOffset,
      outputLength
    ).slice();

    allocator.freeAll();
    Module._doFree(outputBufferOffset);

    return outputBuffer;
  };
  return w;
})();
dc.dcWorker = dcWorker;
export default dc;