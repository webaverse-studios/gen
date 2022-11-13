import {useState, useEffect} from 'react';

import styles from '../../../styles/Storyboard2DRenderer.module.css';

export const Storyboard2DRendererComponent = ({
  storyboard,
  panel,
}) => {
  const [image, setImage] = useState(panel.renders.image);

  const _getImage = () => panel.renders.image;

  useEffect(() => {
    const onrenderupdate = e => {
      setImage(_getImage());
    };
    panel.addEventListener('renderupdate', onrenderupdate);

    setImage(_getImage());

    return () => {
      panel.removeEventListener('renderupdate', onrenderupdate);
    };
  }, [panel]);

  return (
    <div className={styles.storyboard2DRenderer}>
      <div className={styles.header}>
        <div className={styles.text}>Status: Not compiled</div>
        <button class={styles.button} onClick={async e => {
          await panel.compile();
        }}>Compile</button>
      </div>
      <img src={image} className={styles.img} />
    </div>
  );
};