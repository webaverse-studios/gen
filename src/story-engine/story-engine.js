import React from 'react';
import {useEffect} from 'react';
import ReactDOM from 'react-dom';
import ReactDOMClient from 'react-dom/client';

import Markdown from 'marked-react';

import {
  makeId,
  makePromise,
} from './util.js';
import md from './markdown-utils.js';
import {AiClient} from '../../clients/ai/ai-client.js';
import {
  DatabaseClient,
} from '../../clients/database/database-client.js';
import {
  ImageAiClient,
} from '../clients/image-client.js';

//

const aiClient = new AiClient();
const databaseClient = new DatabaseClient({
  aiClient,
});
const imageAiClient = new ImageAiClient();

//

const abortError = new Error('abort');
abortError.isAbortError = true;

//

const RenderWrap = ({
  promise,
  children,
}) => {
  useEffect(() => {
    // console.log('rendered', promise);
    promise.resolve();
  });

  return (
    // <Markdown gfm openLinksInNewTab={false}>
    //   {children}
    // </Markdown>
    React.createElement(Markdown, {
      gfm: true,
      openLinksInNewTab: false,
    }, children)
  );
};

//

const formatObject = c => {
  const result = {};
  for (const key in c) {
    result[key.toLowerCase()] = c[key];
  }
  return result;
};

//

const getMarkdownImagesAsync = async (text, {
  abortController = null,
} = {}) => {
  const rootEl = document.createElement('div');
  const root = ReactDOMClient.createRoot(rootEl);
  const p = makePromise();
  root.render(
    // <RenderWrap
    //   promise={p}
    // >
    //   {text}
    // </RenderWrap>
    React.createElement(RenderWrap, {
      promise: p,
    }, text)
  );
  await p;
  if (abortController && abortController.signal.aborted) {
    throw abortError;
  }  
  const imgPlaceholders = Array.from(rootEl.querySelectorAll('img'));
  
  root.unmount();
  
  const imgPromptsAlts = imgPlaceholders.map(img => {
    const alt = img.getAttribute('alt');
    const match = alt.match(/^(?:([^\|]*)\|)?([\s\S]*)$/);
    if (match) {
      const altText = match[1].trim();
      const promptText = match[2].trim();
      return [
        promptText,
        altText,
      ];
    } else {
      throw new Error('invalid alt text: ' + alt);
    }
  });
  return imgPromptsAlts;
}
const blob2dataUrlAsync = blob => {
  const fr = new FileReader();
  const p = makePromise();
  fr.onload = () => {
    p.resolve(fr.result);
  };
  fr.onerror = err => {
    p.reject(err);
  };
  fr.readAsDataURL(blob);
  return p;
};
/* const compileImages = async (text, {
  abortController = null,
} = {}) => {
  const imgPromptsAlts = await getMarkdownImagesAsync(text, {
    abortController,
  });
  const imgUrls = await Promise.all(imgPromptsAlts.map(async ([promptText, altText]) => {
    const imageBlob = await imageAiClient.createImageBlob(promptText);
    const url = await blob2dataUrl(imageBlob);
    return {
      url,
      prompt: promptText,
      alt: altText,
    };
  }));
  if (abortController && abortController.signal.aborted) {
    throw abortError;
  }
  return imgUrls;
}; */
const getMainImagePromptsAltsAsync = async (messages, {
  abortController = null,
} = {}) => {
  return await Promise.all(messages.map(async message => {
    const item = message.object;

    let result = null;
    if (item.image) {
      const imgPromptsAlts = await getMarkdownImagesAsync(item.image, {
        abortController,
      });
      if (imgPromptsAlts.length > 0) {
        result = imgPromptsAlts[0];
      }
    }
    return result;
  }));
};
const getObjectImagePrompts = (mainImagePromptAlts, mainImagePrompts) => {
  for (let i = 0; i < mainImagePromptAlts.length; i++) {
    const item = mainImagePromptAlts[i];
    
    if (item !== null) {
      const [promptText, altText] = item;
      mainImagePrompts.set(item, promptText);
    }
  }
};
const compileObjectText = async (object, {
  abortController = null,
} = {}) => {
  const text = md.toMarkdownString(object);
  const vector = await aiClient.embed(text, {
    abortController,
  });

  return {
    text,
    vector,
  };
};

//

export class StoryManager {
  constructor({
    generators,
  }) {
    this.generators = generators;
  }
  async createConversationAsync() {
    let [
      character1,
      setting,
    ] = await Promise.all([
      this.generators.dataset.generateItem('character', {
        // Name: 'Death Mountain',
        // Description: panelSpec.description,
      }, {
        keys: ['Name', 'Description', 'Image'],
      }),
      this.generators.dataset.generateItem('setting', {
        // Name: 'Death Mountain',
        // Description: panelSpec.description,
      }, {
        keys: ['Name', 'Description', 'Image'],
      }),
    ]);
    character1 = formatObject(character1);
    setting = formatObject(setting);

    const conversation = new NLPConversation();

    // XXX initialize with messages only
    conversation.createHeroMessage('setting', {
      name: setting.name,
      description: setting.description,
      image: setting.image,
    });

    conversation.createHeroMessage('character', {
      name: character1.name,
      description: character1.description,
      image: character1.image,
    });

    await conversation.updateImagesAsync();
    return conversation;
  }
}

//

export class NLPMessage {
  #parent;
  constructor(object, parent) {
    this.object = object;
    this.#parent = parent;
  }
  getName() {
    return this.object.name ?? '';
  }
  getText() {
    return this.object.description ?? this.object.text ?? '';
  }
  getImageSources() {
    return this.#parent.getImageSources(this); 
  }
}

//

export class NLPConversation {
  constructor({
    name = `conversation_${makeId()}`,
  } = {}) {
    this.name = name;

    this.messages = [];

    this.mainImagePrompts = new WeakMap(); // message -> prompt
    this.imageCache = new Map(); // prompt -> image
    this.text = '';
    this.vector = null;
  }
  async updateImagesAsync() {
    // const object = {
    //   character: this.characters,
    //   setting: [this.setting],
    //   message: [],
    // };
    const mainImagePromptAlts = await getMainImagePromptsAltsAsync(this.messages);
    getObjectImagePrompts(mainImagePromptAlts, this.mainImagePrompts);

    if (mainImagePromptAlts.length !== this.messages.length) {
      throw new Error('invalid main image prompts alts: ' + mainImagePromptAlts.length + ' !== ' + this.messages.length);
    }

    // cache images
    await Promise.all(this.messages.map(async (message, index) => {
      // console.log('got item', {
      //   item,
      //   mainImagePromptAlts,
      //   mainImagePrompts: this.mainImagePrompts,
      // });

      const [
        prompt,
        alt,
      ] = mainImagePromptAlts[index];

      if (!this.imageCache.has(prompt)) {
        const imageBlob = await imageAiClient.createImageBlob(prompt);
        const url = URL.createObjectURL(imageBlob);

        this.imageCache.set(prompt, url);

        // XXX debug
        (async () => {
          const img = document.createElement('img');
          img.src = url;
          img.setAttribute('prompt', prompt);
          img.setAttribute('alt', alt);
          img.style.cssText = `\
            width: 512px;
            height: 512px;
            background: red;
          `;

          await new Promise((accept, reject) => {
            img.onload = accept;
            img.onerror = reject;
          });

          document.body.appendChild(img);
        })();
      }
    }));

    console.log('udpate images async', {
      mainImagePrompts: this.mainImagePrompts,
      imageCache: this.imageCache,
    });
  }
  getImagePrompts(message) {
    return this.mainImagePrompts.get(message);
  }
  getImageSources(message) {
    const prompts = this.getImagePrompts(message);
    const urls = prompts.map(p => this.imageCache.get(p));
    return urls;
  }
  createHeroMessage(type, {
    name,
    description,
    image,
  }) {
    const m = new NLPMessage({
      type,
      name,
      description,
      image,
    }, this);
    this.messages.push(m);
    return m;
  }
  createTextMessage({
    name,
    text,
  }) {
    const type = 'text';
    const m = new NLPMessage({
      type,
      name,
      text,
    }, this);
    this.messages.push(m);
    return m;
  }
  async updateTextAsync() {
    const {
      text,
      vector,
    } = await compileObjectText({
      character: this.characters,
      setting: [this.setting],
    });

    this.text = text;
    this.vector = vector;

    console.log('udpate image vectors', {
      text: this.text,
      vector: this.vector,
    });
  }
  async updateAsync() {
    await Promise.all([
      this.updateImagesAsync(),
      this.updateTextAsync(),
    ]);
  }
  async exportAsync() {
    await this.updateAsync();
    
    let {
      mainImagePrompts,
      imageCache,
      setting,
      characters,
      text,
      vector,
    } = this;

    const imageCache2 = {};
    await Promise.all(Array.from(imageCache.keys()).map(async prompt => {
      const url = imageCache.get(prompt);

      const res = await fetch(url);
      const blob = await res.blob();
      const dataUrl = await blob2dataUrlAsync(blob);
      imageCache2[prompt] = dataUrl;
    }));
    
    return {
      mainImagePrompts,
      imageCache: imageCache2,
      setting,
      characters,
      text,
      vector,
    };
  }
}