// 버튼으로 실행할 로봇 동작 시퀀스입니다. 각도는 도 단위입니다.
// 각 단계는 지정한 관절만 목표 각도로 움직이고 나머지는 현재 각도를 유지합니다.
export const robotSequences = [
  {
    id: 'greet',
    name: '손 흔들며 반기기',
    steps: [
      { duration: 350, pose: { neckYaw: -18, leftArm: -58 } },
      { duration: 220, pose: { leftArm: -32 } },
      { duration: 220, pose: { leftArm: -65 } },
      { duration: 220, pose: { leftArm: -32 } },
      { duration: 220, pose: { leftArm: -65 } },
      { duration: 450, pose: { neckYaw: 0, neckPitch: 0, leftArm: 0 } }
    ]
  },
  {
    id: 'welcome',
    name: '양팔로 환영하기',
    steps: [
      { duration: 500, pose: { neckYaw: 18, leftArm: -55, rightArm: 55 } },
      { duration: 350, pose: { neckYaw: -18 } },
      { duration: 350, pose: { neckYaw: 18 } },
      { duration: 500, pose: { neckYaw: 0, neckPitch: 0, leftArm: 0, rightArm: 0 } }
    ]
  },
  {
    id: 'cheer',
    name: '양팔 흔들기',
    steps: [
      { duration: 400, pose: { leftArm: -50, rightArm: 50 } },
      { duration: 250, pose: { leftArm: -25, rightArm: 25 } },
      { duration: 250, pose: { leftArm: -60, rightArm: 60 } },
      { duration: 250, pose: { leftArm: -25, rightArm: 25 } },
      { duration: 250, pose: { leftArm: -60, rightArm: 60 } },
      { duration: 450, pose: { neckYaw: 0, neckPitch: 0, leftArm: 0, rightArm: 0 } }
    ]
  }
];
