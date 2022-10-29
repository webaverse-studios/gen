import React, { useState, useEffect, useContext } from "react";
import classnames from "classnames";
import Markdown from "marked-react";
import styles from "./Sections.module.css";

export const LeftSection = (props) => {
    const { title, content, index } = props;
    return (
        <div className={classnames(styles.leftSection)} key={index}>
            <div
                className={
                    title.toLowerCase().includes("image gallery") ?
                    styles.galleryWrap : ""
                }
            >
                <h2>
                    {title}
                    <div className={styles.actionsBox}>
                        <div className={styles.action}>
                            <img src="/assets/edit.svg" />
                        </div>
                        <div className={styles.action}>
                            <img src="/assets/refresh.svg" />
                        </div>
                    </div>
                </h2>
                <Markdown gfm openLinksInNewTab={false}>
                    {content}
                </Markdown>
            </div>
        </div>
    );
};
