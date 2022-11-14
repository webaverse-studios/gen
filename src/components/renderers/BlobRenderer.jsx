import {useState, useEffect, useRef} from 'react';

//

export const BlobRenderer = ({
  srcObject,
  className,
}) => {
  const [imageBitmap, setImageBitmap] = useState(null);

  const canvasRef = useRef();

  useEffect(() => {
    if (srcObject) {
      let live = true;
      (async () => {
        // const blob = await srcObject.blob();
        const blob = srcObject;
        if (!live) return;
        const imageBitmap = await createImageBitmap(blob);
        if (!live) return;
        setImageBitmap(imageBitmap);

        const canvas = canvasRef.current;
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0);
      })();
      return () => {
        live = false;
      };
    } else {
      setImageBitmap(null);
    }
  }, [srcObject]);

  return (
    <canvas className={className} ref={canvasRef} />
  );

  /* const _getImage = () => panel.getData('image');
  const [image, setImage] = useState(_getImage);

  useEffect(() => {
    const onupdate = e => {
      setImage(_getImage());
    };
    panel.addEventListener('update', onupdate);

    setImage(_getImage());

    return () => {
      panel.removeEventListener('update', onupdate);
    };
  }, [panel]);

  return (
    <div className={styles.storyboard2DRenderer}>
      <div className={styles.header}>
        <div className={styles.text}>Status: Not compiled</div>
        <button className={styles.button} onClick={async e => {
          await panel.compile();
        }}>Compile</button>
      </div>
      <img src={image} className={styles.img} />
    </div>
  ); */
};