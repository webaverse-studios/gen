// import {useState} from 'react';
// import classnames from 'classnames';

import offscreenEngineApi from 'offscreen-engine/offscreen-engine-api.js';
import {
  compileVirtualScene,
} from '../src/generators/scene-generator.js';

offscreenEngineApi(async (funcName, args, opts) => {
  if (funcName === 'compileScene') {
    const {imageArrayBuffer} = args;
    const result = await compileVirtualScene(imageArrayBuffer);
    return result;
  } else {
    throw new Error('unknown function: ' + funcName);
  }
});

//

const Engine = () => {
  return (
    <div className='engine-fake-node' />
  );
};
export default Engine;