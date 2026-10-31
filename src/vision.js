import { FaceDetector, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

const VISION_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm';
const FACE_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const HAND_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export function setupVision({
  scene, camera, cameraTarget, touchTargets, setGaze, setPetting,
  syncAngles, getNeckAngles, isSequenceActive, onTrackingChange, render
}) {
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', '카메라 얼굴 및 손 추적');
  Object.assign(panel.style, {
    position: 'fixed', right: '16px', bottom: '16px', zIndex: '1',
    width: '240px', padding: '12px', borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.94)', color: '#20242b',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.16)',
    font: '14px/1.4 system-ui, sans-serif'
  });

  const title = document.createElement('strong');
  title.textContent = '얼굴·손 추적';
  title.style.display = 'block';
  title.style.marginBottom = '8px';
  panel.appendChild(title);

  const preview = document.createElement('div');
  Object.assign(preview.style, {
    display: 'none', position: 'relative', width: '100%',
    aspectRatio: '4 / 3', overflow: 'hidden', borderRadius: '8px', background: '#20242b'
  });

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  Object.assign(video.style, {
    display: 'block', width: '100%', height: '100%',
    objectFit: 'contain', transform: 'scaleX(-1)'
  });
  preview.appendChild(video);

  const overlay = document.createElement('canvas');
  Object.assign(overlay.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    transform: 'scaleX(-1)', pointerEvents: 'none'
  });
  preview.appendChild(overlay);
  panel.appendChild(preview);

  const status = document.createElement('p');
  status.textContent = '카메라가 꺼져 있습니다.';
  Object.assign(status.style, { margin: '0 0 8px', color: '#555d6b', fontSize: '12px' });
  panel.appendChild(status);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '카메라 켜기';
  Object.assign(button.style, {
    width: '100%', height: '34px', border: '1px solid #ccd2dc',
    borderRadius: '6px', background: '#fff', cursor: 'pointer'
  });
  panel.appendChild(button);
  document.body.appendChild(panel);

  const overlayContext = overlay.getContext('2d');
  const palmLandmarkIndices = [0, 1, 5, 9, 13, 17];
  const fingerDefinitions = [
    { indices: [1, 2, 3, 4], width: 0.95 },
    { indices: [5, 6, 7, 8], width: 0.76 },
    { indices: [9, 10, 11, 12], width: 0.82 },
    { indices: [13, 14, 15, 16], width: 0.74 },
    { indices: [17, 18, 19, 20], width: 0.65 }
  ];
  // 웹캠 좌표를 앱 시작 시점의 고정된 3D 평면에 매핑합니다.
  // 이후 사용자가 뷰 카메라를 회전하거나 줌해도 손은 월드 좌표에 남습니다.
  camera.updateMatrixWorld(true);
  const trackingForward = camera.getWorldDirection(new THREE.Vector3()).normalize();
  const trackingRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const trackingUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  const trackingDistance = camera.position.distanceTo(cameraTarget) * 0.55;
  const trackingPlaneOrigin = camera.position.clone().addScaledVector(trackingForward, trackingDistance);
  const trackingHalfHeight = trackingDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const trackingHalfWidth = trackingHalfHeight * camera.aspect;
  const assumedWebcamHFov = THREE.MathUtils.degToRad(62);
  const assumedHandSpanMeters = 0.2;
  const referenceHandDistanceMeters = 0.65;
  const handMeshSize = 0.85;
  const sceneUnitsPerMeter = trackingHalfWidth / (
    referenceHandDistanceMeters * Math.tan(assumedWebcamHFov / 2)
  );
  const touchRaycaster = new THREE.Raycaster();
  const previousPalmPositions = [];
  let lastStrokeTime = 0;
  let currentContact = null;
  let lastContactTime = 0;
  const contactMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.07, 0.1, 32),
    new THREE.MeshBasicMaterial({ color: 0xff68aa, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
  );
  contactMarker.visible = false;
  scene.add(contactMarker);

  function estimateHandPosition(landmarks) {
    const xs = landmarks.map((point) => point.x);
    const ys = landmarks.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const pixelWidth = (right - left) * video.videoWidth;
    const pixelHeight = (bottom - top) * video.videoHeight;
    const apparentSizePixels = Math.max(pixelWidth, pixelHeight, 1);
    const focalPixels = video.videoWidth / (2 * Math.tan(assumedWebcamHFov / 2));
    const distanceMeters = THREE.MathUtils.clamp(
      focalPixels * assumedHandSpanMeters / apparentSizePixels,
      0.3,
      0.8
    );

    function projectPoint(x, y) {
      const cameraX = (0.5 - x) * video.videoWidth / focalPixels * distanceMeters;
      const cameraY = (0.5 - y) * video.videoHeight / focalPixels * distanceMeters;
      return trackingPlaneOrigin.clone()
        .addScaledVector(trackingRight, cameraX * sceneUnitsPerMeter)
        .addScaledVector(trackingUp, cameraY * sceneUnitsPerMeter)
        .addScaledVector(
          trackingForward,
          (distanceMeters - referenceHandDistanceMeters) * sceneUnitsPerMeter
        );
    }

    const centerZ = landmarks.reduce((sum, point) => sum + point.z, 0) / landmarks.length;
    return {
      centerX,
      centerY,
      centerZ,
      apparentSizePixels,
      distanceMeters,
      position: projectPoint(centerX, centerY),
      projectPoint
    };
  }
  function createSurfaceGeometry(vertexCount, triangles) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    geometry.setIndex(triangles.flat());
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    return geometry;
  }

  const palmTriangles = Array.from({ length: palmLandmarkIndices.length }, (_, index) => [
    0, index + 1, (index + 1) % palmLandmarkIndices.length + 1
  ]);
  const ribbonTriangles = Array.from({ length: 3 }, (_, index) => {
    const left = index * 2;
    const right = left + 1;
    return [[left, right, left + 2], [right, right + 2, left + 2]];
  }).flat();
  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2a879, roughness: 0.72, metalness: 0, side: THREE.DoubleSide
  });
  const palmMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6b68e, roughness: 0.72, metalness: 0, side: THREE.DoubleSide
  });

  const handRigs = Array.from({ length: 1 }, () => {
    const group = new THREE.Group();
    const palmGeometry = createSurfaceGeometry(palmLandmarkIndices.length + 1, palmTriangles);
    const palm = new THREE.Mesh(palmGeometry, palmMaterial);
    group.add(palm);

    const fingers = fingerDefinitions.map((definition) => {
      const geometry = createSurfaceGeometry(8, ribbonTriangles);
      const finger = new THREE.Mesh(geometry, surfaceMaterial);
      group.add(finger);
      return { mesh: finger, geometry, definition };
    });

    scene.add(group);
    group.visible = false;
    return {
      group, palmGeometry, fingers,
      landmarks: null, renderLandmarks: null, lastSeen: 0,
      contactOffset: 0, targetContactOffset: 0
    };
  });

  function updateHandRigs(now) {
    for (const rig of handRigs) {
      if (!rig.landmarks || now - rig.lastSeen > 450) {
        rig.group.visible = false;
        continue;
      }

      rig.group.visible = true;
      if (!rig.renderLandmarks) {
        rig.renderLandmarks = rig.landmarks.map((landmark) => ({ ...landmark }));
      }
      for (let i = 0; i < rig.landmarks.length; i += 1) {
        for (const coordinate of ['x', 'y', 'z']) {
          rig.renderLandmarks[i][coordinate] += (rig.landmarks[i][coordinate] - rig.renderLandmarks[i][coordinate]) * 0.24;
        }
      }

      const estimate = estimateHandPosition(rig.renderLandmarks);
      rig.contactOffset += (rig.targetContactOffset - rig.contactOffset) * 0.24;
      const modelScale = handMeshSize / estimate.apparentSizePixels;
      const points = rig.renderLandmarks.map((landmark) => {
        const localX = -(landmark.x - estimate.centerX) * video.videoWidth * modelScale;
        const localY = -(landmark.y - estimate.centerY) * video.videoHeight * modelScale;
        const localZ = (landmark.z - estimate.centerZ) * video.videoWidth * modelScale;
        return estimate.position.clone()
          .addScaledVector(trackingRight, localX)
          .addScaledVector(trackingUp, localY)
          .addScaledVector(trackingForward, localZ + rig.contactOffset);
      });

      const palmPoints = palmLandmarkIndices.map((index) => points[index]);
      const palmCenter = palmPoints.reduce((center, point) => center.add(point), new THREE.Vector3())
        .multiplyScalar(1 / palmPoints.length);
      const palmPosition = rig.palmGeometry.attributes.position;
      palmPosition.setXYZ(0, palmCenter.x, palmCenter.y, palmCenter.z);
      palmPoints.forEach((point, index) => palmPosition.setXYZ(index + 1, point.x, point.y, point.z));
      palmPosition.needsUpdate = true;
      rig.palmGeometry.computeVertexNormals();
      rig.palmGeometry.computeBoundingSphere();

      const fingerGap = (
        points[5].distanceTo(points[9]) +
        points[9].distanceTo(points[13]) +
        points[13].distanceTo(points[17])
      ) / 3;

      for (const finger of rig.fingers) {
        const centers = finger.definition.indices.map((index) => points[index]);
        const widths = [1, 0.82, 0.62, 0.12].map((scale) => fingerGap * finger.definition.width * scale);
        const positions = finger.geometry.attributes.position;

        for (let index = 0; index < centers.length; index += 1) {
          const previous = centers[Math.max(0, index - 1)];
          const next = centers[Math.min(centers.length - 1, index + 1)];
          const tangent = next.clone().sub(previous);
          const perpendicular = trackingRight.clone().multiplyScalar(-tangent.dot(trackingUp))
            .addScaledVector(trackingUp, tangent.dot(trackingRight)).normalize();
          const offset = perpendicular.multiplyScalar(widths[index] / 2);
          const left = centers[index].clone().add(offset);
          const right = centers[index].clone().sub(offset);
          positions.setXYZ(index * 2, left.x, left.y, left.z);
          positions.setXYZ(index * 2 + 1, right.x, right.y, right.z);
        }

        positions.needsUpdate = true;
        finger.geometry.computeVertexNormals();
        finger.geometry.computeBoundingSphere();
      }
    }
  }

  let stream = null;
  let detector = null;
  let handLandmarker = null;
  let detectionFrame = null;
  let lastDetectionTime = 0;
  let lastTargetTime = 0;
  let targetX = 0;
  let targetY = 0;
  let gazeX = 0;
  let gazeY = 0;
  let selectedKind = null;
  let sequenceWasActive = false;

  function drawDetections(targets) {
    if (!video.videoWidth || !video.videoHeight) return;
    if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }

    overlayContext.clearRect(0, 0, overlay.width, overlay.height);
    overlayContext.strokeStyle = '#35d07f';
    overlayContext.lineWidth = Math.max(2, overlay.width / 240);
    for (const target of targets) {
      overlayContext.strokeStyle = target.kind === 'face' ? '#35d07f' : '#42b9ff';
      overlayContext.strokeRect(target.box.x, target.box.y, target.box.width, target.box.height);
    }
  }

  function stopVision(message = '카메라가 꺼져 있습니다.') {
    if (detectionFrame !== null) cancelAnimationFrame(detectionFrame);
    detectionFrame = null;
    detector?.close();
    detector = null;
    handLandmarker?.close();
    handLandmarker = null;
    for (const rig of handRigs) {
      rig.landmarks = null;
      rig.renderLandmarks = null;
      rig.group.visible = false;
    }
    previousPalmPositions.length = 0;
    currentContact = null;
    contactMarker.visible = false;
    lastStrokeTime = 0;
    setPetting(false);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    preview.style.display = 'none';
    overlayContext.clearRect(0, 0, overlay.width, overlay.height);
    targetX = 0;
    targetY = 0;
    selectedKind = null;
    gazeX = 0;
    gazeY = 0;
    if (!isSequenceActive()) {
      setGaze(0, 0);
      syncAngles({ neckYaw: 0, neckPitch: 0 });
    }
    onTrackingChange(false);
    render();
    status.textContent = message;
    button.textContent = '카메라 켜기';
  }

  function startTracking() {
    function update(now) {
      if (!stream || !detector) return;

      if (now - lastDetectionTime >= 100 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        lastDetectionTime = now;
        const faceResult = detector.detectForVideo(video, now);
        const handResult = handLandmarker.detectForVideo(video, now);
        const faces = faceResult.detections
          .filter((detection) => detection.boundingBox && (detection.categories[0]?.score ?? 0) >= 0.5)
          .map((detection) => {
            const box = detection.boundingBox;
            const area = (box.width * box.height) / (video.videoWidth * video.videoHeight);
            return {
              kind: 'face',
              box: { x: box.originX, y: box.originY, width: box.width, height: box.height },
              centerX: (box.originX + box.width / 2) / video.videoWidth,
              centerY: (box.originY + box.height / 2) / video.videoHeight,
              // 실제 얼굴 크기를 기준으로 한 화면 점유율을 거리 근사값으로 씁니다.
              proximity: area / 0.025
            };
          });
        for (let index = 0; index < handRigs.length; index += 1) {
          if (handResult.landmarks[index]) {
            handRigs[index].landmarks = handResult.landmarks[index];
            handRigs[index].lastSeen = now;
          } else if (now - handRigs[index].lastSeen > 450) {
            handRigs[index].landmarks = null;
          }
        }

        const handContacts = handResult.landmarks.map((landmarks, index) => {
          const palmIndices = [0, 5, 9, 13, 17];
          const palmX = palmIndices.reduce((sum, pointIndex) => sum + landmarks[pointIndex].x, 0) / palmIndices.length;
          const palmY = palmIndices.reduce((sum, pointIndex) => sum + landmarks[pointIndex].y, 0) / palmIndices.length;
          const palmZ = palmIndices.reduce((sum, pointIndex) => sum + landmarks[pointIndex].z, 0) / palmIndices.length;
          const handEstimate = estimateHandPosition(landmarks);
          const palmWorld = handEstimate.projectPoint(palmX, palmY)
            .addScaledVector(trackingForward, palmZ * 1.2);
          const previousPalm = previousPalmPositions[index];
          const movement = previousPalm ? Math.hypot(palmX - previousPalm.x, palmY - previousPalm.y) : 0;
          previousPalmPositions[index] = { x: palmX, y: palmY };

          scene.updateMatrixWorld(true);
          touchRaycaster.set(palmWorld, trackingForward);
          const hit = touchRaycaster.intersectObjects(touchTargets, false)[0] ?? null;
          if (hit && movement > 0.004) lastStrokeTime = now;

          return { hit, palmX, palmY, palmWorld, movement, index };
        });
        previousPalmPositions.length = handResult.landmarks.length;

        const contact = handContacts.find((item) => item.hit);
        currentContact = contact?.hit ?? null;
        if (currentContact) lastContactTime = now;
        else if (now - lastContactTime > 650) lastStrokeTime = 0;
        const isPetting = Boolean(contact && now - lastStrokeTime < 650);
        setPetting(isPetting);

        for (let index = 0; index < handRigs.length; index += 1) {
          const hit = handContacts[index]?.hit;
          handRigs[index].targetContactOffset = hit ? hit.distance - 0.025 : 0;
        }

        const hands = handResult.landmarks.map((landmarks, index) => {
          const xs = landmarks.map((point) => point.x);
          const ys = landmarks.map((point) => point.y);
          const left = Math.min(...xs);
          const right = Math.max(...xs);
          const top = Math.min(...ys);
          const bottom = Math.max(...ys);
          const width = (right - left) * video.videoWidth;
          const height = (bottom - top) * video.videoHeight;
          const area = ((right - left) * (bottom - top));
          return {
            kind: 'hand',
            box: { x: left * video.videoWidth, y: top * video.videoHeight, width, height },
            centerX: (left + right) / 2,
            centerY: (top + bottom) / 2,
            proximity: area / 0.018,
            distanceMeters: estimateHandPosition(landmarks).distanceMeters,
            landmarks,
            handIndex: index
          };
        });
        const targets = [...faces, ...hands].sort((a, b) => b.proximity - a.proximity);

        // 가까운 대상을 따라가되, 면적 차이가 작으면 현재 대상을 유지해 전환 깜빡임을 줄입니다.
        let target = targets[0];
        const currentTarget = targets.find((item) => item.kind === selectedKind);
        if (currentTarget && target && target.kind !== selectedKind && target.proximity < currentTarget.proximity * 1.2) {
          target = currentTarget;
        }

        drawDetections(targets);
        if (target) {
          // 미리보기는 거울처럼 표시하므로 좌우 좌표도 화면 기준으로 반전합니다.
          targetX = (1 - target.centerX) * 2 - 1;
          targetY = (0.5 - target.centerY) * 2;
          lastTargetTime = now;
          selectedKind = target.kind;
          status.textContent = target.kind === 'hand'
            ? `손 추적 중 · 약 ${target.distanceMeters.toFixed(2)}m · 얼굴 ${faces.length} / 손 ${hands.length}`
            : `얼굴 추적 중 · 얼굴 ${faces.length} / 손 ${hands.length}`;
        } else if (now - lastTargetTime > 600) {
          targetX = 0;
          targetY = 0;
          selectedKind = null;
          status.textContent = '얼굴과 손을 찾는 중…';
        }

        if (isPetting) status.textContent = '쓰다듬는 중 💗';
        else if (contact) status.textContent = '손이 로봇에 닿았어요';
      }

      // 시퀀스 중에는 목을 시퀀스에 맡기고, 끝나면 현재 각도에서 추적을 재개합니다.
      const sequenceActive = isSequenceActive();
      if (!sequenceActive) {
        if (sequenceWasActive) {
          const neckAngles = getNeckAngles();
          gazeX = THREE.MathUtils.degToRad(neckAngles.neckYaw) / 0.55;
          gazeY = -THREE.MathUtils.degToRad(neckAngles.neckPitch) / 0.35;
        }
        gazeX += (targetX - gazeX) * 0.16;
        gazeY += (targetY - gazeY) * 0.16;
        setGaze(gazeX, gazeY);
        syncAngles({
          neckYaw: gazeX * 0.55 * 180 / Math.PI,
          neckPitch: -gazeY * 0.35 * 180 / Math.PI
        });
      }
      sequenceWasActive = sequenceActive;
      updateHandRigs(now);
      if (currentContact && now - lastContactTime < 250) {
        const normal = currentContact.face?.normal?.clone() ?? new THREE.Vector3(0, 0, 1);
        if (currentContact.face) {
          normal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(currentContact.object.matrixWorld)).normalize();
        }
        contactMarker.position.copy(currentContact.point).addScaledVector(normal, 0.012);
        contactMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        contactMarker.scale.setScalar(lastStrokeTime && now - lastStrokeTime < 650 ? 1 + Math.sin(now * 0.018) * 0.12 : 1);
        contactMarker.visible = true;
      } else {
        contactMarker.visible = false;
      }
      render();
      detectionFrame = requestAnimationFrame(update);
    }

    detectionFrame = requestAnimationFrame(update);
  }

  button.addEventListener('click', async () => {
    if (stream) {
      stopVision();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = '이 환경에서는 카메라를 사용할 수 없습니다.';
      return;
    }

    onTrackingChange(true);
    button.disabled = true;
    status.textContent = '카메라 연결 중…';

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      video.srcObject = stream;
      preview.style.display = 'block';
      await video.play();
      if (video.videoWidth && video.videoHeight) {
        preview.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      }

      status.textContent = '얼굴 추적 모델을 불러오는 중…';
      const fileset = await FilesetResolver.forVisionTasks(VISION_WASM_PATH);
      detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_PATH },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5
      });
      handLandmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL_PATH },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      lastDetectionTime = 0;
      lastTargetTime = 0;
      button.textContent = '카메라 끄기';
      status.textContent = '얼굴과 손을 찾는 중…';
      startTracking();
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopVision(), { once: true });
    } catch (error) {
      stopVision(error.name === 'NotAllowedError'
        ? '카메라 권한이 허용되지 않았습니다.'
        : '카메라 또는 인식 모델을 불러오지 못했습니다.');
    } finally {
      button.disabled = false;
    }
  });
}
