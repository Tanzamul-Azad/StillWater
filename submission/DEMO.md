# Stillwater judging walkthrough (2 minutes)

**Stillwater is a recursive function you can hear.** Each call is a branch, a span of time and a voice. The chord you hear is the live call stack.

1. **Open the [live site](https://tanzamul-azad.github.io/StillWater/) with headphones and press *Play the score*.** The tree grows in call order, then the music starts. The low drone is the trunk call and the quick bells are the leaf calls.
2. **Watch `grow.js` beside the tree.** It works like a debugger that sings. The markers show where every running frame is paused. The deepest call flashes on `sound(call)` and then waits on `return`, while its ancestors wait on `grow(left(call))` or `grow(right(call))`.
3. **Press *Step*, or N, a few times.** The score pauses and runs one call at a time. Each step plays that call's note and lights its path. The score plays the same calls in the same order, spread over time.
4. **Hum a tree.** Open *Plant a melody*, press *Hum a melody* and hum about five notes. Choose *Grow tree*. Your tune plays at the leaves and the branches below harmonize it. Without a microphone, use *Try an example*.
5. **Choose *Prune* and tap a large branch.** That call becomes a base case: its descendants leave the stack and the music thins. Use *Undo* to bring them back.
6. **Double-click a branch, or use *Explore → Listen inside*.** Every subtree is a complete piece. Choose *Whole tree* to go back.
7. **Press the calm-mode button.** The tree goes full screen, the interface fades, and the breathing guide follows the left and right calls. Turn on *Drift and repeat* to hear the tree slowly evolve.
8. **Save it.** Use *Record* beside the tree to save a performance. *Score WAV* renders the score, and *Link* restores the tree and its listening mix.

**Project description for the form**

> Stillwater is a recursive function you can hear. Each call owns a branch, a span of time and a voice, so the chord is the live call stack. A source view works like a debugger that sings: step through the calls one at a time, prune branches into base cases, listen inside any subtree, or hum a tune and grow a tree from it. Calm mode turns it into a breathing companion, and you can export WAV, MIDI, a postcard or a share link.

**Suggested 60-second demo video:**
- 0–10 s: press *Play*, point at `grow.js` and say "this chord is the call stack".
- 10–20 s: *Step* three times.
- 20–35 s: hum a tune and grow a tree.
- 35–45 s: prune a branch.
- 45–60 s: calm mode.
