import {useState, useEffect, useRef} from 'react';
import * as THREE from 'three';
// import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import classnames from 'classnames';
import * as WebMWriter from 'webm-writer';
import alea from '../../utils/alea.js';
import {
  AiClient,
} from '../../../clients/ai/ai-client.js';
import {
  DatabaseClient,
} from '../../../clients/database/database-client.js';
import {
  getDatasetSpecs,
} from '../../dataset-engine/dataset-specs.js';
import {
  DatasetGenerator,
} from '../../dataset-engine/dataset-generator.js';

import Markdown from 'marked-react';

import {
  StoryManager,
} from '../../story-engine/story-engine.js';

import {
  DropTarget,
} from '../drop-target/DropTarget.jsx';

import {
  ImageAiClient,
} from '../../clients/image-client.js';
import {
  VQAClient,
} from '../../clients/vqa-client.js'

import styles from '../../../styles/Story.module.css';

//

// const localVector = new THREE.Vector3();
// const localColor = new THREE.Color();

//

const loadDatasetGenerator = async () => {
  const datasetSpecs = await getDatasetSpecs();
  const datasetGenerator = new DatasetGenerator({
    datasetSpecs,
    aiClient,
    // fillRatio: 0.5,
  });
  return datasetGenerator;
};

//

// const FPS = 60;

//

const aiClient = new AiClient();
const databaseClient = new DatabaseClient({
  aiClient,
});
const imageAiClient = new ImageAiClient();
const vqaClient = new VQAClient();

//

const getAudioContext = (() => {
  let audioContext = null;
  return () => {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    return audioContext;
  };
})();

//

const MessageText = ({
  className,
  conversation,
  children,
}) => {
  const mdRef = useRef();
  useEffect(() => {
    const mdDiv = mdRef.current;
    // console.log('got md div1', mdDiv);
    if (mdDiv) {
      const imgs = Array.from(mdDiv.querySelectorAll('img'));
      // console.log('got md div 2', mdDiv, imgs);
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        const imgAlt = img.getAttribute('alt');
        const match = imgAlt.match(/^(?:([^\|]*?)\|)?([\s\S]+)$/);
        if (match) {
          const altText = (match[1] ?? '').trim();
          const prompt = (match[2] ?? '').trim();
          const url = conversation.getImageSourceFromPrompt(prompt);
          if (url) {
            img.setAttribute('src', url);
          } else {
            console.warn('no url', {conversation, prompt});
          }
        } else {
          console.warn('no alt match', {imgAlt});
        }
      }
    }
  }, [mdRef.current]);

  return (
    <div className={className} ref={mdRef}>
      <Markdown gfm openLinksInNewTab={false}>
        {children}
      </Markdown>
    </div>
  );
};
const Message = ({
  message,
  className = null,
}) => {
  const urls = message.getImageSources();
  const imgSrc = urls[0];

  const item = message.object;

  const conversation = message.getConversation();

  return (
    <div className={classnames(
      styles.message,
      className,
    )}>
      {/* <div className={styles.image}>{item.image}</div> */}
      {imgSrc ? <div className={styles.image}>
        <img src={imgSrc} className={styles.img} />
      </div> : null}
      <div className={styles.wrap}>
        {item.name ? <MessageText className={styles.name} conversation={conversation}>{item.name}</MessageText> : null}
        {item.description ? <MessageText className={styles.description} conversation={conversation}>{item.description}</MessageText> : null}
        {item.text ? <MessageText className={styles.text} conversation={conversation}>{item.text}</MessageText> : null}
      </div>
    </div>
  );
};

//

const Attachments = ({
  attachments,
  onRemove,
}) => {
  return (
    <div className={styles.atachments}>
      {attachments.map((attachment, index) => {
        const {
          url,
          name,
        } = attachment;

        return (
          <div className={styles.attachments} key={index}>
            <div className={styles.attachment}>
              {url ?
                <img src={url} className={styles.img} />
              :
                <img src='/images/arc-white.png' className={classnames(
                  styles.img,
                  styles.placeholder,
                  styles.rotate,
                )} />
              }
              <div className={styles.remove} onClick={e => {
                onRemove(attachment);
              }}>
                <img src='/images/close.svg' className={styles.img} />
              </div>
              {name ?
                <div className={styles.name}>{name}</div>
              :
                <img src='/images/arc-white.png' className={classnames(
                  styles.img,
                  styles.placeholder,
                  styles.small,
                  styles.rotate,
                )} />
              }
            </div>
          </div>
        );
      })}
    </div>
  );
};

//

class Attachment extends EventTarget {
  constructor({
    name,
    url,
  }) {
    super();

    this.name = name;
    this.url = url;

    this.editing = false;
  }
  edit() {
    this.editing = true;
  }
  blur() {
    this.editing = false;
  }
  async ensure() {
    if (this.name && !this.url) {
      // generate
      const imageBlob = await imageAiClient.createImageBlob(this.name);
      this.url = URL.createObjectURL(imageBlob);
    }
    if (!this.name && this.url) {
      // analyze
      const res = await fetch(this.url);
      const file = await res.blob();
      const caption = await vqaClient.getImageCaption(file);
      this.name = caption;
    }
  }
}

//

export const Conversation = ({
  conversation: _conversation,
  onClose,
}) => {
  const [conversation, setConversation] = useState(_conversation);
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [epoch, setEpoch] = useState(0);
  const conversationRef = useRef();

  // console.log('got conversation', {
  //   messages: conversation.messages,
  // });

  useEffect(() => {
    const conversationEl = conversationRef.current;
    if (conversationEl) {
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [epoch, conversationRef.current]);

  const send = async () => {
    if (message || attachments.length > 0) {
      let text = message;

      let match;
      if (text === '?') {
        console.log('print help'); // XXX
      } else if (match = text.match(/^\/(\S*)(?:\s+(.*))?$/)) {
        const command = match[1] ?? '';
        const args = match[2] ?? '';
        switch (command) {
          case 'img': {
            generateImage(args);
            break;
          }
          case 'me': {
            console.log('generate me');
            break;
          }
          case 'you': {
            console.log('generate you');
            break;
          }
          default: {
            console.warn('invalid command');
            break;
          }
        }
      } else {
        if (attachments.length > 0) {
          text = attachments.map(attachment => {
            return `![attached file|${attachment.name}]()`;
          }).join(' ') + ' ' + text;
        }
        // inject images
        await Promise.all(attachments.map(async attachment => {
          await conversation.injectImageToCache(attachment.name, attachment.url);
        }))
        // create new message
        const m = conversation.createTextMessage({
          name: 'you',
          text,
        });
        // const newMessages = messages.concat([m]);
        // setMessages(newMessages);
  
        // XXX handle the message here
        console.log('post message', m);
      }

      setMessage('');
      setAttachments([]);
      setEpoch(epoch + 1);
    }
  };
  const generateImage = async () => {
    if (message) {
      const attachment = new Attachment({
        name: `attached file.png | ${message}`,
        url: null,
      });
      const newAttachments = [...attachments, attachment];
      setAttachments(newAttachments);
      setMessage('');
      
      await attachment.ensure();
      
      setEpoch(epoch + 1);
    }
  };
  const addFiles = async files => {
    // console.log('add files', files);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const {
        name,
        type,
      } = file;
      if (/^image\//.test(type)) {
        const url = URL.createObjectURL(file);
        const attachment = new Attachment({
          // name,
          url,
        });

        await attachment.ensure();
        console.log('new attachment name', [attachment.name]);
        attachment.name = `${name} | ${attachment.name}`;

        const newAttachments = [...attachments, attachment];
        setAttachments(newAttachments);
      }
    }
  };

  return (<div className={classnames(
    styles.conversation,
    styles.scrollbar,
    styles['style-1'],
  )} ref={conversationRef}>
    <div className={classnames(
      styles.messages,
      // styles.row,
    )}>
      {conversation.messages.map((message, index) => {
        return (
          <Message
            className={classnames(
              message.object.type !== 'text' ? styles.hero : null,
              styles[message.object.type],
            )}
            message={message}
            key={index}
          />
        );
      })}
      <div className={classnames(
        styles.inputBarPlaceholder,
        attachments.length > 0 ? styles.hasFiles : null,
      )} />
    </div>
    <div className={classnames(
      styles.inputBar,
      attachments.length > 0 ? styles.hasFiles : null,
    )}>
      <div className={styles.messageInput}>
        <Attachments
          attachments={attachments}
          onRemove={attachment => {
            const index = attachments.indexOf(attachment);
            if (index !== -1) {
              const newAttachments = attachments.slice();
              newAttachments.splice(index, 1);
              setAttachments(newAttachments);
            } else {
              console.warn('attachment not found', attachment);
            }
          }}
        />
        <div className={styles.row}>
          <span className={classnames(
            styles.inputPrefix,
          )}>&gt; </span>
          <input type='text' className={styles.input} value={message} onChange={e => {
            setMessage(e.target.value);
          }} onKeyDown={e => {
            if (e.key === 'Enter') {
              send();
            }
          }} placeholder='press enter to chat' />
          {/* <div className={styles.smallButton} alt='Generate image' onClick={e => {
            generateImage();
          }}>
            <img src='/images/paint-box.svg' className={styles.img} />
          </div>
          <div className={styles.smallButton} alt='Send' onClick={e => {
            send();
          }}>
            <img src='/images/send.svg' className={styles.img} />
          </div> */}
        </div>
        {/* <div className={classnames(
          styles.row,
          styles.fill,
        )}>
          <div className={styles.smallButton} onClick={async e => {
            console.log('save 21');
            const exportObject = await conversation.exportAsync();
            console.log('save 2', exportObject);
            // XXX finish this
          }}>
            <img src='/images/save.svg' className={styles.img} />
          </div>
          <div className={styles.smallButton} onClick={e => {
            console.log('remove 1', conversation);
            // XXX finish this
          }}>
            <img src='/images/trash.svg' className={styles.img} />
          </div>
          <div className={styles.smallButton} onClick={async e => {
            console.log('brain 1', conversation, conversation.messages.slice());
            // XXX finish this
            const messages = await conversation.nextAsync({
              continueLabel: 'you:',
            });
            console.log('brain 2', messages);
          }}>
            <img src='/images/brain.svg' className={styles.img} />
          </div>
          <div className={styles.smallButton} onClick={e => {
            onClose();
          }}>
            <img src='/images/close.svg' className={styles.img} />
          </div>
        </div> */}
      </div>
      <DropTarget
        className={classnames(
          styles.panelPlaceholder,
          styles.hidden,
          // (loaded || loading) ? styles.hidden : null,
        )}
        onFilesAdd={addFiles}
        multiple
      />
    </div>
  </div>);
};

export const StoryUI = ({
  lore,
}) => {
  const [conversation, setConversation] = useState(null);

  // console.log('render story ui', lore);

  useEffect(() => {
    if (lore) {
      let live = true;

      (async () => {
        const datasetGenerator = await loadDatasetGenerator();
        if (!live) return;

        const generators = {
          dataset: datasetGenerator,
        };
        const storyManager = new StoryManager({
          generators,
        });
        // const conversation = await storyManager.createFakeConversationAsync();
        // console.log('create conversation from lore', lore);
        // const {
        //   Description,
        // } = lore;
        const conversation = storyManager.createConversation({
          setting: lore,
        });
        // if (!live) return;
        
        setConversation(conversation);
      })();

      return () => {
        live = false;
      };
    }
  }, [lore]);

  return (conversation ? <div className={classnames(
    styles.storyUI,
  )}>
    <Conversation
      conversation={conversation}
      onClose={e => {
      setConversation(null);
    }} />
  </div> : null);
};