# Stillwater

**A recursive tree you can play.**

Sweep across the canopy and its branches sound like strings. Let the tree play its own score, or record a gesture and save the resulting music. Built for Hub’s Quest, Epoch 1.

![The Stillwater instrument in Moonlit Lagoon, with branches suspended over a foggy pool](submission/stillwater-preview.png)

[Watch the demo](submission/stillwater-demo.mp4) · [Hear the recursive score](submission/moonlit-lagoon.wav) · [Hear a recorded gesture](submission/by-hand.wav) · [Demo walkthrough](submission/DEMO.md)

## Open the instrument

Open `dist/index.html` in a current browser. Keep it beside the other files in `dist/` so the instrument can load its styles, bundle and backdrop. The checked-in bundle works offline and needs no server or installation. The same directory can be deployed on any static host.

## Play the tree

1. **Touch or drag** across branches to play their notes. The displayed keys and **Explore branches** provide keyboard and touch alternatives.
2. **Shape the score** with Depth, Spread, Branch length, Tempo and Seed. Switch between Moonlit Lagoon, Cedar Rain and Violet Hour for different scales, timbres and ambience.
3. **Play** the recursive score or **Record a take** to keep up to 24 seconds of your own timing. Finish the take, then click the track name above the waveform to switch between the take and the recursive score. One take stays available for the current session.
4. **Download WAV** to save the selected track as 44.1 kHz stereo, 16-bit PCM, including harmony, ambience and the effect tail. The transport includes seek, restart, loop and volume.

## How the tree turns into music

`grow()` makes a branch and schedules its note, then calls itself on two smaller branches. The terminal call contributes its note and returns. The automatic score visits the parent, the left subtree and then the right. At depth five, the same recursion makes 63 branches and 63 scheduled notes.

| Part of the recursion | Musical result |
| --- | --- |
| Left and right turns | Distinct steps in the scene’s scale |
| Depth and terminal calls | Quieter, shorter notes deeper in the tree and closer spacing at the tips |
| Horizontal position | Stereo placement follows the branch |
| The first split | Low sustained tones follow the two main subtrees |
| Seed | Repeatable variation in melody, timing and shape |

A recorded gesture reuses the branch notes and stereo positions while preserving the player’s timing and repeated notes. Branches and waveforms follow the selected score during playback. A branch sound sets off a surface ripple and a brief reflection of its color around the screen.

## Technology

- **Canvas 2D and Pointer Events** draw the tree and map a pointer stroke to branch notes. Mouse, touch and the displayed keys share the same instrument. [Pointer Events specification](https://www.w3.org/TR/pointerevents3/)
- **WebGL 2 and GLSL** calculate overlapping ripples, mist and pointer light. A Canvas renderer covers browsers with WebGL disabled. Reduced motion keeps the note feedback and removes moving effects. [WebGL 2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/)
- **Web Audio** synthesizes every voice, the filtered water or rain bed, and seeded stereo reverb. Offline rendering provides the waveform, playback buffer and exported WAV for each score. Audio processing stays in the browser. [Web Audio specification](https://www.w3.org/TR/webaudio/)
- **esbuild** bundles the browser modules at build time, with browser APIs providing the runtime. The low-light lagoon backdrop was created for Stillwater with ImageGen. [esbuild documentation](https://esbuild.github.io/)

## Develop and verify

With Node.js installed, run the commands below from the repository root.

```sh
npm ci
npm test
npm run build
```

The tests cover termination, parent–child geometry, traversal order, seed repeatability, gesture timing and WAV encoding. For a local HTTP preview with Python 3, run `python -m http.server 8765 --bind 127.0.0.1 --directory dist` and open `http://127.0.0.1:8765`.
