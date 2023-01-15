import {useEffect} from 'react';
import classnames from 'classnames';

import styles from '../../../styles/DropTarget.module.css';

//

/* const makeFilesEvent = files => ({
  preventDefault: () => {},
  stopPropagation: () => {},
  dataTransfer: {
    files,
  },
}); */
const cancelEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};
const nop = () => {};
export const DropTarget = ({
  className = null,
  newLabel = '',
  // files = [],
  onFilesAdd = nop,
  onNew = null,
  // onDrop = nop,
  // onSubmit = nop,
  multiple = false,
}) => {
  useEffect(() => {
    const dragover = e => {
      cancelEvent(e);
    };
    document.addEventListener('dragover', dragover);
    const drop = e => {
      cancelEvent(e);

      const newFiles = Array.from(e.dataTransfer.files);
      onFilesAdd(newFiles);
    };
    document.addEventListener('drop', drop);

    return () => {
      document.removeEventListener('dragover', dragover);
      document.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div
      className={classnames(className, styles.dropTarget)}
      onDragOver={cancelEvent}
      onDrop={e => {
        cancelEvent(e);

        const newFiles = Array.from(e.dataTransfer.files);
        onFilesAdd(newFiles);

        // const fakeDropEvent = makeFilesEvent(e.dataTransfer.files);
        // onDrop(fakeDropEvent);
      }}
    >
      {onNew ?
        <div><a onClick={onNew}><b>{newLabel}</b></a></div>
      : null}
      <div>
        {onNew ? 'or, ' : null}
        <a className={styles.fileUpload}>
          <input
            type="file"
            onChange={e => {
              const newFiles = Array.from(e.target.files);
              onFilesAdd(newFiles);

              // const fakeDropEvent = makeFilesEvent(e.target.files);
              // onDrop(fakeDropEvent);

              e.target.value = null;
            }}
            multiple={multiple}
          />
          Select file{multiple ? 's' : null}
        </a>
      </div>
      <div>or, <i>Drag and Drop</i></div>
    </div>
  );
};