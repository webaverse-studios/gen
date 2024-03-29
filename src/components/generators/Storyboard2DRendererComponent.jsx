import {useState, useEffect} from 'react';
import {ArrayBufferRenderer} from '../renderers/ArrayBufferRenderer.jsx';

import styles from '../../../styles/Storyboard2DRenderer.module.css';

//

import {
  promptKey,
  mainImageKey,
} from '../../zine/zine-data-specs.js';

//

export const Storyboard2DRendererComponent = ({
  panel,
}) => {
  const _getImage = () => {
    const layer = panel.getLayer(0);
    const image = layer?.getData(mainImageKey);
    return image ?? '';
  };
  const _getPrompt = () => {
    const layer = panel.getLayer(0);
    const prompt = layer?.getData(promptKey);
    return prompt ?? '';
  };
  const [image, setImage] = useState(_getImage);
  const [prompt, setPrompt] = useState(_getPrompt);

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