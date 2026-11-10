/**
 * Sound kit — three bespoke synthesized tones (assets/sounds). Lazy-loaded,
 * settings-gated, safe to call from anywhere.
 */

import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { useProfile } from "@/state/profile";

import tickWav from "../../assets/sounds/tick.wav";
import dropWav from "../../assets/sounds/drop.wav";
import solveWav from "../../assets/sounds/solve.wav";

type Name = "tick" | "drop" | "solve";

let players: Partial<Record<Name, AudioPlayer>> | null = null;
let modeSet = false;

function ensure(): Partial<Record<Name, AudioPlayer>> {
  if (!players) {
    players = {
      tick: createAudioPlayer(tickWav),
      drop: createAudioPlayer(dropWav),
      solve: createAudioPlayer(solveWav),
    };
    for (const p of Object.values(players)) p.volume = 0.55;
  }
  if (!modeSet && Platform.OS !== "web") {
    modeSet = true;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }
  return players;
}

export function playSound(name: Name): void {
  if (!useProfile.getState().settings.sound) return;
  try {
    const p = ensure()[name];
    if (!p) return;
    p.seekTo(0);
    p.play();
  } catch {
    // Audio is a garnish, never a crash.
  }
}
