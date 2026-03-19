import * as Tone from 'tone';

async function ensureAudio(): Promise<boolean> {
  try {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    return true;
  } catch {
    return false;
  }
}

export async function playPerfectJingle(): Promise<void> {
  if (!(await ensureAudio())) return;

  try {
    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.03, decay: 0.1, sustain: 0.4, release: 0.3 },
    }).toDestination();
    synth.volume.value = -12;

    const notes = ['C4', 'E4', 'G4', 'C5'];
    const now = Tone.now();

    for (let i = 0; i < notes.length; i++) {
      synth.triggerAttackRelease(notes[i], '8n', now + i * 0.12);
    }

    // Final note — slightly louder, longer release
    const finalSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.03, decay: 0.1, sustain: 0.5, release: 0.5 },
    }).toDestination();
    finalSynth.volume.value = -10;
    finalSynth.triggerAttackRelease('E5', '4n', now + 4 * 0.12);

    // Cleanup after sound finishes
    setTimeout(() => {
      synth.dispose();
      finalSynth.dispose();
    }, 2000);
  } catch {
    // Fail silently
  }
}

export async function playKindOfSound(): Promise<void> {
  if (!(await ensureAudio())) return;

  try {
    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.03, decay: 0.1, sustain: 0.3, release: 0.3 },
    }).toDestination();
    synth.volume.value = -14;

    const now = Tone.now();
    synth.triggerAttackRelease('C4', '8n', now);
    synth.triggerAttackRelease('E4', '8n', now + 0.15);

    setTimeout(() => synth.dispose(), 1500);
  } catch {
    // Fail silently
  }
}

export async function playFailSound(): Promise<void> {
  if (!(await ensureAudio())) return;

  try {
    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.1, release: 0.4 },
    }).toDestination();
    synth.volume.value = -16;

    synth.triggerAttackRelease('C3', '4n');

    setTimeout(() => synth.dispose(), 1500);
  } catch {
    // Fail silently
  }
}
