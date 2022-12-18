import {useState, useEffect} from 'react';
import classnames from 'classnames';

import {PlaceholderImg} from '../placeholders/PlaceholderImg.jsx';
import {ArrayBufferRenderer} from '../renderers/ArrayBufferRenderer.jsx';
// import {zbencode, zbdecode} from '../../zine/encoding.js';
import {downloadFile} from '../../utils/http-utils.js';
import styles from '../../../styles/Storyboard.module.css';
import {
  zineMagicBytes,
} from '../../zine/zine-format.js';
import {
  mainImageKey,
} from '../../zine/zine-data-specs.js';
import { decompressBlob } from '#Lib'

//

const textDecoder = new TextDecoder();
const defaultFilename = 'storyboard.zine.gz';

//

const StoryboardPanel = ({
  storyboard,
  panel,
  selected,
  onClick,
}) => {
  const _getBusy = () => panel ? panel.isBusy() : false;
  const _getBusyMessage = () => panel ? panel.getBusyMessage() : '';
  const _getImage = () => panel.getLayer(0)?.getData(mainImageKey);
  const [busy, setBusy] = useState(_getBusy);
  const [busyMessage, setBusyMessage] = useState(_getBusyMessage);
  const [image, setImage] = useState(_getImage);

  // image handling
  useEffect(() => {
    if (panel) {
      const onbusyupdate = e => {
        setBusy(_getBusy());
        setBusyMessage(_getBusyMessage());
      };
      panel.addEventListener('busyupdate', onbusyupdate);
      const onupdate = e => {
        setImage(_getImage());
      };
      panel.addEventListener('update', onupdate);

      setBusy(_getBusy());
      setBusyMessage(_getBusyMessage());
      setImage(_getImage());

      return () => {
        panel.removeEventListener('busyupdate', onbusyupdate);
        panel.removeEventListener('update', onupdate);
      };
    }
  }, [panel, busy, image]);

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
      await panel.setFile(file);
    }
  };

  return (
    <div
      className={classnames(
        styles.panel,
        selected ? styles.selected : null,
        busy ? styles.busy : null,
      )}
      onClick={onClick}
      onDragOver={dragover}
      onDrop={drop}
    >
      {(() => {
        if (busy) {
          return (
            <PlaceholderImg className={classnames(styles.img, styles.icon)} />
          );
        } else {
          return null;
        }
      })()}
      {(() => {
        if (image) {
          return (
            <ArrayBufferRenderer srcObject={image} className={classnames(styles.img, styles.preview)} />
          );
        } else if (!busy) {
          return (
            <div className={styles.placeholder}>
              <img src='/images/missing-file.svg' className={classnames(styles.img, styles.icon)} />
            </div>
          );
        }
      })()}
    </div>  
  );
};

//

const StoryboardPanelPlaceholder = ({
  onClick,
}) => {
  return (
    <div className={classnames(styles.panel, styles.add)} onClick={onClick}>
      <img src="/images/plus.svg" className={classnames(styles.img, styles.icon)} />
    </div>
  );
}

//

export const StoryboardComponent = ({
  storyboard,
  panel,
  panels,
  onPanelSelect,
  onPanelsLoad,
}) => {
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
      const panel = await storyboard.addPanelFromFile(file);
      onPanelSelect(panel);
    }
  };

  return (
    <div
      className={styles.storyboard}
      onDragOver={dragover}
      onDrop={drop}
    >
      <div className={styles.buttons}>
        <button className={styles.button} onClick={e => {
          e.preventDefault();
          e.stopPropagation();

          const uint8Array = storyboard.export();
          // const firstBytes = uint8Array.slice(0, 4);
          // const firstBytesString = textDecoder.decode(firstBytes);
          // console.log('export decoded', {firstBytesString});
          const blob = new Blob([
            zineMagicBytes,
            uint8Array,
          ], {
            type: 'application/octet-stream',
          });
          downloadFile(blob, defaultFilename);
        }}>
          <img src='/images/download.svg' className={styles.img} />
        </button>
        <button className={styles.button}>
          <img src='/images/upload.svg' className={styles.img} />
          <input type="file" onChange={e => {
            const file = e.target.files[0];
            if (file) {
              (async () => {
                const arrayBuffer = await decompressBlob(file).arrayBuffer();
                // check magic bytes
                const firstBytes = new Uint8Array(arrayBuffer, 0, 4);
                const firstBytesString = textDecoder.decode(firstBytes);
                if (firstBytesString === zineMagicBytes) {
                  const uint8Array = new Uint8Array(arrayBuffer, 4);
                  onPanelsLoad(uint8Array);
                } else {
                  console.warn('got invalid file', {file, firstBytesString});
                }
              })();
            }
            e.target.value = null;
          }} />
        </button>
      </div>
      {panels.map((p, i) => {
        return (
          <StoryboardPanel
            storyboard={storyboard}
            panel={p}
            selected={p === panel}
            onClick={e => {
              onPanelSelect(p);
            }}
            key={p.zp.id}
          />
        );
      })}
      <StoryboardPanelPlaceholder
        onClick={e => {
          const panel = storyboard.addPanel();
          onPanelSelect(panel);
        }}
      />
    </div>
  )
};
