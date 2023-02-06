import * as THREE from 'three';
import {useState, useRef, useEffect} from 'react';
import classnames from 'classnames';

import styles from '../../../styles/DoomClock.module.css';

//

export const DoomClock = ({
    live = true,
    onZombie = () => {},
    timeout = 7 * 60 * 1000,
}) => {
    const [animateIn, setAnimateIn] = useState(false);
    const [animateOut, setAnimateOut] = useState(false);
    const nodeRef = useRef(null);
    const contentRef = useRef(null);
    const bottomBarRef = useRef(null);
    const notchBarRef = useRef(null);

    useEffect(() => {
        if (!animateIn) {
            const frame = requestAnimationFrame(() => {
                setAnimateIn(true);
            });
            return () => {
                cancelAnimationFrame(frame);
            };
        }
    }, [animateIn]);
    useEffect(() => {
        if (nodeRef.current && !live) {
            console.log('set animate out', true);
            setAnimateOut(true);

            const nodeEl = nodeRef.current;
            const transitionEnd = e => {
                if (e.target === nodeEl) {
                    nodeEl.removeEventListener('transitionend', transitionEnd);
                    onZombie();
                }
            };
            nodeEl.addEventListener('transitionend', transitionEnd);

            return () => {
                nodeEl.removeEventListener('transitionend', transitionEnd);
            };
        }
    }, [nodeRef.current, live]);

    useEffect(() => {
        const contentEl = contentRef.current;
        const bottomBarEl = bottomBarRef.current;
        const notchBarEl = notchBarRef.current;
        if (contentEl && bottomBarEl && notchBarEl) {
            const startTime = performance.now();
            const _recurse = () => {
                frame = requestAnimationFrame(_recurse);

                const now = performance.now();
                const timeDiff = now - startTime;
                const timeLeft = timeout - timeDiff;

                if (timeLeft > 0) {
                    // format as 00:00.000
                    const ms = timeLeft % 1000;
                    const secs = Math.floor(timeLeft / 1000) % 60;
                    const mins = Math.floor(timeLeft / 1000 / 60) % 60;

                    const msStr = ms.toString().slice(0, 3).padStart(3, '0');
                    const secsStr = secs.toString().padStart(2, '0');
                    const minsStr = mins.toString().padStart(2, '0');

                    contentEl.innerText = `${minsStr}:${secsStr}.${msStr}`;

                    const f = timeLeft / timeout;
                    const fPercentString = `${f * 100}%`;
                    bottomBarEl.style.width = fPercentString;
                    notchBarEl.style.left = fPercentString;
                } else {
                    cancelAnimationFrame(frame);
                }
            };
            let frame = requestAnimationFrame(_recurse);

            return () => {
                cancelAnimationFrame(frame);
            };
        }
    }, [contentRef.current, bottomBarRef.current]);

    const animate = animateIn && !animateOut;
    return (<div className={classnames(
        styles.doomClock,
        animate ? styles.animate : null,
    )} ref={nodeRef}>
        <div className={classnames(
            styles.block,
            styles.left,
        )} />
        <div className={classnames(
            styles.block,
            styles.bottom,
        )} ref={bottomBarRef} />
        <div className={classnames(
            styles.block,
            styles.notch,
        )} ref={notchBarRef} />
        <div className={styles.content} ref={contentRef} />
        <div className={styles.footer}>
             to doom
        </div>
    </div>);
};