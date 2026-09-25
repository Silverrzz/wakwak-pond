export const clockModes = [
  { value: 'clock', label: 'Game clock' },
  { value: 'movetime', label: 'Fixed time per move' },
  { value: 'unlimited', label: 'No game clock' }
];
export const bonusTypes = [
  { value: 'increment', label: 'Increment' },
  { value: 'delay', label: 'Simple delay' },
  { value: 'bronstein', label: 'Bronstein' }
];
export const defaultControl = () => ({
  mode: 'clock',
  stages: [{ moves: 0, time: 300000, kind: 'increment', bonus: 3000 }]
});

export function presetControl(preset, fixedSeconds, engineSeconds) {
  if (preset === 'movetime')
    return { mode: 'movetime', milliseconds: Math.round(Number(fixedSeconds) * 1000) };
  if (preset === 'unlimited')
    return { mode: 'unlimited', engineTime: Math.round(Number(engineSeconds) * 1000) };
  if (preset === 'staged')
    return {
      mode: 'clock',
      stages: [
        { moves: 40, time: 5400000, kind: 'increment', bonus: 30000 },
        { moves: 0, time: 1800000, kind: 'increment', bonus: 30000 }
      ]
    };
  const [minutes, increment] = preset.split('+').map(Number);
  return {
    mode: 'clock',
    stages: [{ moves: 0, time: minutes * 60000, kind: 'increment', bonus: increment * 1000 }]
  };
}
