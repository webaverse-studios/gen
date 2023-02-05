import * as THREE from 'three';
import {useState, useRef, useEffect} from 'react';
import classnames from 'classnames';

import styles from '../../../styles/Quest.module.css';

//

export const Quest = ({
    Name,
    Description,
    Image,
    Objectives,
    live = true,
    onZombie = () => {},
}) => {
    const [animateIn, setAnimateIn] = useState(false);
    const [animateOut, setAnimateOut] = useState(false);
    const nodeRef = useRef(null);

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

    const animate = animateIn && !animateOut;
    return (<div className={classnames(
        styles.quest,
        animate ? styles.animate : null,
    )} ref={nodeRef}>
        <div className={styles.content}>
            <div className={styles.name}>
                {Name}
            </div>
            <div className={styles.description}>
                {Description}
            </div>
            <div className={styles.objectives}>
                {Objectives.join('\n')}
            </div>
        </div>
    </div>);
};