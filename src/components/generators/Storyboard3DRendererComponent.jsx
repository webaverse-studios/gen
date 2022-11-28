import {useState, useRef, useEffect} from 'react';
import classnames from 'classnames';

import {
  panelSize,
  tools,
  layer1Specs,
  layer2Specs,
} from '../../generators/scene-generator.js';
import styles from '../../../styles/Storyboard3DRenderer.module.css';

//

import {promptKey} from '../../generators/scene-generator.js';

//

const Panel3DCanvas = ({
  panel,
}) => {
  const canvasRef = useRef();

  // track canvas
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
  const _getPrompt = () => panel.getData(promptKey) ?? '';
  const [prompt, setPrompt] = useState(_getPrompt);
  const [layer, setLayer] = useState(null);

  useEffect(() => {
    const onupdate = e => {
      setPrompt(_getPrompt());
    };
    panel.addEventListener('update', onupdate);

    setPrompt(_getPrompt());

    return () => {
      panel.removeEventListener('update', onupdate);
    };
  }, [panel]);

  const layersArray = panel.getDataLayersMatchingSpecs([layer1Specs, layer2Specs]);

  return (
    <div className={styles.storyboard3DRenderer}>
      <div className={styles.header}>
        <input type='text' className={styles.input} value={prompt} placeholder='prompt' onChange={e => {
          setPrompt(e.target.value);
          panel.setData(promptKey, e.target.value);
        }} />
        <div className={styles.text}>Status: Compiled</div>
        <button className={styles.button} onClick={async e => {
          await panel.compile();
        }}>Recompile</button>
      </div>
      <Panel3DCanvas
        panel={panel}
      />
      {layersArray.map((layers, layerIndex) => {
        if (layers) {
          return (
            <div
              className={styles.layers}
              key={layerIndex}
            >
              {layers.map(({key, type}) => {
                return (
                  <div
                    className={classnames(styles.layer, layer === key ? styles.selected : null)}
                    onClick={e => {
                      setLayer(layer !== key ? key : null);
                    }}
                    key={key}
                  >{key}</div>
                );
              })}
            </div>
          );
        } else {
          return null;
        }
      })}
    </div>
  );
};