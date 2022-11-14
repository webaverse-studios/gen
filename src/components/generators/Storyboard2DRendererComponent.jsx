import {useState, useEffect} from 'react';
// import {BlobRenderer} from '../renderers/BlobRenderer.jsx';
import {ArrayBufferRenderer} from '../renderers/ArrayBufferRenderer.jsx';

import styles from '../../../styles/Storyboard2DRenderer.module.css';

//

import {mainImageKey} from '../../generators/scene-generator.js';

//

export const Storyboard2DRendererComponent = ({
  storyboard,
  panel,
}) => {
  const _getImage = () => panel.getData(mainImageKey);
  const [image, setImage] = useState(_getImage);

  useEffect(() => {
    const onupdate = e => {
      setImage(_getImage());
    };
    panel.addEventListener('update', onupdate);

    setImage(_getImage());

    return () => {
      panel.removeEventListener('update', onupdate);
    };
  }, [panel]);

  return (
    <div className={styles.storyboard2DRenderer}>
      <div className={styles.header}>
        <div className={styles.text}>Status: Not compiled</div>
        <button className={styles.button} onClick={async e => {
          await panel.compile();
        }}>Compile</button>
      </div>
      <ArrayBufferRenderer srcObject={image} className={styles.img} />
    </div>
  );
};