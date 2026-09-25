export const variants = [
  { value: 'duck', label: 'Duck' },
  { value: 'duck960', label: 'Duck960' },
  { value: 'duckdfrc', label: 'Duck double FRC' }
];
export const timePresets = [
  { value: '3+2', label: '3 min + 2 sec' },
  { value: '5+3', label: '5 min + 3 sec' },
  { value: '10+0', label: '10 min' },
  { value: '15+10', label: '15 min + 10 sec' },
  { value: '90+30', label: '90 min + 30 sec' },
  { value: 'staged', label: '40/90, then 30 min + 30 sec' },
  { value: 'custom', label: 'Custom…' },
  { value: 'movetime', label: 'Time per move' },
  { value: 'unlimited', label: 'Unlimited' }
];
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
