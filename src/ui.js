import * as THREE from 'three';

// 화면 조작(카메라 회전/줌), 관절 버튼, 저장된 동작 시퀀스를 연결합니다.
export function setupUI({ scene, camera, cameraTarget, renderer, robotControls, sequences }) {
  let isDragging = false;
  let previousPointer = { x: 0, y: 0 };
  let cameraAzimuth = 0;
  let cameraPolar = Math.acos(
    THREE.MathUtils.clamp(
      (camera.position.y - cameraTarget.y) / camera.position.distanceTo(cameraTarget),
      -1,
      1
    )
  );
  let cameraDistance = camera.position.distanceTo(cameraTarget);

  function render() {
    renderer.render(scene, camera);
  }

  function updateCamera() {
    const sinPolar = Math.sin(cameraPolar);
    camera.position.set(
      cameraTarget.x + cameraDistance * sinPolar * Math.sin(cameraAzimuth),
      cameraTarget.y + cameraDistance * Math.cos(cameraPolar),
      cameraTarget.z + cameraDistance * sinPolar * Math.cos(cameraAzimuth)
    );
    camera.lookAt(cameraTarget);
    render();
  }

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (event) => {
    isDragging = true;
    previousPointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!isDragging) return;

    const deltaX = event.clientX - previousPointer.x;
    const deltaY = event.clientY - previousPointer.y;
    previousPointer = { x: event.clientX, y: event.clientY };
    cameraAzimuth -= deltaX * 0.01;
    cameraPolar = THREE.MathUtils.clamp(cameraPolar - deltaY * 0.01, 0.15, Math.PI - 0.15);
    updateCamera();
  });

  function stopDragging() {
    isDragging = false;
    canvas.style.cursor = 'grab';
  }

  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraDistance = THREE.MathUtils.clamp(cameraDistance * (1 + event.deltaY * 0.001), 2.5, 10);
    updateCamera();
  }, { passive: false });

  const panel = document.createElement('section');
  panel.setAttribute('aria-label', '로봇 조작');
  Object.assign(panel.style, {
    position: 'fixed', top: '16px', right: '16px', zIndex: '1',
    width: '250px', padding: '14px', borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.94)', color: '#20242b',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.16)',
    font: '14px/1.4 system-ui, sans-serif'
  });

  function addHeading(text, marginTop = '0') {
    const heading = document.createElement('strong');
    heading.textContent = text;
    Object.assign(heading.style, { display: 'block', marginTop, marginBottom: '8px' });
    panel.appendChild(heading);
  }

  addHeading('관절 조작');

  const currentAngles = new Map(robotControls.map((control) => [control.id, 0]));
  const angleLabels = new Map();
  const jointButtons = [];

  function setAngle(control, angle) {
    currentAngles.set(control.id, angle);
    control.pivot.rotation[control.axis] = THREE.MathUtils.degToRad(angle);
    const label = angleLabels.get(control.id);
    if (label) label.textContent = `${Math.round(angle)}°`;
  }

  for (const control of robotControls) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'grid', gridTemplateColumns: '1fr 34px 34px 48px',
      alignItems: 'center', gap: '5px', marginTop: '7px'
    });

    const label = document.createElement('span');
    label.textContent = control.label;
    label.style.fontSize = '12px';
    row.appendChild(label);

    const angleLabel = document.createElement('span');
    angleLabel.textContent = '0°';
    angleLabel.style.textAlign = 'right';
    angleLabels.set(control.id, angleLabel);

    for (const [step, text] of [[-1, '−'], [1, '+']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('aria-label', `${control.label} ${step < 0 ? '감소' : '증가'}`);
      Object.assign(button.style, {
        height: '30px', border: '1px solid #ccd2dc', borderRadius: '6px',
        background: '#fff', fontSize: '18px', cursor: 'pointer'
      });
      button.addEventListener('click', () => {
        const nextAngle = THREE.MathUtils.clamp(currentAngles.get(control.id) + step * 15, -90, 90);
        setAngle(control, nextAngle);
        render();
      });
      jointButtons.push(button);
      row.appendChild(button);
    }

    row.appendChild(angleLabel);
    panel.appendChild(row);
  }

  addHeading('동작 시퀀스', '16px');

  const sequenceButtons = [];
  const stopButton = document.createElement('button');
  stopButton.type = 'button';
  stopButton.textContent = '시퀀스 멈추기';
  Object.assign(stopButton.style, {
    width: '100%', height: '32px', marginTop: '8px',
    border: '1px solid #ccd2dc', borderRadius: '6px',
    background: '#f5f6f8', cursor: 'pointer'
  });
  stopButton.disabled = true;
  stopButton.style.opacity = '0.5';

  let activeSequence = false;
  let animationFrame = null;
  let animationToken = 0;
  let resolveAnimation = null;

  function animatePose(targetPose, duration, token) {
    const startPose = Object.fromEntries(currentAngles);
    const startTime = performance.now();

    return new Promise((resolve) => {
      resolveAnimation = resolve;

      function frame(now) {
        if (token !== animationToken) {
          resolveAnimation = null;
          resolve(false);
          return;
        }

        const progress = Math.min((now - startTime) / duration, 1);
        const eased = progress * progress * (3 - 2 * progress);

        for (const control of robotControls) {
          const from = startPose[control.id] ?? 0;
          const to = targetPose[control.id] ?? from;
          setAngle(control, from + (to - from) * eased);
        }
        render();

        if (progress < 1) {
          animationFrame = requestAnimationFrame(frame);
        } else {
          animationFrame = null;
          resolveAnimation = null;
          resolve(true);
        }
      }

      animationFrame = requestAnimationFrame(frame);
    });
  }

  function setSequenceRunning(running) {
    activeSequence = running;
    for (const button of [...jointButtons, ...sequenceButtons]) {
      button.disabled = running;
      button.style.opacity = running ? '0.55' : '1';
      button.style.cursor = running ? 'default' : 'pointer';
    }
    stopButton.disabled = !running;
    stopButton.style.opacity = running ? '1' : '0.5';
  }

  async function playSequence(sequence) {
    if (activeSequence) return;
    setSequenceRunning(true);
    const token = ++animationToken;

    for (const step of sequence.steps) {
      const targetPose = Object.fromEntries(currentAngles);
      for (const [id, angle] of Object.entries(step.pose)) {
        targetPose[id] = THREE.MathUtils.clamp(angle, -90, 90);
      }
      const completed = await animatePose(targetPose, step.duration, token);
      if (!completed) return;
    }

    setSequenceRunning(false);
  }

  stopButton.addEventListener('click', () => {
    if (!activeSequence) return;
    animationToken += 1;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    const resolve = resolveAnimation;
    resolveAnimation = null;
    resolve?.(false);
    setSequenceRunning(false);
  });

  for (const sequence of sequences) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = sequence.name;
    Object.assign(button.style, {
      width: '100%', height: '34px', marginTop: '6px',
      border: '1px solid #ccd2dc', borderRadius: '6px',
      background: '#fff', textAlign: 'left', padding: '0 10px', cursor: 'pointer'
    });
    button.addEventListener('click', () => playSequence(sequence));
    sequenceButtons.push(button);
    panel.appendChild(button);
  }

  panel.appendChild(stopButton);
  document.body.appendChild(panel);
}
