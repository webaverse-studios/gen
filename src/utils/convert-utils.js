export function blob2img(blob) {
  const img = new Image();
  const u = URL.createObjectURL(blob);
  const promise = new Promise((accept, reject) => {
    function cleanup() {
      URL.revokeObjectURL(u);
    }
    img.onload = () => {
      accept(img);
      cleanup();
    };
    img.onerror = err => {
      reject(err);
      cleanup();
    };
  });
  img.crossOrigin = 'Anonymous';
  img.src = u;
  img.blob = blob;
  return promise;
}

export function canvas2blob(canvas) {
  return new Promise((accept, reject) => {
    canvas.toBlob(accept, 'image/png');
  });
}