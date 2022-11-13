import styles from '../../../styles/Storyboard3dRenderer.module.css';

export const Storyboard3DRendererComponent = ({
  panel,
}) => {
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
    <div className={styles.canvasWrap} ref={canvasRef} />
  );
};