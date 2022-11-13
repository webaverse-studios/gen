import {useState, useEffect} from 'react';
import classnames from 'classnames';

import {PlaceholderImg} from '../placeholders/PlaceholderImg.jsx';
import styles from '../../../styles/Storyboard.module.css';

//

const StoryboardPanel = ({
  storyboard,
  panel,
  selected,
  onClick,
}) => {
  const [busy, setBusy] = useState(panel ? panel.isBusy() : false);
  // const [busyMessage, setBusyMessage] = useState(panel ? panel.getBusyMessage() : false);

  useEffect(() => {
    if (panel) {
      const onbusyupdate = e => {
        setBusy(e.data.busy);
      };
      panel.addEventListener('busyupdate', onbusyupdate);

      return () => {
        panel.removeEventListener('busyupdate', onbusyupdate);
      };
    }
  }, [panel, busy]);

  return (
    <div
      className={classnames(styles.panel, selected ? styles.selected : null)}
      onClick={onClick}
    >
      {(() => {
        if (busy) {
          return (
            <PlaceholderImg className={styles.img} />
          );
        } else if (panel.renders.image) {
          return (
            <img src={panel.renders.image} className={styles.img} />
          );
        } else {
          return (
            <div className={styles.placeholder}>
              <img className={styles.img} src='/images/missing-file.svg' />
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
      <img src="/images/plus.svg" className={styles.img} />
    </div>
  );
}

//

export const StoryboardComponent = ({
  storyboard,
  panel,
  panels,
  onPanelSelect,
}) => {
  useEffect(() => {
    const dragover = e => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('dragover', dragover);
    const drop = async e => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      const file = files[0];
      if (file) {
        await storyboard.addPanelFromFile(file);
      }
    };
    document.addEventListener('drop', drop);

    return () => {
      document.removeEventListener('dragover', dragover);
      document.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className={styles.storyboard}>
      {panels.map((p, i) => (
        <StoryboardPanel
          storyboard={storyboard}
          panel={p}
          selected={p === panel}
          onClick={e => {
            onPanelSelect(p);
          }}
          key={i}
        />
      ))}
      <StoryboardPanelPlaceholder
        onClick={e => {
          const panel = storyboard.addPanel();
          onPanelSelect(panel);
        }}
      />
    </div>
  )
};