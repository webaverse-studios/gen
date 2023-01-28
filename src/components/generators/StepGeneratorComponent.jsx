import {useEffect, useState, useRef} from 'react';
import * as THREE from 'three';
import classnames from 'classnames';
import {
  DropTarget,
} from '../drop-target/DropTarget.jsx';
import SMParse from '../../clients/sm-parse.js';
import {
  downloadFile,
} from '../../utils/http-utils.js'

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

/* const cancelEvent = e => {
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
}; */

//

const StepRenderer = ({
  file,
}) => {
  const [srcUrl, setSrcUrl] = useState('');

  const [sm, setSm] = useState('');
  const [audioFeatures, setAudioFeatures] = useState(null);

  const [audioContext, setAudioContext] = useState(() => {
    const audioContext = new AudioContext();
    // audioContext.resume();
    return audioContext;
  });
  const [tickAudioBuffer, setTickAudioBuffer] = useState(null);

  const audioRef = useRef();
  const canvasRef = useRef();

  // url
  useEffect(() => {
    if (file) {
      const newSrcUrl = URL.createObjectURL(file);
      setSrcUrl(newSrcUrl);

      return () => {
        URL.revokeObjectURL(newSrcUrl);
      };
    }
  }, [file]);

  // loading
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && ! audio.smLoaded) {
      audio.smLoaded = true;

      (async () => {
        console.log('loading step chart...');
        
        const fd = new FormData();
        fd.append('audio_file', file);
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
        const sm = new SMParse(text);
        setSm(sm);

        console.log('got step chart', sm);
      })();
    }
  }, [audioRef]);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && ! audio.audioFeaturesLoaded) {
      audio.audioFeaturesLoaded = true;

      (async () => {
        console.log('loading audio features...')
        const res = await fetch(`${audioAiHost}audioFeatures`, {
          method: 'POST',
          body: file,
        });
        const audioFeatures = await res.json();
        console.log('got audio features', audioFeatures);
        setAudioFeatures(audioFeatures);
      })();
    }
  }, [audioRef]);

  // audio context
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !audio.tickAudioBufferLoaded) {
      audio.tickAudioBufferLoaded = true;

      (async() => {
        const tickRes = await fetch('/sfx/tick.mp3');
        const tickArrayBuffer = await tickRes.arrayBuffer();
        const tickAudioBuffer = await audioContext.decodeAudioData(tickArrayBuffer);
        setTickAudioBuffer(tickAudioBuffer);
      })();
    }
  }, [audioContext, audioRef.current]);

  // render
  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (file && srcUrl && tickAudioBuffer && sm && audio && canvas && !audio.loaded) {
      audio.loaded = true;

      (async () => {
        // create audio node and connect it
        const audioNode = audioContext.createMediaElementSource(audio);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.3;
        audioNode.connect(gainNode)
          .connect(audioContext.destination);

        // render chart
        const [chart] = sm.charts;
        const {notes} = chart;
        const  {BPMS} = sm.raw;
        let [minBpm, maxBpm] = BPMS[0];
        minBpm = parseFloat(minBpm);
        maxBpm = parseFloat(maxBpm);

        const width = size;
        const height = size;
        
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

                  // console.log('tick');

                  const source = audioContext.createBufferSource();
                  source.buffer = tickAudioBuffer;
                  source.connect(audioContext.destination);
                  source.start();
                }
              }
            }
          }
        };
        let frame;
        const _recurse = () => {
          frame = requestAnimationFrame(_recurse);
    
          _render();
        };
        frame = requestAnimationFrame(_recurse);

        return () => {
          cancelAnimationFrame(frame);
        };
      })();
    }
  }, [file, srcUrl, tickAudioBuffer, sm, audioRef.current, canvasRef.current]);

  return (
    <div className={styles.stepRenderer}>
      <div className={styles.row}>
        <audio
          className={styles.audio}
          src={srcUrl}
          controls
          ref={audioRef}
        />
        <div className={styles.button} onClick={e =>{
          downloadFile(file, 'audio.mp3');
        }}>Download MP3</div>
      </div>
      <canvas
        width={size}
        height={size}
        className={classnames(
          styles.canvas,
          sm ? null : styles.hidden,
        )}
        ref={canvasRef}
      />
      {sm ? null : <div>loading step chart...</div>}
      {audioFeatures ? (
        <div className={styles.audioFeatures}>
          <div>Audio features</div>
          <div className={styles.data}>
            {JSON.stringify(audioFeatures, null, 2)}
          </div>
        </div>
      ) : <div>loading audio features...</div>}
    </div>
  );
};

//

// const defaultPrompt = 'anime style, girl character, 3d model vrchat avatar orthographic front view, dress';
const StepGeneratorComponent = () => {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [files, setFiles] = useState([]);
  
  const addFiles = fs => {
    const newFiles = files.concat(fs);
    setFiles(newFiles);
  };

  return (
    <div className={styles.stepGenerator}>
      {!loading ? (
        files.length === 0 ?
          (
            <div className={styles.wrap}>
              <div className={styles.row}>
                <input type='text' className={styles.input} value={url} onChange={e => {
                  setUrl(e.target.value);
                }} placeholder='Youtube URL...' />
                <div className={styles.button} onClick={async e => {
                  try {
                    setLoading(true);

                    const u2 = new URL(url);
                    // remove al lquery params except 'v'
                    const oldV = u2.searchParams.get('v');
                    u2.search = '';
                    u2.searchParams.set('v', oldV);

                    
                    const u = new URL('/api/youtube/', location.href);
                    u.searchParams.set('url', u2.href);
                    u.searchParams.set('type', 'audio');

                    // console.log('load from youtube', u);

                    const res = await fetch(u);
                    const b = await res.blob();
                    // console.log('loaded blob', b);
                    addFiles([b]);
                  } finally {
                    setLoading(false);
                  }
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
      ) : (
        <div className={styles.header}>
          loading...
        </div>
      )}
    </div>
  );
};
export default StepGeneratorComponent;