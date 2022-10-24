import uuidByString from "uuid-by-string";
import Markdown from "marked-react";

import styles from "../../styles/ContentObject.module.css";
import { Ctx } from "../../clients/context.js";
import { cleanName } from "../../utils.js";
import { generateItem } from "../../datasets/dataset-generator.js";
import { formatItemText } from "../../datasets/dataset-parser.js";
import { getDatasetSpecs } from "../../datasets/dataset-specs.js";
import React, { useRef, useState } from "react";
import { UserBox } from "../../src/components/user-box/UserBox";

//

// Sections to move to the right column from the markdown

const moveToRightColumn = [
    "ALIGNMENT:",
    "STATS:",
    "PROPERTIES:",
    "HAS:",
    "ABILITIES:",
    "LIMIT BREAK:",
];

//

const ContentObject = ({ type, title, content }) => {
    const infoRef = useRef();
    const [itemClass, setItemClass] = useState("");
    const [featuredImage, setFeaturedImage] = useState("");

    const addElement = async (label, value) => {
        let e = document.createElement("div");
        e.innerHTML = `<div class="${
            styles.label
        }">${label.toLowerCase()}</div><div class="${
            styles.value
        }">${value}</div>`;
        return e;
    };

    const formatImages = (md) => {
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
    content = formatImages(content);

    React.useEffect(() => {
        const val = document.querySelectorAll("h2");

        [...val].map((item) => {
            // Set Class
            if (item?.outerText === "CLASS:") {
                setItemClass(item.nextSibling.outerText);
                item.nextSibling.remove();
                item.remove();
            }
            // Set a classname to the gallery ul
            if (item?.outerText === "IMAGE GALLERY:") {
                item.nextSibling.classList.add(styles.galleryWrap);
            }
            // Set featured image
            if (item?.outerText === "IMAGE:") {
                let img = item.nextSibling.getElementsByTagName("img")[0];
                if (img) {
                    let src = img.src;
                    setFeaturedImage(src);
                    item.nextSibling.remove();
                    item.remove();
                } else {
                    let gallery = document.getElementsByClassName(
                        styles.galleryWrap
                    )[0];
                    if (gallery) {
                        let img = gallery.getElementsByTagName("img")[0];
                        if (img) {
                            let src = img.src;
                            setFeaturedImage(src);
                        }
                    }
                }
            }
            // Move all the content specified in "moveToRightColumn" to the right column
            if (moveToRightColumn.includes(item?.outerText)) {
                addElement(item.innerText, item.nextSibling.innerHTML).then(
                    (html) => {
                        infoRef.current.append(html);
                    }
                );
                item.nextSibling.remove();
                item.remove();
            }
        });
    }, [content]);

    const name = title.split("/")[1];

    return (
        <div className={styles.character}>
            <UserBox />
            <img
                src={"/assets/logo.svg"}
                className={styles.logo}
                alt="Webaverse Wiki"
            />
            <div className={styles.contentWrap}>
                <div className={styles.name}>{name}</div>
                <div className={styles.rightContent}>
                    <div className={styles.title}>{name}</div>
                    {itemClass && (
                        <div className={styles.subtitle}>{itemClass}</div>
                    )}
                    <div className={styles.previewImageWrap}>
                        <img
                            src={"/assets/image-frame.svg"}
                            className={styles.frame}
                        />
                        <div className={styles.mask}>
                            <img src={featuredImage} />
                        </div>
                    </div>
                    <div className={styles.infoWrap} ref={infoRef}></div>
                </div>
                <div className={styles.leftContent}>
                    <div className={styles.markdown}>
                        <Markdown gfm openLinksInNewTab={false}>
                            {content}
                        </Markdown>
                    </div>
                </div>
            </div>
        </div>
    );
};
ContentObject.getInitialProps = async (ctx) => {
    const { req } = ctx;
    const match = req.url.match(/^\/([^\/]*)\/([^\/]*)/);
    let type = match ? match[1].replace(/s$/, "") : "";
    let name = match ? match[2] : "";
    name = decodeURIComponent(name);
    name = cleanName(name);

    const c = new Ctx();
    const title = `${type}/${name}`;
    const id = uuidByString(title);
    const query = await c.databaseClient.getByName("Content", title);
    if (query) {
        const { content } = query;
        return {
            type,
            id,
            title,
            content,
        };
    } else {
        const c = new Ctx();
        const [datasetSpecs, generatedItem] = await Promise.all([
            getDatasetSpecs(),
            generateItem(type, name),
        ]);
        const datasetSpec = datasetSpecs.find((ds) => ds.type === type);
        // console.log('got datset spec', {datasetSpec});
        const itemText = formatItemText(generatedItem, datasetSpec);

        // const imgUrl = `/api/characters/${name}/images/main.png`;

        const content = `\
${itemText}
`;
        // ![](${encodeURI(imgUrl)})

        await c.databaseClient.setByName("Content", title, content);

        return {
            type,
            id,
            title,
            content,
        };
    }
};
export default ContentObject;
