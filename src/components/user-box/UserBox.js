import React, {useState, useEffect, useContext} from 'react';
import classnames from 'classnames';
import styles from './UserBox.module.css';

export const UserBox = () => {
  
  const loggedIn = true;

  return (
    <div className={classnames(styles.userBoxWrap)}>
      <div className={styles.leftCorner} />
      <div className={styles.rightCorner} />
      <ul>
        {!loggedIn && (
          <>
            <li>
              <div className={styles.profileImage}>
                <div className={styles.image}>
                  <img src={'/assets/backgrounds/profile-no-image.png'} />
                </div>
              </div>
            </li>
            <li>
              <div className={styles.loggedOutText}>
                Not
                <br />
                Logged In
              </div>
            </li>
          </>
        )}
        {loggedIn && (
          <>
            <li>
              <div className={styles.profileImage}>
                <div className={styles.image}>
                  <img
                    src={
                      '/assets/profile-no-image.png'
                    }
                    crossOrigin="Anonymous"
                  />
                </div>
              </div>
            </li>
            <li>
              <div className={styles.loggedInText}>
                <div className={styles.chainName}>
                  {'Polygon'}
                </div>
                <div className={styles.walletAddress}>{"0x5d...C26e2d"}</div>
              </div>
            </li>
          </>
        )}
      </ul>
    </div>
  );
};
