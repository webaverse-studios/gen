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
};