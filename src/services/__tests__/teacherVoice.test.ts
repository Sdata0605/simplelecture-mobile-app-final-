import { TeacherVoice } from '../teacherVoice';

const chunk = 'bW9ja19hdWRpb19kYXRh';

function setup() {
  const voice = new TeacherVoice();
  const scripts: string[] = [];
  const detach = voice.attach((script) => scripts.push(script));
  const listener = { onDrained: jest.fn(), onError: jest.fn() };
  voice.listen(listener);
  const ready = () => voice.handleMessage(JSON.stringify({ type: 'ready', state: 'running' }));
  return { voice, scripts, detach, listener, ready };
}

describe('the bridge to the hidden voice player', () => {
  it('keeps speech that arrives while the page is still loading, and sends it in order once the page is ready', () => {
    const { voice, scripts, ready } = setup();
    voice.push(chunk);
    voice.push(chunk);
    voice.flush();
    expect(scripts).toEqual([]);

    ready();
    expect(scripts).toEqual([
      `window.__voice.push("${chunk}",1);true;`,
      `window.__voice.push("${chunk}",2);true;`,
      'window.__voice.flush();true;',
    ]);

    voice.push(chunk);
    expect(scripts[3]).toBe(`window.__voice.push("${chunk}",3);true;`);
  });

  it('only lets base64 into a script', () => {
    const { voice, scripts, ready } = setup();
    ready();
    voice.push('");alert(1);("');
    voice.push('');
    expect(scripts).toEqual([]);
  });

  it('drops speech when no player is on screen, instead of piling it up', () => {
    const voice = new TeacherVoice();
    voice.push(chunk);
    const scripts: string[] = [];
    voice.attach((script) => scripts.push(script));
    voice.handleMessage(JSON.stringify({ type: 'ready' }));
    expect(scripts).toEqual([]);
  });

  it('stop() silences the page and forgets speech that was still waiting for it', () => {
    const { voice, scripts, ready } = setup();
    voice.push(chunk);
    voice.stop();
    ready();
    expect(scripts).toEqual([]); // the waiting speech is gone, and the page has nothing to silence

    voice.stop();
    expect(scripts).toEqual(['window.__voice.stop();true;']);
  });

  it('passes on "drained" only when it is about the speech last handed over', () => {
    const { voice, listener, ready } = setup();
    ready();
    voice.push(chunk); // 1
    voice.push(chunk); // 2
    voice.handleMessage(JSON.stringify({ type: 'drained', seq: 1 })); // older speech finished; 2 is still queued
    expect(listener.onDrained).not.toHaveBeenCalled();
    voice.handleMessage(JSON.stringify({ type: 'drained', seq: 2 }));
    expect(listener.onDrained).toHaveBeenCalledTimes(1);
  });

  it('ignores a "drained" from before a stop', () => {
    const { voice, listener, ready } = setup();
    ready();
    voice.push(chunk); // 1
    voice.stop();
    voice.handleMessage(JSON.stringify({ type: 'drained', seq: 1 }));
    expect(listener.onDrained).not.toHaveBeenCalled();
  });

  it('passes on errors from the page, and shrugs off messages it does not understand', () => {
    const { voice, listener } = setup();
    voice.handleMessage(JSON.stringify({ type: 'error', message: 'blocked' }));
    expect(listener.onError).toHaveBeenCalledWith('blocked');
    expect(() => voice.handleMessage('not json')).not.toThrow();
    expect(() => voice.handleMessage(JSON.stringify({ type: 'something-else' }))).not.toThrow();
  });

  it('stops listening when told to, and a newer listener is not removed by an older one', () => {
    const voice = new TeacherVoice();
    const first = { onDrained: jest.fn(), onError: jest.fn() };
    const second = { onDrained: jest.fn(), onError: jest.fn() };
    const stopFirst = voice.listen(first);
    voice.listen(second);
    stopFirst(); // the first one's cleanup comes late: it must not remove the second
    voice.handleMessage(JSON.stringify({ type: 'error', message: 'x' }));
    expect(second.onError).toHaveBeenCalled();
    expect(first.onError).not.toHaveBeenCalled();
  });

  it('forgets everything when the player goes away, so the next call starts clean', () => {
    const { voice, scripts, detach } = setup();
    voice.push(chunk);
    detach();
    const again: string[] = [];
    voice.attach((script) => again.push(script));
    voice.handleMessage(JSON.stringify({ type: 'ready' }));
    expect(again).toEqual([]);
    expect(scripts).toEqual([]);
  });

  it('is not detached by an older player cleaning up after a newer one has attached', () => {
    const { voice, detach } = setup();
    const newer: string[] = [];
    voice.attach((script) => newer.push(script));
    detach(); // the first player's cleanup comes late
    voice.handleMessage(JSON.stringify({ type: 'ready' }));
    voice.flush();
    expect(newer).toEqual(['window.__voice.flush();true;']);
  });
});
