import React, { useState, useEffect, useContext } from "react";
import classnames from "classnames";
import styles from "./UserBox.module.css";
import CustomButton from "../custom-button";

export const UserBox = () => {
    const loggedIn = false;

    return (
        <div className={classnames(styles.userBoxWrap)}>
            <div className={styles.leftCorner} />
            <div className={styles.rightCorner} />
            <ul>
                <li>
                    <CustomButton
                        type="icon"
                        theme="light"
                        icon="backpack"
                        size={32}
                    />
                </li>
                <li>
                    <CustomButton
                        type="icon"
                        theme="light"
                        icon="map"
                        size={32}
                    />
                </li>
                {!loggedIn && (
                    <>
                        <li>
                            <div className={styles.profileImage}>
                                <div className={styles.image}>
                                    <img src={"/assets/profile-no-image.png"} />
                                </div>
                            </div>
                        </li>
                        <li>
                            <div className={styles.loggedOutText}>
                                Not
                                <br />
                                Logged In
                            </div>
                            <CustomButton
                                type="login"
                                theme="dark"
                                icon="login"
                                size={28}
                                className={styles.loginButton}
                            />
                        </li>
                    </>
                )}
                {loggedIn && (
                    <>
                        <li>
                            <div className={styles.profileImage}>
                                <div className={styles.image}>
                                    <img
                                        src={"/assets/profile-no-image.png"}
                                        crossOrigin="Anonymous"
                                    />
                                </div>
                            </div>
                        </li>
                        <li>
                            <div className={styles.loggedInText}>
                                <div className={styles.chainName}>
                                    {"Polygon"}
                                </div>
                                <div className={styles.walletAddress}>
                                    {"0x5d...C26e2d"}
                                </div>
                            </div>
                            <CustomButton
                                type="login"
                                theme="dark"
                                icon="logout"
                                size={28}
                                className={styles.loginButton}
                            />
                        </li>
                    </>
                )}
            </ul>
        </div>
    );
};
