import {useState, useEffect} from 'react';
// import {BlobRenderer} from '../renderers/BlobRenderer.jsx';
import {ArrayBufferRenderer} from '../renderers/ArrayBufferRenderer.jsx';

import styles from '../../../styles/Storyboard2DRenderer.module.css';

//

import {
  promptKey,
  mainImageKey,
} from '../../zine/zine-data-specs.js';

//

export const Storyboard2DRendererComponent = ({
  storyboard,
  panel,
}) => {
  const _getImage = () => {
    console.log('got image 0', {panel});
    const layer = panel.getLayer(0);
    console.log('got image 1', {layer});
    const image = layer.getData(mainImageKey);
    console.log('got image 2', {layer, image});
    return image ?? '';
  };
  const _getPrompt = () => {
    const layer = panel.getLayer(0);
    console.log('got layer 1', {layer});
    const prompt = layer?.getData(promptKey);
    console.log('got prompt 2', {layer, prompt});
    return prompt ?? '';
  };
  const [prompt, setPrompt] = useState(_getPrompt);
  const [image, setImage] = useState(_getImage);

  useEffect(() => {
    const onupdate = e => {
      setImage(_getImage());
      setPrompt(_getPrompt());
    };
    panel.addEventListener('update', onupdate);

    setImage(_getImage());
    setPrompt(_getPrompt());

    return () => {
      panel.removeEventListener('update', onupdate);
    };
  }, [panel]);

  return (
    <div className={styles.storyboard2DRenderer}>
      <div className={styles.header}>
        <input type='text' className={styles.input} value={prompt} placeholder='prompt' onChange={e => {
          setPrompt(e.target.value);
          panel.setData(promptKey, e.target.value);
        }} />
        <div className={styles.text}>Status: Not compiled</div>
        <button className={styles.button} onClick={async e => {
          await panel.compile();
        }}>Compile</button>
      </div>
      <ArrayBufferRenderer srcObject={image} className={styles.img} />
    </div>
  );
};