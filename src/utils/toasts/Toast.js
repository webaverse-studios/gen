import { backgroundColor } from './constants.js';


const toastStyle =
  'position: fixed;' +
  'bottom: 0;' +
  'left: 0;' +
  'right: 0;' +
  `background: ${backgroundColor};` +
  'color: #fff;' +
  'padding: 16px;' +
  'text-align: center;';


/**
 * Creates a toast element for displaying messages to the user.
 */
export class Toast {
  // Toast element
  toast = null;

  /**
   * Create a new toast.
   */
  constructor() {
    // Create, format and append a toast element.
    this.toast = document.createElement('div');
    this.toast.style = toastStyle;

    document.body.appendChild(this.toast);
  }

  /**
   * Remove the toast.
   */
  remove() { this.toast.remove(); }
}
