import {useEffect, useState, useRef} from 'react';
import * as THREE from 'three';
import {
  DropTarget,
} from '../drop-target/DropTarget.jsx';
import SMParse from '../../clients/sm-parse.js';

import styles from '../../../styles/StepGenerator.module.css';

//

const size = 1024;
// const width = 352;
// const height = 352;
// const blockSize = 32;
// const smallWidth = width / blockSize;
// const smallHeight = height / blockSize;

//

const audioAiHost = `https://ddc.webaverse.com/`;

//

// const vqaClient = new VQAClient();

//

const cancelEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};
const blob2dataUrl = async blob => {
  const fileReader = new FileReader();
  const promise = new Promise((accept, reject) => {
    fileReader.onload = e => {
      accept(e.target.result);
    };
    fileReader.onerror = reject;
  });
  fileReader.readAsDataURL(blob);
  return promise;
};

//

const testSmParse = async (mp3File) => {
  // const fileName = `EverythingGoesOn`;
  // const mp3File = `/sm/${fileName}.mp3`;

  const audioContext = new AudioContext();
  audioContext.resume();

  // load audio
  const u = URL.createObjectURL(mp3File);
  const audio = new Audio(u);
  audio.controls = true;
  await new Promise((accept, reject) => {
    audio.addEventListener('canplaythrough', () => {
      accept();
      cleanup();
    });
    audio.addEventListener('error', err => {
      reject(err);
      cleanup();
    });
    const cleanup = () => {
      URL.revokeObjectURL(u);
    };
  });
  audio.style.cssText = `\
    background: orange;
    pointer-events: none;
  `;
  document.body.appendChild(audio);
  console.log('got audio', audio);
  
  // create audio node and connect it
  const audioNode = audioContext.createMediaElementSource(audio);
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 0.3;
  audioNode.connect(gainNode)
    .connect(audioContext.destination);

  // load tick audio buffer from /sfx/tick.mp3
  const tickRes = await fetch('/sfx/tick.mp3');
  const tickArrayBuffer = await tickRes.arrayBuffer();
  const tickAudioBuffer = await audioContext.decodeAudioData(tickArrayBuffer);

  // load mp3
  const mp3FileRes = await fetch(mp3File);
  const mp3FileBlob = await mp3FileRes.blob();
  
  // load sm
  let sm;
  {
    const fd = new FormData();
    fd.append('audio_file', mp3FileBlob);
    const difficulties = [
      'Beginner',
      'Easy',
      'Medium',
      'Hard',
      'Challenge',
    ];
    const difficulty = difficulties[2];
    fd.append('diff_coarse', difficulty);

    const res = await fetch(`${audioAiHost}ddc`, {
      method: 'POST',
      body: fd,
    });
    const text = await res.text();
    sm = new SMParse(text);
    console.log('got sm', sm);
  }

  // render chart
  const [chart] = sm.charts;
  const {notes} = chart;
  const  {BPMS} = sm.raw;
  let [minBpm, maxBpm] = BPMS[0];
  minBpm = parseFloat(minBpm);
  maxBpm = parseFloat(maxBpm);

  const canvas = document.createElement('canvas');
  const width = 1024;
  const height = 1024;
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'blue';

  const seenSet = new Set();
  const _render = () => {
    ctx.clearRect(0, 0, width, height);

    let timeDiffS = audio.currentTime;
    timeDiffS += audioContext.outputLatency;
    const timeBeats = timeDiffS * (maxBpm / 60);
    const timeMeasures = timeBeats / 4;

    const numMeasures = notes.length;
    const noteWidth = 32;
    const noteHeight = 8;
    const measureHeight = 128;
    for (let i = 0; i < numMeasures; i++) {
      const measure = notes[i];
      const [id, subnotes] = measure;

      for (let j = 0; j < subnotes.length; j++) {
        const subnote = subnotes[j];
        const f = j / subnotes.length;

        const y = (i * measureHeight) - (timeMeasures * measureHeight) + (f * measureHeight);

        let hasNote = false;
        for (let x = 0; x < subnote.length; x++) {
          const v = subnote[x];
          if (v !== '0') {
            ctx.fillRect(x * noteWidth, y, noteWidth, noteHeight);
            hasNote = true;
          }
        }

        // play tick if there is a new note
        if (hasNote && y <= 0) {
          const key = `${i}:${j}`;
          if (!seenSet.has(key)) {
            seenSet.add(key);

            console.log('tick');

            const source = audioContext.createBufferSource();
            source.buffer = tickAudioBuffer;
            source.connect(audioContext.destination);
            source.start();
          }
        }
      }
    }
  };

  canvas.style.cssText = `\
    background: red;
  `;
  document.body.appendChild(canvas);

  // when audio starts playing, start animating
  canvas.addEventListener('click', e => {
    audio.play();

    const _recurse = () => {
      requestAnimationFrame(_recurse);

      _render();
    };
    requestAnimationFrame(_recurse);
  });

  // load audio features
  let audioFeatures;
  {
    const res = await fetch(`${audioAiHost}audioFeatures`, {
      method: 'POST',
      body: mp3FileBlob,
    });
    audioFeatures = await res.json();
    console.log('got audio features', audioFeatures);
  }
};

//

const StepRenderer = ({
  file,
}) => {
  const canvasRef = useRef();
  
  // prevent wheel event
  useEffect(() => {
    const canvas = canvasRef.current;
    if (file && canvas) {

      return () => {
        for (const cancelFn of cancelFns) {
          cancelFn();
        }
      };
    }
  }, [file, canvasRef.current]);

  return <canvas
    width={size}
    height={size}
    ref={canvasRef}
    className={styles.canvas}
  />;
};

//

// const defaultPrompt = 'anime style, girl character, 3d model vrchat avatar orthographic front view, dress';
const StepGeneratorComponent = () => {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState([]);
  
  const addFiles = fs => {
    const newFiles = files.concat(fs);
    setFiles(newFiles);
  };

  // console.log('got files', files.length);

  return (
    <div className={styles.stepGenerator}>
      {files.length === 0 ? (
        <div className={styles.wrap}>
          <div className={styles.row}>
            <input type='text' className={styles.input} placeholder='Youtube URL...' />
            <div className={styles.button} onClick={e => {
              let u;
              try {
                u = new URL('https://www.youtube.com/watch?v=QH2-TGUlwu4');
              } catch(err) {
                console.warn(err);
                return;
              }

              console.log('load from youtube', u);
            }}>Load Audio</div>
          </div>
          <DropTarget
            className={styles.panelPlaceholder}
            onFilesAdd={addFiles}
          />
        </div>
      ) : (
        <StepRenderer
          file={files[0]}
        />
      )
    }
    </div>
  )
};
export default StepGeneratorComponent;