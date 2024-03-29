import {useState, useEffect} from 'react';
// import {useRef} from 'react';

import {StoryboardGeneratorComponent} from  './StoryboardGeneratorComponent.jsx';
import {Storyboard2DRendererComponent} from  './Storyboard2DRendererComponent.jsx';
import {Storyboard3DRendererComponent} from  './Storyboard3DRendererComponent.jsx';
// import {BlobRenderer} from '../renderers/BlobRenderer.jsx';
import {ArrayBufferRenderer} from '../renderers/ArrayBufferRenderer.jsx';
import {DropTarget} from '../drop-target/DropTarget.jsx';

import {
  mainImageKey,
} from '../../zine/zine-data-specs.js';

import styles from '../../../styles/StoryboardRenderer.module.css';
import {SceneGallery} from '../image-gallery/SceneGallery.jsx';

//

const StoryboardLayerComponent = ({
  storyboard,
  panel,
}) => {
  const _getImage = () => panel?.getLayer(0)?.getData(mainImageKey);
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

const cancelEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};
const StoryboardPlaceholderComponent = ({
  storyboard,
  onPanelSelect,
}) => {
  const [selecting, setSelecting] = useState(false);

  const onNew = e => {
    cancelEvent(e);

    const panel = storyboard.addPanel();
    onPanelSelect(panel);
  };
  const onSelect = e => {
    cancelEvent(e);

    setSelecting(true);
  };
  const addFiles = newFiles => {
    // const allFiles = files.concat(newFiles);
    // setFiles(allFiles);

    const file = newFiles[0];
    if (file) {
      const panel = storyboard.addPanelFromFile(file);
      onPanelSelect(panel);
    }
  };
  // const drop = async e => {
  //   const files = e.dataTransfer.files;
  //   const file = files[0];
  //   if (file) {
  //     const panel = storyboard.addPanelFromFile(file);
  //     onPanelSelect(panel);
  //   }
  // };

  return selecting ? (
    <SceneGallery onImageClick={async u => {
      const res = await fetch(u);
      const file = await res.blob();
      console.log('load file', file);
      const panel = storyboard.addPanelFromFile(file);
      onPanelSelect(panel);
    }}>
    </SceneGallery>
  ) : (
    <DropTarget
      className={styles.panelPlaceholder}
      newLabel='Create New Panel'
      selectLabel='Select Scene'
      onFilesAdd={addFiles}
      onNew={onNew}
      onSelect={onSelect}
    />
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

  // panel tracking
  useEffect(() => {
    if (panel) {
      const onbusyupdate = e => {
        setBusy(panel.isBusy());
        setBusyMessage(panel.getBusyMessage());
      };
      panel.addEventListener('busyupdate', onbusyupdate);
      const onupdate = e => {
        setEmpty(_getEmpty());
        setDimension(panel.getDimension());
      };
      panel.addEventListener('layerupdate', onupdate);

      setEmpty(_getEmpty());
      setBusy(panel.isBusy());
      setBusyMessage(panel.getBusyMessage());
      setDimension(panel.getDimension());

      return () => {
        panel.removeEventListener('busyupdate', onbusyupdate);
        panel.removeEventListener('layerupdate', onupdate);
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
              // if (layer) {
              //   return <StoryboardLayerComponent
              //     storyboard={storyboard}  
              //     panel={panel}
              //     layer={layer}
              //   />
              // } else {
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
              // }
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