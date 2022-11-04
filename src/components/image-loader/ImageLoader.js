import React, { useState, useEffect, useContext, useRef } from "react";
import classnames from "classnames";
import styles from "./ImageLoader.module.css";

export const ImageLoader = ({ url, className, rerollable }) => {
    const [loading, setLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState("0%");
    const [ imageUrl , setImageUrl ] = useState(url);
    const [ reroll, setReroll ] = useState(false);
    const [ triggerLoader , setTriggerLoader ] = useState(true);
    const [ timestamp, setTimestamp ] = useState("");
    useEffect(() => {
        if (url && triggerLoader) {
            setImageUrl();
            setLoadingProgress('Generating');
            setLoading(true)
            let xmlHTTP = new XMLHttpRequest();
            console.log(`${url}${reroll && '?reroll=true'}`);
            xmlHTTP.open("GET", `${url}${reroll && '?reroll=true'}`, true);
            xmlHTTP.onprogress = function (pr) {
                setImageUrl(url);
                setLoadingProgress(`${Math.round((pr.loaded * 100) / pr.total)}%`);
            };
            xmlHTTP.onloadend = function (e) {
                if(reroll) {
                    setTimestamp(Date.now());
                }
                setLoadingProgress(100);
                setTriggerLoader(false);
                setReroll(false);
                setLoading(false);
            };
            xmlHTTP.send();
        }
    }, [url, triggerLoader]);

    useEffect(() => {
        if(reroll) {
            setTriggerLoader(true);
        }
    }, [reroll]);

    return (
        <React.Fragment>
            <img src={"/assets/refresh.svg"} onClick={() => setReroll(true)} className={styles.reroll} />
            {!loading ? (
                <img src={imageUrl + `${timestamp && `?timestamp=${timestamp}`}`} className={classnames(styles.image, className)} />
            ) : (
                <div className={styles.loaderWrap}>
                    <svg viewBox="0 0 190 190" fill="#FFFFFF"
                        className={styles.loaderIcon}
                    >
                        <path d="M95,7.71V0a95.13,95.13,0,0,1,95,95h-7.71A87.39,87.39,0,0,0,95,7.71Z" />
                    </svg>
                    <div className={styles.percentage}>{loadingProgress && loadingProgress}</div>
                </div>
            )}
        </React.Fragment>
    );
};
