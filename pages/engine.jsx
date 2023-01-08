import offscreenEngineApi from 'offscreen-engine/offscreen-engine-api.js';
import {
  compileVirtualScene,
} from '../src/generators/scene-generator.js';
import {
  ZineStoryboard,
} from '../src/zine/zine-format.js';
// import {zbencode} from '../src/zine/encoding.js';
import {
  mainImageKey,
  promptKey,
  layer0Specs,
  layer1Specs,
} from '../src/zine/zine-data-specs.js';
import physx from '../physx.js';
import {VQAClient} from '../src/clients/vqa-client.js';

offscreenEngineApi(async (funcName, args, opts) => {
  if (funcName === 'compileScene') {
    await physx.waitForLoad();

    const {
      imageArrayBuffer,
      // prompt,
    } = args;

    if (!imageArrayBuffer) {
      throw new Error('offscreenEngineApi got no imageArrayBuffer', imageArrayBuffer);
    }
    // if (!prompt) {
    //   throw new Error('offscreenEngineApi got no prompt', prompt);
    // }

    const storyboard = new ZineStoryboard();
    const panel0 = storyboard.addPanel();

    const layer0 = panel0.addLayer();
    layer0.setData(mainImageKey, imageArrayBuffer);
    
    // use vqa to set the prompt
    const vqaClient = new VQAClient();
    const blob = new Blob([imageArrayBuffer]);
    const prompt = await vqaClient.getImageCaption(blob);
    console.log('computed prompt: ' + JSON.stringify(prompt));
    layer0.setData(promptKey, prompt);

    const compileResult = await compileVirtualScene(imageArrayBuffer);

    const layer1 = panel0.addLayer();
    for (const name of layer1Specs) {
      const v = compileResult[name];
      layer1.setData(name, v);
    }
    
    const uint8Array = await storyboard.exportAsync();
    return uint8Array;
  } else {
    throw new Error('unknown function: ' + funcName);
  }
});

//

export const Engine = () => {
  return (
    <div className='engine-fake-node' />
  );
};