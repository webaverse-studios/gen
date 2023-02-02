import {useEffect, useRef, useState} from 'react';
import {makeDefaultCamera, makeRenderer, pushMeshes} from "../../zine/zine-utils.js";
import * as THREE from "three";
import {OrbitControls} from "../../../packages/three/examples/jsm/controls/OrbitControls.js";
import styles from "../../../styles/AvatarGenerator.module.css";
import {getMeshes} from "../../utils/mesh-utils.js";
import {editTexture} from "../../generators/avatar-generator.js";

// 3D Canvas to render avatar

const size = 512;
function SkinnedMesh3DRenderer(props) {
    // display the selected mesh by making every other part invisible
    const { mesh } = props;
    const containerRef = useRef(null);
    const textureCanvasRef = useRef(null);
    const [scene, setScene] = useState(null);

    useEffect(() => {
        // Create a scene and add the SkinnedMesh to it
        const objct = new THREE.Object3D();
        objct.add(mesh);
        const canvas = containerRef.current;
        const renderer = new AvatarRenderer(objct, canvas);
        setScene(renderer.scene);
        return () => {
            renderer.destroy();
        };

    }, [mesh, containerRef]);


    return (

        <canvas
            className={styles.canvas}
            width={size}
            height={size}
            ref={containerRef}
        />
    );
}

const defaultPrompt = 'Blue jean shorts, 3D model';

function MeshSelector(props) {
    const [prompt, setPrompt] = useState(defaultPrompt);
    const [symmetrical, setSymmetrical] = useState(false);
    const [imageAiModel, setImageAiModel] = useState('sd');
    const {model, renderer, projection_renderer, mask_renderer} = props;
    const meshes = getMeshes(model);
    const [selectedOption, setSelectedOption] = useState(meshes[0]);
    const options = meshes.map((mesh) => mesh.name);
    const [edited, setEdited] = useState(false);

    const handleChange = (event) => {
        const currentMesh = meshes.find((mesh) => mesh.name === event.target.value);
        setSelectedOption(currentMesh);
    };

    return (
        <div>
            <select className={styles.select} onChange={handleChange}>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
            <input type="text" className={styles.input} value={prompt} onChange={e => {
                setPrompt(e.target.value);
            }} placeholder={prompt} />
            <select className={styles.select} value={imageAiModel} onChange={e => {
                setImageAiModel(e.target.value);
            }}>
                <option value="sd">SD</option>
                <option value="openai">OpenAI</option>
            </select>
            <div className={styles.button} onClick={() => {editTexture(selectedOption.clone(), prompt, renderer, projection_renderer, mask_renderer, symmetrical)}}>Generate Texture</div>
            <input type={"checkbox"} className={styles.input} checked={symmetrical} onChange={e => {setSymmetrical(!symmetrical)}} title={"Mirror left view texture for right view"}/>
            <div>
                {selectedOption && <SkinnedMesh3DRenderer mesh={selectedOption.clone()} />}
            </div>

        </div>
    );
}

const Avatar3DCanvas = ({
                            model,
                            mesh,
                        }) => {
    const canvasRef = useRef();
    const [scene, setScene] = useState(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const renderer = new AvatarRenderer(model, canvas);
        setScene(renderer.scene);

        return () => {
            renderer.destroy();
        };
    }, [model, mesh, canvasRef.current]);

    return (
        <canvas
            className={styles.canvas}
            width={size}
            height={size}
            ref={canvasRef}
        />
    );
};

export class AvatarRenderer extends EventTarget {
    constructor(model, canvas) {
        super();

        this.canvas = canvas;
        this.model = model;

        canvas.width = size;
        canvas.height = size;
        canvas.classList.add('canvas');

        // create renderer
        const renderer = makeRenderer(canvas);
        this.renderer = renderer;
        this.addEventListener('destroy', e => {
            this.renderer.dispose();
        });

        // setup 3D scene
        const scene = new THREE.Scene();
        scene.autoUpdate = false;
        this.scene = scene;

        const camera = makeDefaultCamera();
        camera.position.set(0, 0.9, -2);
        camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        camera.updateMatrixWorld();
        this.camera = camera;

        // const light = new THREE.DirectionalLight(0xffffff, 0);
        // light.position.set(1, 2, 3);
        // light.updateMatrixWorld();
        // scene.add(light);
        //
        // const ambientLight = new THREE.AmbientLight(0xffffff, 0);
        // scene.add(ambientLight);

        const controls = new OrbitControls(camera, canvas);
        controls.minDistance = 1;
        controls.maxDistance = 100;
        const targetDistance = -camera.position.z;
        controls.target.copy(camera.position)
        controls.target.z = 0;
        controls.update();
        this.controls = controls;

        const avatars = new THREE.Object3D();

        avatars.add(model);
        model.updateMatrixWorld();
        scene.add(avatars);
        this.avatars = avatars;
        this.animate()
    }

    animate() {
        const _startLoop = () => {
            let frame;
            const _loop = () => {
                frame = requestAnimationFrame(_loop);
                this.renderer.render(this.scene, this.camera);
            };
            _loop();

            this.addEventListener('destroy', e => {
                cancelAnimationFrame(frame);
            });
        };
        _startLoop();
    }

    destroy() {
        this.dispatchEvent(new MessageEvent('destroy'));
    }
};


export const AvatarRendererComponent = ({
    model,
}) => {
    const renderer_3D= new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
    });
    renderer_3D.setSize(512, 512);
    renderer_3D.sortObjects = false;
    renderer_3D.physicallyCorrectLights = true;
    renderer_3D.outputEncoding = THREE.sRGBEncoding;
    renderer_3D.shadowMap.enabled = true;
    renderer_3D.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer_3D.setClearColor(0x000000, 0);
    const projection_renderer = new THREE.WebGLRenderer()
    const mask_renderer = new THREE.WebGLRenderer()

    useEffect(() => {
        renderer_3D.dispose();
        projection_renderer.dispose();
        mask_renderer.dispose();
    });

    return (

        <div className={styles.AvatarGenerator}>

            <Avatar3DCanvas model={model}/>
            <MeshSelector model={model} renderer={renderer_3D} projection_renderer={projection_renderer} mask_renderer={mask_renderer}/>
        </div>

    );
};