// 로봇 모델과 조작할 수 있는 세 관절을 생성합니다.
import * as THREE from 'three';

export function createRobot(scene) {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x88aadd });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.2, 0.6),
    bodyMaterial
  );
  body.position.y = -0.8;
  scene.add(body);

  // 목 피벗을 몸통 위에 두고 얼굴을 그 위에 붙입니다.
  const neckPivot = new THREE.Group();
  neckPivot.position.y = -0.2;
  scene.add(neckPivot);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 0.45, 20),
    new THREE.MeshStandardMaterial({ color: 0x667da0 })
  );
  neck.position.y = -0.225;
  neckPivot.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.2;
  neckPivot.add(head);

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  head.add(headMesh);

  // 눈은 얼굴에 고정하고, 시선은 목 피벗을 돌려 맞춥니다.
  const eyeWhiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (const x of [-0.23, 0.23]) {
    const eye = new THREE.Group();
    eye.position.set(x, 0.08, 0.57);
    head.add(eye);

    const white = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 20), eyeWhiteMaterial);
    eye.add(white);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), pupilMaterial);
    pupil.position.z = 0.075;
    eye.add(pupil);
  }

  const armPivots = [];
  const touchTargets = [body, neck, headMesh];
  const armMaterial = new THREE.MeshStandardMaterial({ color: 0x6688bb });
  const shoulderMaterial = new THREE.MeshStandardMaterial({ color: 0x445f8c });

  for (const side of [-1, 1]) {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.58, -0.35, 0);
    scene.add(armPivot);
    armPivots.push(armPivot);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.72, 0.34), armMaterial);
    arm.position.set(side * 0.16, -0.34, 0);
    armPivot.add(arm);
    touchTargets.push(arm);

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 20), shoulderMaterial);
    armPivot.add(shoulder);
    touchTargets.push(shoulder);
  }

  return {
    touchTargets,
    controls: [
      { id: 'neckYaw', label: '목 · 좌우', pivot: neckPivot, axis: 'y' },
      { id: 'neckPitch', label: '목 · 상하', pivot: neckPivot, axis: 'x' },
      { id: 'leftArm', label: '왼쪽 팔 · Z축', pivot: armPivots[0], axis: 'z' },
      { id: 'rightArm', label: '오른쪽 팔 · Z축', pivot: armPivots[1], axis: 'z' }
    ],
    setGaze(x, y) {
      neckPivot.rotation.y = THREE.MathUtils.clamp(x, -1, 1) * 0.55;
      neckPivot.rotation.x = -THREE.MathUtils.clamp(y, -1, 1) * 0.35;
    },
    setPetting(active) {
      bodyMaterial.emissive.setHex(active ? 0x57253c : 0x000000);
      bodyMaterial.emissiveIntensity = active ? 0.7 : 0;
    }
  };
}
