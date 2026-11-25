import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeWave } from '../dist/audio.mjs';
import { compose, scenes } from '../dist/score.mjs';

for (const scene of Object.keys(scenes)) {
  test(`${scene} produces a complete, ordered binary tree`, () => {
    for (let depth = 1; depth <= 6; depth++) {
      const { branches, duration } = compose({ ...scenes[scene], scene, depth });
      assert.equal(branches.length, 2 ** (depth + 1) - 1);
      assert.equal(branches.filter(branch => branch.leaf).length, 2 ** depth);
      assert.equal(branches[0].path, '');
      for (const branch of branches.slice(1)) {
        const parent = branches[branch.parent];
        assert.ok(branch.parent < branch.index);
        assert.equal(branch.depth, parent.depth + 1);
        assert.match(branch.path.slice(-1), /^[LR]$/);
        assert.equal(branch.path.slice(0, -1), parent.path);
        assert.equal(branch.x, parent.endX);
        assert.equal(branch.y, parent.endY);
        assert.ok(branch.time > branches[branch.index - 1].time);
        assert.ok(Math.abs(branch.pan) <= 0.72);
      }
      for (const branch of branches.filter(branch => !branch.leaf)) {
        assert.deepEqual(branches.filter(child => child.parent === branch.index).map(child => child.path), [branch.path + 'L', branch.path + 'R']);
      }
      assert.ok(duration > branches.at(-1).time + branches.at(-1).decay);
    }
  });
}

test('the seed is reproducible, and geometry parameters change the score', () => {
  const settings = { ...scenes.lagoon, scene: 'lagoon' };
  const original = compose(settings);
  assert.deepEqual(original, compose({ ...settings }));
  assert.notDeepEqual(original.branches, compose({ ...settings, seed: settings.seed + 1 }).branches);
  assert.notEqual(original.branches[1].pan, compose({ ...settings, angle: 55 }).branches[1].pan);
  assert.notEqual(original.branches[1].pan, compose({ ...settings, taper: 54 }).branches[1].pan);
  assert.ok(compose({ ...settings, tempo: 48 }).duration > original.duration);
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
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), 8192);
  assert.equal(view.getInt16(50, true), -8192);
});
