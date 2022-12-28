import {useState, useRef, useEffect} from 'react';
import classnames from 'classnames';

import {
  PanelRenderer,
  panelSize,
  tools,
} from '../../generators/scene-generator.js';

import styles from '../../../styles/Storyboard3DRenderer.module.css';

//

import {
  promptKey,
  layer1Specs,
  layer2Specs,
} from '../../zine/zine-data-specs.js';

//

const Panel3DCanvas = ({
  panel,
}) => {
  const canvasRef = useRef();
  
  useEffect(() => {
    const canvas = canvasRef.current;
    const dimension = panel ? panel.getDimension() : 2;
    if (canvas && dimension === 3) {
      const renderer = new PanelRenderer(canvas, panel);

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
  const _getPrompt = () => panel.getLayer(0)?.getData(promptKey) ?? '';
  const [prompt, setPrompt] = useState(_getPrompt);
  const [layer, setLayer] = useState(null);

  useEffect(() => {
    // console.log('Storyboard3DRendererComponent panel', panel);
    if (panel) {
      const onupdate = e => {
        setPrompt(_getPrompt());
      };
      panel.addEventListener('update', onupdate);

      setPrompt(_getPrompt());

      return () => {
        panel.removeEventListener('update', onupdate);
      };
    }
  }, [panel]);

  const layersArray = []; // panel.getDataLayersMatchingSpecs([layer1Specs, layer2Specs]);
  const layer1 = panel.getLayer(1);
  if (layer1 && layer1.matchesSpecs(layer1Specs)) {
    layersArray.push(layer1);
  }
  const layer2 = panel.getLayer(2);
  if (layer2 && layer2.matchesSpecs(layer2Specs)) {
    layersArray.push(layer2);
  }
  // const layersArray = panel.getLayers();
  // console.log('got layers', layersArray);

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
        <button className={styles.button} onClick={async e => {
          await panel.collectData();
        }
        }>Submit Scale</button>
      </div>
      <Panel3DCanvas
        panel={panel}
      />
      {layersArray.map((layers, layerIndex) => {
        const attributeNames = layers.getKeys();
        return (
          <div
            className={styles.layers}
            key={layerIndex}
          >
            {attributeNames.map(key => {
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
      })}
    </div>
  );
};