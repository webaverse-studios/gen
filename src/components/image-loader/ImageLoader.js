import React, { useState, useEffect, useContext, useRef } from "react";
import classnames from "classnames";
import styles from "./ImageLoader.module.css";

export const ImageLoader = ({ url, className }) => {
    const [loading, setLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState(0);
    useEffect(() => {
        if (url) {
            let xmlHTTP = new XMLHttpRequest();
            xmlHTTP.open("GET", url, true);
            xmlHTTP.onprogress = function (pr) {
                console.log(pr.loaded);
                setLoadingProgress(Math.round((pr.loaded * 100) / pr.total));
            };
            xmlHTTP.onloadend = function (e) {
                setLoadingProgress(100);
                setLoading(false);
            };
            xmlHTTP.send();
        }
    }, [url]);

    return (
        <React.Fragment>
            {!loading ? (
                <img src={url} className={classnames(styles.image, className)} />
            ) : (
                <div className={styles.loaderWrap}>
                    <svg viewBox="0 0 190 190" fill="#FFFFFF"
                        className={styles.loaderIcon}
                    >
                        <path d="M95,7.71V0a95.13,95.13,0,0,1,95,95h-7.71A87.39,87.39,0,0,0,95,7.71Z" />
                    </svg>
                    <div className={styles.percentage}>{loadingProgress && loadingProgress}%</div>
                </div>
            )}
        </React.Fragment>
    );
};
