import * as THREE from 'three';
import { createRobot } from './robot.js';
import { robotSequences } from './robots.js';
import { setupUI } from './ui.js';
import { setupVision } from './vision.js';

// 앱의 시작 지점: 장면, 카메라, 렌더러를 만들고 로봇과 UI를 연결합니다.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);
scene.add(new THREE.AmbientLight(0xffffff, 2));

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1, 5);
const cameraTarget = new THREE.Vector3(0, -0.2, 0);
camera.lookAt(cameraTarget);

const renderer = new THREE.WebGLRenderer({ antialias: true });
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.display = 'block';
renderer.domElement.style.cursor = 'grab';
renderer.domElement.style.touchAction = 'none';
document.body.appendChild(renderer.domElement);

const robot = createRobot(scene);
const render = () => renderer.render(scene, camera);
const robotControls = robot.controls;
let sequenceActive = false;
const ui = setupUI({
  scene,
  camera,
  cameraTarget,
  renderer,
  robotControls,
  sequences: robotSequences,
  onSequenceChange: (active) => { sequenceActive = active; }
});
setupVision({
  scene,
  camera,
  cameraTarget,
  touchTargets: robot.touchTargets,
  setGaze: robot.setGaze,
  setPetting: robot.setPetting,
  syncAngles: ui.syncAngles,
  getNeckAngles: () => ({ neckYaw: ui.getAngle('neckYaw'), neckPitch: ui.getAngle('neckPitch') }),
  isSequenceActive: () => sequenceActive,
  onTrackingChange: ui.setVisionRunning,
  render
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
});

renderer.render(scene, camera);
