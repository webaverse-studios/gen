import {useRef} from 'react';

import styles from '../../../styles/Storyboard3DRenderer.module.css';

export const Storyboard3DRendererComponent = ({
  panel,
}) => {
  const canvasRef = useRef();

  const keydown = e => {
    if (!e.repeat) {
      // console.log('got key', e.key);
      switch (e.key) {
        case ' ': {
          if (step === 2) {
            e.preventDefault();
            e.stopPropagation();

            sceneRenderer.renderBackground();
          }
          break;
        }
      }
    }
  };
  document.addEventListener('keydown', keydown);

  return (
    <div className={styles.storyboard2DRenderer}>
      <div className={styles.header}>
        <div className={styles.text}>Status: Not compiled</div>
        <button class={styles.button} onClick={async e => {
          await panel.compile();
        }}></button>
      </div>
      <div className={styles.canvasWrap} ref={canvasRef} />
    </div>
  );
};