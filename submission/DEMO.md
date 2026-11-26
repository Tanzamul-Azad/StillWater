# Stillwater judging walkthrough (2 minutes)

**Stillwater is a recursive function you can hear.** Each call is a branch, a span of time and a voice. The chord you hear is the live call stack.

**Demo video:** [`submission/stillwater-demo.mp4`](stillwater-demo.mp4) · **Interface preview:** [`submission/stillwater-interface.jpg`](stillwater-interface.jpg)

1. **Open the [live site](https://tanzamul-azad.github.io/StillWater/) with headphones and press *Play the score*.** The tree grows in call order, then the music starts with gentle water & cricket ambience (`28%`). The low drone is the trunk call and the quick bells are the leaf calls.
2. **Watch `grow.js` beside the tree.** It works like a debugger that sings. The markers show where every running frame is paused. Click any frame in the Call stack to hear it, or double-click to listen inside.
3. **Press *Step*, or N, a few times.** The score pauses and runs one call at a time. Each step plays that call's note and lights its path. The score plays the same calls in the same order, spread over time.
4. **Switch recursion rules (`Binary · 2ⁿ`, `Fibonacci`, `Ternary · 3ⁿ`).** Watch `grow.js`, the tree geometry, and the musical meter morph live from symmetric duple phrasing to golden Fibonacci call-and-response or 3-branch waltz meter.
5. **Hum a tree.** Open *Plant a melody*, press *Hum a melody* and hum about five notes. Choose *Grow tree*. Your tune plays at the leaves and the branches below harmonize it. Without a microphone, use *Try an example*.
6. **Choose *Prune* and tap a large branch.** That call becomes a base case: its descendants leave the stack and the music thins. Tap the water surface below to ripple notes, and use *Undo* to bring pruned branches back.
7. **Double-click a branch, or use *Explore → Listen inside*.** Every subtree is a complete piece. Choose *Whole tree* to go back.
8. **Press *Calm* (or C).** The tree goes full screen, the interface fades, and the breathing guide follows the left, middle, and right calls. Turn on *Drift and repeat* to hear the tree slowly evolve.
9. **Save it.** Use *Record* beside the tree to save a performance. *Score WAV* renders seamless multi-cycle stereo audio, and *Link* restores the tree, recursion rule, and listening mix.

**Project description for the form**

> Stillwater is a recursive function you can hear. Switch between Binary, Fibonacci, and Ternary recursion rules: each call owns a branch, a span of time, and a voice, so the chord is the live call stack. A `grow.js` source view works like a debugger that sings—step through calls one at a time, prune branches into base cases, listen inside any subtree, ripple notes across the water, or hum a tune and grow a tree from it. Calm mode turns it into a breathing sanctuary, and you can export seamless multi-cycle WAV, MIDI, a postcard, or a share link.
