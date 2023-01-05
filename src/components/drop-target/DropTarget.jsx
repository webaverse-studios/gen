// import {useState} from 'react';
import classnames from 'classnames';

import styles from '../../../styles/DropTarget.module.css';

//

const makeFilesEvent = files => ({
  preventDefault: () => {},
  stopPropagation: () => {},
  dataTransfer: {
    files,
  },
});
const cancelEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};
const nop = () => {};
export const DropTarget = ({
  className = null,
  newLabel = '',
  files = [],
  onFilesChange = nop,
  onNew = null,
  onDrop = nop,
  onSubmit = nop,
  multiple = false,
}) => {
  return (
    <div
      className={classnames(className, styles.dropTarget)}
      onDragOver={cancelEvent}
      onDrop={e => {
        cancelEvent(e);

        const newFiles = files.concat(Array.from(e.dataTransfer.files));
        onFilesChange(newFiles);

        const fakeDropEvent = makeFilesEvent(e.dataTransfer.files);
        onDrop(fakeDropEvent);
      }}
    >
      {files.length === 0 ?
        <div className={styles.dropTargetPlaceholder}>
          {onNew ?
            <div><a onClick={onNew}><b>{newLabel}</b></a></div>
          : null}
          <div>
            {onNew ? 'or, ' : null}
            <a className={styles.fileUpload}>
              <input
                type="file"
                onChange={e => {
                  const newFiles = files.concat(Array.from(e.target.files));
                  onFilesChange(newFiles);

                  const fakeDropEvent = makeFilesEvent(e.target.files);
                  onDrop(fakeDropEvent);

                  e.target.value = null;
                }}
                multiple={multiple}
              />
              Select file{multiple ? 's' : null}
            </a>
          </div>
          <div>or, <i>Drag and Drop</i></div>
        </div>
      :
        <div className={styles.files}>
          <div className={styles.filesHeader}>Files ({files.length}):</div>
          {files.map((file, i) => {
            return (
              <div className={styles.file} key={i}>
                <div className={styles.fileName}>{file.name}</div>
                <a className={styles.closeX} onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();

                  const newFiles = files.slice();
                  newFiles.splice(i, 1);
                  onFilesChange(newFiles);
                }}>x</a>
              </div>
            );
          })}
          {/* <input
            type='button'
            value='Submit'
            className={styles.submitButton}
            onClick={e => {
              const fakeSubmitEvent = makeFilesEvent(files);
              onSubmit(fakeSubmitEvent);
            }}
          /> */}
        </div>
      }
    </div>
  );
};