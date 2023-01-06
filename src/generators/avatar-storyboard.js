import {ZineStoryboard} from "../zine/zine-format.js";

export class Storyboard extends EventTarget {
    constructor(zs = new ZineStoryboard()) {
        super();

        this.zs = zs;

        this.#listen();
    }
    panels = [];

    #listen() {
        this.zs.#listen();
    }

    destroy() {
        this.zs.destroy()
    }
}