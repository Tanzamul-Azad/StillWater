// A Standard MIDI File (type 1) with one track per recursion level, so the
// call stack can be opened in any DAW as stacked instrument lanes.
const ticksPerBeat = 480;
const programs = { pad: 89, strings: 49, keys: 4, kalimba: 108, marimba: 12, harp: 46, bell: 14, glass: 92, drop: 10 };

function variable(value) {
  const bytes = [value & 0x7f];
  while ((value >>= 7)) bytes.unshift((value & 0x7f) | 0x80);
  return bytes;
}

function chunk(type, body) {
  const length = body.length;
  return [...type].map(c => c.charCodeAt(0)).concat([length >>> 24, (length >>> 16) & 255, (length >>> 8) & 255, length & 255], body);
}

function text(kind, value) {
  const bytes = [...new TextEncoder().encode(value)];
  return [0xff, kind, ...variable(bytes.length), ...bytes];
}

// Time in seconds maps to ticks at 60 BPM, so one beat is one second.
export function encodeMidi(scores, voiceFor) {
  const tick = seconds => Math.max(0, Math.round(seconds * ticksPerBeat));
  const levels = new Map();
  let offset = 0;
  for (const score of scores) {
    for (const note of score.events) {
      if (!levels.has(note.depth)) levels.set(note.depth, { voice: voiceFor(score.scene, note.depth), events: [] });
      const lane = levels.get(note.depth);
      const start = offset + note.at;
      const hold = note.depth <= 2 ? note.end - note.start : Math.min(note.end - note.start, 1.2);
      const velocity = Math.round(46 + 50 * (note.velocity ?? 0.9) - note.depth * 3);
      lane.events.push({ time: tick(start), data: [0x90, note.midi, velocity] });
      lane.events.push({ time: tick(start + Math.max(0.08, hold)), data: [0x80, note.midi, 0] });
    }
    offset += score.cycle;
  }

  const conductor = [0, ...text(0x03, 'Stillwater'), 0, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40, 0, 0xff, 0x2f, 0x00];
  const tracks = [chunk('MTrk', conductor)];
  for (const [depth, lane] of [...levels.entries()].sort((a, b) => a[0] - b[0])) {
    const channel = depth % 16 === 9 ? 10 : depth % 16;
    lane.events.sort((a, b) => a.time - b.time || (a.data[0] === 0x80 ? -1 : 1));
    const body = [0, ...text(0x03, 'Level ' + depth + ' · ' + lane.voice), 0, 0xc0 | channel, programs[lane.voice] ?? 0];
    let last = 0;
    for (const event of lane.events) {
      body.push(...variable(event.time - last), event.data[0] | channel, event.data[1], event.data[2]);
      last = event.time;
    }
    body.push(0, 0xff, 0x2f, 0x00);
    tracks.push(chunk('MTrk', body));
  }
  const header = chunk('MThd', [0, 1, 0, tracks.length, ticksPerBeat >> 8, ticksPerBeat & 255]);
  return new Blob([new Uint8Array(header.concat(...tracks))], { type: 'audio/midi' });
}
