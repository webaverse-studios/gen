import {createCanvas, loadImage} from 'canvas';

const CanvasImage = async (req, res) => {
  console.log('canvas 0');
  // process.env.LD_LIBRARY_PATH = `/var/task/node_modules/canvas/build/Release/:${process.env.LD_LIBRARY_PATH}`;
  try {
    const {createCanvas, loadImage} = await import('canvas');
    console.log('canvas 1');
    const size = 256;
    const canvas = createCanvas(size, size);
    console.log('canvas 2');
    const ctx = canvas.getContext('2d');
    console.log('canvas 3');
    ctx.fillStyle = '#F00';
    ctx.fillRect(0, 0, size, size);
    res.setHeader('Content-Type', 'image/png');
    canvas.createPNGStream().pipe(res);
    console.log('canvas 4');
    /* const props = await ItemImage.getInitialProps({req});
    if (props) {
      const {
        imgUrl,
      } = props;
      res.redirect(imgUrl);
    } else {
      res.send(404);
    } */
  } catch(err) {
    console.warn(err);
    res.send(err.stack)
  }
};
export default CanvasImage;