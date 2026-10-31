// 로봇 모델과 조작할 수 있는 세 관절을 생성합니다.
import * as THREE from 'three';

export function createRobot(scene) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.2, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x88aadd })
  );
  body.position.y = -0.8;
  scene.add(body);

  const head = new THREE.Group();
  scene.add(head);

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  head.add(headMesh);

  // 눈을 얼굴 그룹에 넣어 얼굴과 함께 움직이도록 합니다.
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (const x of [-0.23, 0.23]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 16),
      eyeMaterial
    );
    eye.position.set(x, 0.08, 0.59);
    head.add(eye);
  }

  const armPivots = [];
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

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 20), shoulderMaterial);
    armPivot.add(shoulder);
  }

  return [
    { id: 'face', label: '얼굴 · Y축', pivot: head, axis: 'y' },
    { id: 'leftArm', label: '왼쪽 팔 · Z축', pivot: armPivots[0], axis: 'z' },
    { id: 'rightArm', label: '오른쪽 팔 · Z축', pivot: armPivots[1], axis: 'z' }
  ];
}
