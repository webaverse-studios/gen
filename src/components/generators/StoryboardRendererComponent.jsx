import {useState, useEffect} from 'react';
// import {useRef} from 'react';

import {StoryboardGeneratorComponent} from  './StoryboardGeneratorComponent.jsx';
import {Storyboard2DRendererComponent} from  './Storyboard2DRendererComponent.jsx';
import {Storyboard3DRendererComponent} from  './Storyboard3DRendererComponent.jsx';
// import {BlobRenderer} from '../renderers/BlobRenderer.jsx';
import {ArrayBufferRenderer} from '../renderers/ArrayBufferRenderer.jsx';

import {mainImageKey} from '../../generators/scene-generator.js';

import styles from '../../../styles/StoryboardRenderer.module.css';

//

const StoryboardLayerComponent = ({
  storyboard,
  panel,
}) => {
  const _getImage = () => panel.getData(mainImageKey);
  const [image, setImage] = useState(_getImage);

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
    <div className={styles.layer}>
      <ArrayBufferRenderer srcObject={image} className={styles.img} />
    </div>
  );
};

//


const StoryboardPlaceholderComponent = ({
  storyboard,
  onPanelSelect,
}) => {
  // drag and drop
  const dragover = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  const drop = async e => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    const file = files[0];
    if (file) {
      const panel = storyboard.addPanelFromFile(file);
      onPanelSelect(panel);
    }
  };

  return (
    <div
      className={styles.panelPlaceholder}
      onDragOver={dragover}
      onDrop={drop}
    >
      <div><a onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        const panel = storyboard.addPanel();
        onPanelSelect(panel);
      }}><b>Create New Panel</b></a></div>
      <div>or, <a className={styles.fileUpload}><input type="file" onChange={e => {
        const file = e.target.files[0];
        if (file) {
          (async () => {
            const panel = await storyboard.addPanelFromFile(file);
            onPanelSelect(panel);
          })();
        }
        e.target.value = null;
      }} />Upload File</a></div>
      <div>or, <i>Drag and Drop</i></div>
    </div>
    );
}

//

export const StoryboardRendererComponent = ({
  storyboard,
  panel,
  layer,
  onPanelSelect = () => {},
}) => {
  const _getEmpty = () => panel ? panel.isEmpty() : true;
  const _getDimension = () => panel ? panel.getDimension() : 2;

  const [busy, setBusy] = useState(panel ? panel.isBusy() : false);
  const [busyMessage, setBusyMessage] = useState(panel ? panel.getBusyMessage() : '');
  const [empty, setEmpty] = useState(_getEmpty);
  const [dimension, setDimension] = useState(_getDimension);

  // busy tracking
  useEffect(() => {
    if (panel) {
      const onbusyupdate = e => {
        setBusy(panel.isBusy());
        setBusyMessage(panel.getBusyMessage());
        setDimension(panel.getDimension());
      };
      panel.addEventListener('busyupdate', onbusyupdate);

      setBusy(panel.isBusy());
      setBusyMessage(panel.getBusyMessage());
      setDimension(panel.getDimension());

      return () => {
        panel.removeEventListener('busyupdate', onbusyupdate);
      };
    }
  }, [panel, busy]);

  // empty tracking
  useEffect(() => {
    if (panel) {
      const onupdate = e => {
        setEmpty(_getEmpty());
      };
      panel.addEventListener('update', onupdate);
      
      setEmpty(_getEmpty());

      return () => {
        panel.removeEventListener('update', onupdate);
      };
    }
  }, [panel]);

  return (
    <div className={styles.storyboardRenderer}>
      {(() => {
        if (busy) {
          return <div className={styles.busy}>{busyMessage}</div>
        } else {
          if (panel) {
            if (empty) {
              return <StoryboardGeneratorComponent
                storyboard={storyboard}
                panel={panel}
              />
            } else {
              if (layer) {
                return <StoryboardLayerComponent
                  storyboard={storyboard}  
                  panel={panel}
                  layer={layer}
                />
              } else {
                if (dimension === 2) {
                  return <Storyboard2DRendererComponent
                    storyboard={storyboard}  
                    panel={panel}
                  />
                } else if (dimension === 3) {
                  return <Storyboard3DRendererComponent
                    storyboard={storyboard}  
                    panel={panel}
                  />
                } else {
                  throw new Error('invalid dimension: ' + dimension);
                }
              }
            }
          } else {
            return <StoryboardPlaceholderComponent
              storyboard={storyboard}
              onPanelSelect={onPanelSelect}
            />
          }
        }
      })()}      
    </div>
  )
};