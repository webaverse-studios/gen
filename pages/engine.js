import offscreenEngineApi from 'offscreen-engine/offscreen-engine-api.js';
import {
  compileVirtualScene,
} from '../src/generators/scene-generator.js';
import {zbencode} from '../src/zine/encoding.js';

offscreenEngineApi(async (funcName, args, opts) => {
  if (funcName === 'compileScene') {
    const {imageArrayBuffer} = args;
    const storyboardObject = await compileVirtualScene(imageArrayBuffer);
    const uint8Array = zbencode(storyboardObject);
    return uint8Array;
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