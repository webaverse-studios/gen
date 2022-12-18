import offscreenEngineApi from 'offscreen-engine/offscreen-engine-api.js';
import {
  compileVirtualScene,
} from '../src/generators/scene-generator.js';
import {
  ZineStoryboard,
} from '../src/zine/zine-format.js';
import {zbencode} from '../src/zine/encoding.js';
import {
  mainImageKey,
  promptKey,
  layer0Specs,
  layer1Specs,
} from '../src/zine/zine-data-specs.js';

offscreenEngineApi(async (funcName, args, opts) => {
  if (funcName === 'compileScene') {
    const {imageArrayBuffer, prompt = ''} = args;

    const storyboard = new ZineStoryboard();
    const panel0 = storyboard.addPanel();

    const layer0 = panel0.addLayer();
    layer0.setData(mainImageKey, imageArrayBuffer);
    layer0.setData(promptKey, prompt);

    const compileResult = await compileVirtualScene(imageArrayBuffer);

    const layer1 = panel0.addLayer();
    for (const name of layer1Specs) {
      const v = compileResult[name];
      layer1.setData(name, v);
    }
    
    const uint8Array = storyboard.export();
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