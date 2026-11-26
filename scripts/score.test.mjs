import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeWave } from '../src/audio.mjs';
import { detectMelody, melodyExample, melodyRate } from '../src/melody.mjs';
import { encodeMidi } from '../src/midi.mjs';
import {
  branchPath, compose, focusOn, fromHash, minimumSplit, mutations, randomFrom, scenes, seedNumber, stackAt, subtree, toHash,
} from '../src/score.mjs';

const base = scene => ({ scene, ...scenes[scene].defaults, pruned: [] });
const byPath = score => new Map(score.branches.map(branch => [branch.path, branch]));
const close = (a, b) => Math.abs(a - b) < 1e-9;

for (const scene of Object.keys(scenes)) {
  test(`${scene}: every call splits its parent's time exactly`, () => {
    for (let depth = 2; depth <= 7; depth++) {
      const score = compose({ ...base(scene), depth });
      const [trunk] = score.branches;
      assert.equal(trunk.start, 0);
      assert.equal(trunk.end, score.cycle);
      for (const branch of score.branches) {
        assert.ok(branch.depth <= depth);
        if (branch.leaf) {
          assert.equal(branch.children.length, 0);
          continue;
        }
        const [left, right] = branch.children.map(index => score.branches[index]);
        assert.equal(left.path, branch.path + 'L');
        assert.equal(right.path, branch.path + 'R');
        assert.equal(left.start, branch.start);
        assert.ok(close(left.end, right.start));
        assert.equal(right.end, branch.end);
        assert.ok(close((left.end - left.start) / (branch.end - branch.start), score.settings.sway / 100));
        assert.equal(left.x, branch.endX);
        assert.equal(right.y, branch.endY);
      }
      // The leaves, in call order, tile the whole cycle with no gaps.
      const leaves = score.branches.filter(branch => branch.leaf);
      assert.equal(leaves[0].start, 0);
      for (let i = 1; i < leaves.length; i++) assert.ok(close(leaves[i].start, leaves[i - 1].end));
      assert.equal(leaves.at(-1).end, score.cycle);
      // A call too short to split becomes a base case.
      for (const leaf of leaves.filter(leaf => leaf.depth < depth && !leaf.cut)) {
        assert.ok((leaf.end - leaf.start) * Math.min(score.settings.sway, 100 - score.settings.sway) / 100 < minimumSplit);
      }
    }
  });
}

test('the sounding chord is the call stack: one call per level, trunk to leaf', () => {
  const score = compose(base('lagoon'));
  for (let t = 0; t < score.cycle; t += 0.37) {
    const stack = stackAt(score, t);
    assert.equal(stack[0].index, 0);
    assert.ok(stack.at(-1).leaf);
    stack.forEach((call, level) => {
      assert.equal(call.depth, level);
      assert.ok(call.start <= t + 1e-9 && t < call.end + 1e-9);
      if (level) assert.equal(call.parent, stack[level - 1].index);
    });
    assert.deepEqual(branchPath(score.branches, stack.at(-1).index), stack);
  }
});

test('voices stay in their own register, low at the trunk and high at the tips', () => {
  const score = compose({ ...base('lagoon'), depth: 7 });
  const average = depth => {
    const notes = score.branches.filter(branch => branch.depth === depth).map(branch => branch.midi);
    return notes.reduce((sum, midi) => sum + midi, 0) / notes.length;
  };
  for (let depth = 1; depth <= 7; depth++) assert.ok(average(depth) > average(depth - 1));
  const scale = score.scene.scale.map(step => (score.scene.root + step) % 12);
  for (const branch of score.branches) assert.ok(scale.includes(branch.midi % 12));
  for (const scene of Object.values(scenes)) {
    assert.equal(new Set(scene.voices).size, 8);
  }
});

test('pitch tracking recovers a phrase and ignores quiet or unpitched input', () => {
  const detected = detectMelody(melodyExample());
  assert.deepEqual(detected.map(([midi]) => midi), [62, 66, 64, 69, 66, 64, 62]);
  assert.ok(detected[3][1] > detected[1][1]);
  assert.deepEqual(detectMelody(new Float32Array(melodyRate).fill(0.1)), []);
  const random = randomFrom(591);
  const noise = Float32Array.from({ length: melodyRate }, () => random() * 0.3 - 0.15);
  assert.deepEqual(detectMelody(noise), []);
});

test('the imported contour plays at the leaves and survives pruning, focus and links', () => {
  const melody = [[62, 23], [66, 18], [65, 22], [69, 32]];
  const settings = { ...base('cedar'), depth: 7, melody };
  const tree = compose(settings);
  const leads = tree.branches.filter(branch => branch.melodyLead);
  const contour = leads.map(branch => branch.midi % 12).filter((midi, i, all) => midi !== all[i - 1]);
  assert.deepEqual(contour.slice(0, 4), [2, 6, 5, 9]);
  const cut = compose({ ...settings, pruned: ['L'] });
  assert.equal(byPath(cut).get('L').midi, byPath(tree).get('L').midi);
  assert.equal(byPath(cut).get('L').melodyLead, false);
  assert.equal(byPath(cut).get('L').leaf, true);
  assert.equal(focusOn(tree, leads[0].index).branches[0].midi, leads[0].midi);
  const restored = fromHash(toHash(tree.settings, null));
  assert.deepEqual(restored.settings.melody, melody);
  assert.deepEqual(compose(restored.settings).branches, tree.branches);
  assert.deepEqual(fromHash('#scene=cedar&melody=62:9999.99:4').settings.melody, []);
  const wide = compose({ ...settings, generation: 15, melody: [[36, 40], [38, 40], [40, 40], [88, 40]] });
  const pitches = wide.melody.notes.map(note => note.midi);
  assert.equal(Math.max(...pitches) - Math.min(...pitches), 52);
  assert.ok(pitches.every(midi => midi >= 32 && midi <= 104));
});

test('pruning a call makes it a base case and leaves the rest of the tree untouched', () => {
  const settings = base('lagoon');
  const full = compose(settings);
  const cut = compose({ ...settings, pruned: ['LR'] });
  const pruned = byPath(cut).get('LR');
  assert.ok(pruned.leaf && pruned.cut);
  assert.ok(!cut.branches.some(branch => branch.path.startsWith('LR') && branch.path !== 'LR'));
  assert.equal(cut.branches.length, full.branches.length - (subtree(full.branches, byPath(full).get('LR').index).length - 1));
  const before = byPath(full);
  for (const branch of cut.branches) {
    if (branch.path.startsWith('LR')) continue;
    const original = before.get(branch.path);
    assert.equal(branch.midi, original.midi);
    assert.equal(branch.endX, original.endX);
    assert.equal(branch.start, original.start);
  }
});

test('seeds are repeatable, and words grow their own trees', () => {
  const settings = base('cedar');
  assert.deepEqual(compose(settings), compose({ ...settings }));
  assert.equal(seedNumber('42'), 42);
  assert.equal(seedNumber('Tanzamul'), seedNumber('  tanzamul '));
  assert.notDeepEqual(compose({ ...settings, seed: 'moss' }).branches.map(b => b.midi), compose({ ...settings, seed: 'ember' }).branches.map(b => b.midi));
  assert.notEqual(compose({ ...settings, spread: 55 }).branches[1].midi, compose({ ...settings, spread: 15 }).branches[1].midi);
});

test('drift changes exactly one gene per generation', () => {
  const seed = seedNumber('stillwater');
  for (let generation = 1; generation < 12; generation++) {
    const before = mutations(seed, generation - 1, 6);
    const after = mutations(seed, generation, 6);
    const difference = [...before].filter(path => !after.has(path)).length + [...after].filter(path => !before.has(path)).length;
    assert.equal(difference, 1);
  }
  const first = compose(base('lagoon'));
  const second = compose({ ...base('lagoon'), generation: 1 });
  assert.equal(first.branches.length, second.branches.length);
  assert.notDeepEqual(first.branches.map(b => b.midi), second.branches.map(b => b.midi));
});

test('listening inside a branch turns its subtree into a full cycle', () => {
  const score = compose(base('lagoon'));
  const index = score.branches.find(branch => branch.path === 'RL').index;
  const inside = focusOn(score, index);
  assert.equal(inside.focus, 'RL');
  assert.equal(inside.branches.length, subtree(score.branches, index).length);
  assert.equal(inside.branches[0].depth, 0);
  assert.equal(inside.branches[0].start, 0);
  assert.ok(close(inside.branches[0].end, score.cycle));
  assert.ok(inside.branches.every(branch => branch.path.startsWith('RL')));
  assert.equal(stackAt(inside, 1)[0].path, 'RL');
  const leaf = focusOn(score, score.branches.find(branch => branch.leaf).index);
  assert.equal(leaf.branches.length, 1);
  assert.equal(leaf.branches[0].at, 0);
});

test('a shared link restores the exact tree', () => {
  const settings = { ...base('orchid'), seed: 'my name', pruned: ['RR', 'L'] };
  const current = compose({ ...settings, generation: 5 });
  const restored = fromHash(toHash(current.settings, 'R', current.generation));
  assert.equal(restored.focus, 'R');
  assert.equal(restored.generation, 5);
  assert.deepEqual(compose({ ...restored.settings, generation: restored.generation }).branches, current.branches);
  assert.equal(fromHash(toHash(current.settings, null)).generation, 0);
  assert.equal(fromHash('#scene=constructor&generation=Infinity').settings.scene, 'lagoon');
  assert.equal(fromHash('#scene=lagoon&generation=Infinity').generation, 0);
  assert.equal(fromHash('#nothing'), null);
});

test('MIDI export writes one track per recursion level', async () => {
  const score = compose({ ...base('lagoon'), depth: 4 });
  const bytes = new Uint8Array(await encodeMidi([score], () => 'bell').arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'MThd');
  assert.equal((bytes[10] << 8) | bytes[11], 1 + 5);
  assert.equal(new TextDecoder().decode(bytes).split('MTrk').length - 1, 6);
});

test('WAV export stores an interleaved stereo, 16-bit PCM stream', async () => {
  const samples = [Float32Array.of(-1, 0.25), Float32Array.of(1, -0.25)];
  const file = encodeWave({ numberOfChannels: 2, length: 2, sampleRate: 44100, getChannelData: i => samples[i] });
  const bytes = await file.arrayBuffer();
  const view = new DataView(bytes);
  assert.equal(file.type, 'audio/wav');
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), 8192);
  assert.equal(view.getInt16(50, true), -8192);
});
