export function makeId(length) {
    let result = '';
    const characters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

export const makePromise = () => {
    let resolve, reject;
    const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
    });
    promise.resolve = resolve;
    promise.reject = reject;
    return promise;
};
export const loadImage = u => {
    const p = makePromise();
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      p.resolve(img);
    };
    img.onerror = p.reject;
    img.src = u;
    return p;
};
export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const capitalizeAllWords = (s) => {
    let words = s.split(/\s+/);
    words = words.map((word) => capitalize(word));
    return words.join(" ");
};
export const ensureUrl = async (url) => {
    const numRetries = 5;
    for (let i = 0; i < numRetries; i++) {
        const res = await fetch(url);
        if (res.ok) {
            return;
        } else {
            if (res.status === 408) {
                continue;
            } else {
                throw new Error(`invalid status code: ${res.status}`);
            }
        }
    }
};
export const cleanName = (name) => {
    name = name.replace(/_/g, " ");
    name = capitalizeAllWords(name);
    return name;
};
export const isAllCaps = (name) => {
    return !/[A-Z]/.test(name) || /^(?:[A-Z]+)$/.test(name);
};

// Format Images
export const formatImages = async (md, type) => {
    md = md.replace(/\!\[([^\]]*?)\]\(([^\)]*?)\)/g, (all, title, url) => {
        const match = title.match(/^([\s\S]*?)(\|[\s\S]*?)?$/);
        if (match) {
            title = match[1].trim();
            url = match[2] ? match[2].trim() : title;
            if (url) {
                return `![${title}](/api/images/${type}s/${encodeURIComponent(
                    url
                )}.png)`;
            } else {
                return null;
            }
        } else {
            return all;
        }
    });
    return md;
};

// Format URLs
export const formatUrls = async (md) => {
    md = md.replace(
        /(\!?)\[([\s\S]+?)\]\(([\s\S]+?)\)/g,
        (all, q, title, url) => {
            if (q) {
                return all;
            }
            return `[${title}](${encodeURI(url)})`;
        }
    );
    return md;
};

// Format Sections

// Section Title Separator
const sectionSeperator = "##";
// Title & Description Separator by first ":" in the string
const titleDescriptionSeperator = /:(.*)/s;

export const getSections = async (content) => {
    const sections = [];
    const sectionsArray = content.split(sectionSeperator);
    await sectionsArray.map((section) => {
        if (section) {
            let sectionItem = {
                title: section.split(titleDescriptionSeperator)[0].trim(),
                content: section.split(titleDescriptionSeperator)[1].trim(),
            };
            sections.push(sectionItem);
        }
    });
    return sections;
};

// Fetch Gallery Images as an Array
export const getGalleryArray = async (content) => {
    const gallery = [];
    const imagesArray = content.match(/\!\[([^\]]*?)\]\(([^\)]*?)\)/g);
    if (imagesArray) {
        await imagesArray.map((image) => {
            const title = image.match(/(?<=\[).+?(?=\])/g)[0];
            const url = image.match(/(?<=\().+?(?=\))/g)[0];
            let galleryItem = {
                caption: title,
                url: url,
            };
            if (url) {
                gallery.push(galleryItem);
            }
        });
    }
    return gallery;
};

export function mod(v, n) {
    return ((v % n) + n) % n;
}

export const modUv = (uv) => {
    uv.x = mod(uv.x, 1);
    uv.y = mod(uv.y, 1);
    return uv;
};

export const fetchArrayBuffer = async srcUrl => {
  const res = await fetch(srcUrl);
  if (res.ok) {
    const arrayBuffer = await res.arrayBuffer();
    return arrayBuffer;
  } else {
    throw new Error('failed to load: ' + res.status + ' ' + srcUrl);
  }
};