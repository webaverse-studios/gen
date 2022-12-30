import classnames from 'classnames';

//

import styles from '../../../styles/DropTarget.module.css';

//

export const DropTarget = ({
  className,
  newLabel,
  onNew,
  onDragOver,
  onDrop,
}) => {
  // function onDrop(e) {
  //   e.preventDefault();
  //   e.stopPropagation();
  //   const files = e.dataTransfer.files;
  //   const file = files[0];
  //   if (file) {
  //     const panel = storyboard.addPanelFromFile(file);
  //     onPanelSelect(panel);
  //   }
  // }
  return (
    <div
      className={classnames(className, styles.dropTarget)}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div><a onClick={onNew}><b>{newLabel}</b></a></div>
      <div>or, <a className={styles.fileUpload}><input type="file" onChange={e => {
        const fakeDropEvent = {
          preventDefault: () => {},
          stopPropagation: () => {},
          dataTransfer: {
            files: e.target.files,
          },
        }
        onDrop(fakeDropEvent);
        e.target.value = null;
      }} />Upload File</a></div>
      <div>or, <i>Drag and Drop</i></div>
    </div>
  );
};