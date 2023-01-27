import * as THREE from 'three';
import {useState, useEffect, useRef, useContext, createContext, Fragment} from 'react';
import classnames from 'classnames';

import styles from '../../../styles/ImageGallery.module.css';

//

const contentBaseUrl = `https://cdn.jsdelivr.net/gh/webaverse/content@main/`;
const imagesUrl = `${contentBaseUrl}images/`;
const imagesListUrl = `${imagesUrl}list.txt`;

//

const GalleryImage = ({
    src,
    onClick,
}) => {
    const ref = useRef();
    const imgRef = useRef();

    useEffect(() => {
        const el = ref.current;
        const imgEl = imgRef.current;
        if (el && imgEl) {
            const options = {
                root: null,
                rootMargin: '1000px',
                threshold: 0,
            };
            const callback = (entries, observer) => {
                // console.log('got entries', {
                //     entries,
                //     observer,
                // });
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        if (!imgEl.loaded) {
                            imgEl.loaded = true;
                            // console.log('intersecting', entry, imgEl.src);
                            /* const img = new Image();
                            img.src = src;
                            img.crossOrigin = 'Anonymous';
                            img.onload = () => {
                                console.log('got image', img);
                                el.appendChild(img);
                            };
                            observer.unobserve(entry.target); */

                            imgEl.classList.add(styles.loaded);

                            const load = e => {
                                // imgEl.classList.add(styles.loaded);
                                cleanup();
                            };
                            imgEl.addEventListener('load', load);
                            const error = e => {
                                imgEl.classList.add(styles.errored);
                                cleanup();
                            };
                            imgEl.addEventListener('error', error);
                            const cleanup = () => {
                                imgEl.removeEventListener('load', load);
                                imgEl.removeEventListener('error', error);
                            };
                            imgEl.src = src;
                        }
                    } else {
                        if (imgEl.loaded) {
                            // compute the scroll parent
                            // const scrollTop = window.pageYOffset;

                            // compute the scroll distance
                            // const rect = imgEl.getBoundingClientRect();                            
                            // const scrollDistance = Math.max(0, -rect.bottom, -rect.top);
                            // console.log('scroll', scrollDistance);

                            // if (scrollDistance > 1000) {
                                // console.log('scroll distance cleared', scrollDistance);
                                imgEl.removeAttribute('src');
                                // imgEl.src = '';
                                imgEl.loaded = false;
                                imgEl.classList.remove(styles.loaded);
                                imgEl.classList.remove(styles.errored);
                            // }
                        }
                    }
                }
            };
            let observer = new IntersectionObserver(callback, options);
            observer.observe(el);

            return () => {
                observer.disconnect();
            };
        }
    }, [ref.current, imgRef.current]);

    return (
        <div className={styles.imageWrap} ref={ref}>
            <img crossOrigin="Anonymous" className={styles.image} onClick={onClick} ref={imgRef} />
        </div>
    );
};

//

const GalleryImagePlaceholder = ({
  imgPlaceholder,
  onIntersect,
}) => {
  const ref = useRef();

  useEffect(() => {
      const el = ref.current;
      if (el) {
          const options = {
              root: null,
              rootMargin: '1000px',
              threshold: 0,
          };
          const callback = (entries, observer) => {
              let isIntersecting = false;
              for (const entry of entries) {
                  if (entry.isIntersecting) {
                      isIntersecting = true;
                      break;
                  }
              }
              isIntersecting && onIntersect();
          };
          let observer = new IntersectionObserver(callback, options);
          observer.observe(el);

          return () => {
              observer.disconnect();
          };
      }
  }, [imgPlaceholder, ref.current]);

  return (
      <div className={styles.imageWrap} ref={ref} />
  );
};

//

export const SceneGallery = ({
  onImageClick,
}) => {
  const [imgPlaceholders, setImgPlaceholders] = useState(0);
  const [imgUrls, setImgUrls] = useState([]);
  
  useEffect(() => {
      let live = true;
      
      (async () => {
          const res = await fetch(imagesListUrl);
          if (!live) return;
          
          const text = await res.text();
          if (!live) return;

          const urls = text.split('\n')
            .map(name => `${imagesUrl}${name}`);
          // console.log('load new urls', urls);
          setImgUrls(urls);
      })();

      return () => {
          live = false;
      };
  }, []);

  const numImgPlaceholdersPerChunk = 16;

  return (
      <div className={styles.gallery}>
          {(() => {
              const results = Array(imgPlaceholders);
              for (let i = 0; i < imgPlaceholders; i++) {
                  const u = imgUrls[i];
                  results[i] = u ? (
                      <GalleryImage
                          src={u}
                          onClick={e => {
                                  onImageClick(u);
                          }}
                          key={i}
                      />
                  ) : null;
              }
              return results;
          })()}
          <GalleryImagePlaceholder
              imgPlaceholder={imgPlaceholders}
              onIntersect={e => {
                  setImgPlaceholders(imgPlaceholders + numImgPlaceholdersPerChunk);
              }}
          />
      </div>
  );
};