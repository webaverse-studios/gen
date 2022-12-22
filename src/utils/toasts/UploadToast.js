import { _1MB } from '../../../constants/data.js';

import {
  backgroundColor,
  failColor,
  successColor,
  toastDuration
} from './constants.js';

import { Toast } from './Toast.js';


const
  /**
   * Notify the user and remove the toast if the download fails.
   */
  handleError = (ctx, e) => {
    // Notify the user.
    ctx.toast.textContent =
      `Upload failed for ${ctx.name}: ${e.message}`;

    // Change bg color and remove after a delay.
    ctx.toast.style.background = failColor;
    setTimeout(() => ctx.remove(), toastDuration);
  };

/**
 * A toast which tracks the progress of a streamed download.
 */
export class UploadToast extends Toast {
  currentSize = 0;
  name = '';
  loaded = 0;

  pipe = createPipe( this )
  size;
  
  /**
   * Create a new download toast.
   * @param {string} name The stream's name.
   * @param {number} [size] The stream's total size.
   */
  constructor( name = '', size) {
    super();

    // Set name and size.
    this.name = name;
    if (size) this.size = (size / _1MB).toFixed(2);

    // Set initial text.
    this.toast.textContent = `Uploading ${this.name}... (0MB)`;
  }
}


const createPipe = ctx => {
  return new TransformStream({
    /**
     * Update the toast as the download progresses.
     * @param {Uint8Array} chunk The chunk of data.
     * @param {TransformStreamDefaultController} controller The controller.
     */
    transform: (chunk, controller) => {
      // TransformStream.transform doesn't catch errors by default.
      try {
        // Update metrics.
        ctx.loaded += chunk.length;
        ctx.currentSize = (ctx.loaded / _1MB ).toFixed(2);

        // Show current progress.
        if ( ctx.size || ctx.size === 0 )  {
          ctx.toast.textContent =
            `Uploading ${ctx.name}... ` +
            `(${ctx.currentSize}/${ctx.size} MB)`;

          // Update progress bar.
          ctx.toast.style.background =
            `linear-gradient(to right, ` +
            `${successColor} ${ctx.currentSize / ctx.size * 100}%, ` +
            `${backgroundColor} ${ctx.currentSize / ctx.size * 100}%)`;
        } else {
          ctx.toast.textContent =
            `Uploading ${ctx.name}... (${ctx.currentSize} MB)`;
        }
        
        // Continue.
        controller.enqueue(chunk);
      } catch (e) { handleError(ctx, e); }
    },

    /**
     * Remove the toast when the download is complete.
     */
    flush: () => {
      // Notify the user.
      ctx.toast.textContent =
        `Uploaded ${ctx.name}. (${ctx.currentSize} MB)`;

      // Change bg color and remove after a delay.
      ctx.toast.style.background = successColor;
      setTimeout(() => ctx.remove(), toastDuration);
    },
  })
}
