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

export const formatImages = async (md, type, title) => {
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

const sectionSeperator = "##";
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
