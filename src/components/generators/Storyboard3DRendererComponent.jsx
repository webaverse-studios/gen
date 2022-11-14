import { useEffect } from 'react';
import {useRef} from 'react';

import {panelSize, layer1Specs} from '../../generators/scene-generator.js';
import styles from '../../../styles/Storyboard3DRenderer.module.css';

//

const Panel3DCanvas = ({
  panel,
}) => {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && panel.getDimension() === 3) {
      const renderer = panel.createRenderer(canvas);

      return () => {
        renderer.destroy();
      };
    }
  }, [panel, canvasRef.current]);
  
  return (
    <canvas
      className={styles.canvas}
      width={panelSize}
      height={panelSize}
      ref={canvasRef}
    />
  );
};

//

export const Storyboard3DRendererComponent = ({
  panel,
}) => {
  /* useEffect(() => {
    const keydown = e => {
      if (!e.repeat) {
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
  }, [panel]); */

  return (
    <div className={styles.storyboard3DRenderer}>
      <div className={styles.header}>
        <div className={styles.text}>Status: Compiled</div>
        <button className={styles.button} onClick={async e => {
          await panel.compile();
        }}>Recompile</button>
      </div>
      <Panel3DCanvas
        panel={panel}
      />
      <div className={styles.layers}>
        {layer1Specs.map(({name, type}) => {
          return (
            <div
              className={styles.layer}
              key={name}
            >{name}</div>
          );
        })}
      </div>
    </div>
  );
};