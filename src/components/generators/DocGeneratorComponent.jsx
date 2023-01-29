import {useEffect, useState, useRef} from 'react';
import * as THREE from 'three';
import classnames from 'classnames';
import {
  DropTarget,
} from '../drop-target/DropTarget.jsx';
import {
  downloadFile,
} from '../../utils/http-utils.js'

import styles from '../../../styles/DocGenerator.module.css';

//

const docAiHost = `https://ddc.webaverse.com/`;

//

const size = 1024;
const DocRenderer = ({
  file,
}) => {
  const [ocrJson, setOcrJson] = useState(null);
  const canvasRef = useRef();
  const overlayRef = useRef();

  // ocr json
  useEffect(() => {
    if (file && !ocrJson && !file.ocrJsonLoaded) {
      file.ocrJsonLoaded = true;

      (async () => {
        const res = await fetch(`${docAiHost}ocr`, {
          method: 'POST',
          body: file,
        });
        const ocrJson = await res.json();
        console.log('got ocr json', ocrJson);
        setOcrJson(ocrJson);
      })();
    }
  }, [file, ocrJson]);

  // render
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlayEl = overlayRef.current;
    if (file && canvas && overlayEl && ocrJson && !canvas.loaded) {
      canvas.loaded = true;

      (async () => {

        // load image
        const image = new Image();
        await new Promise((accept, reject) => {
          image.onload = () => {
            accept();
            cleanup();
          };
          image.onerror = err => {
            reject(err);
            cleanup();
          };
  
          const u = URL.createObjectURL(file);
          image.src = u;
          
          const cleanup = () => {
            URL.revokeObjectURL(u);
          };
        });

        // draw image
        const ctx = canvas.getContext('2d');
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);

        // draw ocr
        const canvasRect = canvas.getBoundingClientRect();
        const canvasRectWidth = canvasRect.width;
        const screenRectHeight = canvasRect.height;

        const overlayRect = overlayEl.getBoundingClientRect();

        for (const entry of ocrJson) {
          const [bbox, label, score] = entry;
          const [
            [x0, y0],
            [x1, y1],
            [x2, y2],
            [x3, y3],
          ] = bbox;

          const w = x2 - x0;
          const h = y2 - y0;

          const ax = x0 / image.width * canvasRectWidth;
          const ay = y0 / image.height * screenRectHeight;
          const ah = h / image.height * screenRectHeight;

          console.log('set class', styles.ocrText);

          const div = document.createElement('div');
          div.className = styles.ocrText;
          div.innerText = label;
          div.style.left = `${ax}px`;
          div.style.top = `${ay}px`;
          div.style.height = `${ah}px`;
          div.style.fontSize = `${ah * 0.8}px`;
          overlayEl.appendChild(div);

          globalThis.overlayEl = overlayEl;
        }
      })();
    }
  }, [file, ocrJson, canvasRef.current]);

  return (
    <div className={styles.docRenderer}>
      <div className={styles.row}>
        <div className={styles.button} onClick={e =>{
          downloadFile(file, 'image.png');
        }}>Download Image</div>
      </div>
      <div className={styles.overlayWrap}>
        <div className={styles.overlayInner} ref={overlayRef} />
        <canvas
          className={classnames(
            styles.canvas,
          )}
          ref={canvasRef}
        />
      </div>
    </div>
  );
};

//

// const defaultPrompt = 'anime style, girl character, 3d model vrchat avatar orthographic front view, dress';
const DocGeneratorComponent = () => {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [files, setFiles] = useState([]);
  
  const addFiles = fs => {
    const newFiles = files.concat(fs);
    setFiles(newFiles);
  };

  return (
    <div className={styles.docGenerator}>
      {!loading ? (
        files.length === 0 ?
          (
            <div className={styles.wrap}>
              <div className={styles.row}>
                <input type='text' className={styles.input} value={url} onChange={e => {
                  setUrl(e.target.value);
                }} placeholder='Image URL...' />
                <div className={styles.button} onClick={async e => {
                  try {
                    setLoading(true);

                    const res = await fetch(url);
                    const b = await res.blob();
                    console.log('loaded image blob', b);
                    addFiles([b]);
                  } finally {
                    setLoading(false);
                  }
                }}>Load Image</div>
              </div>
              <DropTarget
                className={styles.panelPlaceholder}
                onFilesAdd={addFiles}
              />
            </div>
          ) : (
            <DocRenderer
              file={files[0]}
            />
          )
      ) : (
        <div className={styles.header}>
          loading...
        </div>
      )}
    </div>
  );
};
export default DocGeneratorComponent;