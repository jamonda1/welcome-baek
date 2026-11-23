import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferedValue, Drafts } from '../src/storage/persistence';
import { Repository, codeKey, defaults, preferenceKey, storageError } from '../src/storage/storage';

function fixture(seed: Record<string, unknown> = {}) {
  const data = structuredClone(seed);
  const area = {
    get: vi.fn(async () => ({ ...data })),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(data, items); })
  };
  const repository = new Repository(area);
  const drafts = new Drafts(repository, '1000', lang => `template:${lang}`, vi.fn());
  return { data, area, repository, drafts };
}
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
afterEach(() => { vi.useRealTimers(); });

describe('storage and debounce', () => {
  it('uses a template only when absent, never writes it during loading', async () => {
    const { drafts, area } = fixture();
    expect((await drafts.load('cpp')).value).toBe('template:cpp');
    expect(area.set).not.toHaveBeenCalled();
  });
  it('restores an intentionally empty document', async () => {
    const { drafts } = fixture({ [codeKey('1000', 'java')]: { code: '' } });
    expect((await drafts.load('java')).value).toBe('');
  });
  it('debounces for 500ms after the final change', async () => {
    vi.useFakeTimers();
    const { drafts, area, data } = fixture();
    const draft = await drafts.load('java');
    draft.update('a');
    await vi.advanceTimersByTimeAsync(400);
    draft.update('latest');
    await vi.advanceTimersByTimeAsync(499);
    expect(area.set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(area.set).toHaveBeenCalledTimes(1);
    expect(data[codeKey('1000', 'java')]).toMatchObject({ code: 'latest' });
    expect(draft.state).toBe('saved');
  });
  it('flushes immediately and cancels a pending debounce', async () => {
    vi.useFakeTimers();
    const { drafts, area } = fixture();
    const draft = await drafts.load('java');
    draft.update('manual');
    await draft.flush(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(area.set).toHaveBeenCalledTimes(1);
    expect(draft.dirty).toBe(false);
  });
  it('manual save also persists an untouched template', async () => {
    const { drafts, area } = fixture();
    await (await drafts.load('python')).flush(true);
    expect(area.set).toHaveBeenCalledTimes(1);
  });
  it('serializes slow writes and saves the newest revision', async () => {
    const first = deferred<void>();
    const write = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(undefined);
    const draft = new BufferedValue<string>('initial', write);
    draft.update('old');
    const saving = draft.flush();
    await Promise.resolve();
    draft.update('new');
    const next = draft.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(draft.dirty).toBe(true);
    first.resolve();
    await Promise.all([saving, next]);
    expect(write.mock.calls.map(call => call[0])).toEqual(['old', 'new']);
    expect(draft.dirty).toBe(false);
    expect(draft.state).toBe('saved');
  });
  it('retains dirty data after quota errors and permits retry', async () => {
    const { drafts, area, data } = fixture();
    area.set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));
    const draft = await drafts.load('java');
    draft.update('keep me');
    expect(await draft.flush()).toBe(false);
    expect(draft.state).toBe('error');
    expect(draft.value).toBe('keep me');
    expect(draft.dirty).toBe(true);
    expect(storageError(draft.error)).toContain('공간');
    await draft.flush();
    expect(data[codeKey('1000', 'java')]).toMatchObject({ code: 'keep me' });
    expect(draft.dirty).toBe(false);
  });
  it('handles a synchronous API failure without sticking in saving', async () => {
    const write = vi.fn(() => { throw new Error('Extension context invalidated.'); });
    const draft = new BufferedValue('', write);
    draft.update('copy me');
    expect(await draft.flush()).toBe(false);
    expect(await draft.flush()).toBe(false);
    expect(write).toHaveBeenCalledTimes(2);
    expect(storageError(draft.error)).toContain('새로고침');
  });
  it('separates languages and problems, including fast outgoing saves', async () => {
    const { drafts, repository, data } = fixture();
    const java = await drafts.load('java');
    java.update('java draft');
    const outgoing = drafts.flush();
    const python = await drafts.load('python');
    python.update('python draft');
    await Promise.all([outgoing, drafts.flush(), repository.writeCode('1001', 'java', 'other problem')]);
    expect(data[codeKey('1000', 'java')]).toMatchObject({ code: 'java draft' });
    expect(data[codeKey('1000', 'python')]).toMatchObject({ code: 'python draft' });
    expect(data[codeKey('1001', 'java')]).toMatchObject({ code: 'other problem' });
  });
  it('shares a pending language read and reuses unsaved drafts', async () => {
    const { drafts, area } = fixture();
    const [a, b] = await Promise.all([drafts.load('java'), drafts.load('java')]);
    a.update('in memory');
    expect(a).toBe(b);
    expect(await drafts.load('java')).toBe(a);
    expect(area.get).toHaveBeenCalledTimes(1);
    await drafts.flush();
  });
  it('read failure never creates a writable template, retry reads existing code', async () => {
    const { drafts, area } = fixture({ [codeKey('1000', 'java')]: { code: 'precious' } });
    area.get.mockRejectedValueOnce(new Error('read failed'));
    await expect(drafts.load('java')).rejects.toThrow('read failed');
    expect(drafts.entries.size).toBe(0);
    expect(area.set).not.toHaveBeenCalled();
    expect((await drafts.load('java')).value).toBe('precious');
  });
  it('refuses malformed saved code without overwriting it', async () => {
    const { drafts, area } = fixture({ [codeKey('1000', 'java')]: { code: 42 } });
    await expect(drafts.load('java')).rejects.toThrow('형식');
    expect(area.set).not.toHaveBeenCalled();
  });
  it('validates preferences and bounds the problem ratio', async () => {
    const { repository } = fixture({ [preferenceKey('problemRatio')]: 200,
      [preferenceKey('language')]: 'ruby', [preferenceKey('theme')]: 'dracula',
      [preferenceKey('reversed')]: true });
    expect(await repository.readPreferences()).toEqual({ ...defaults, problemRatio: 80, theme: 'dracula', reversed: true });
  });
  it('writes independent preference keys and restores all four values', async () => {
    const { repository, data } = fixture();
    await Promise.all([repository.writePreference('language', 'python'), repository.writePreference('theme', 'one-dark'),
      repository.writePreference('problemRatio', 36), repository.writePreference('reversed', true)]);
    expect(Object.keys(data)).toHaveLength(4);
    expect(await repository.readPreferences()).toEqual({ language: 'python', theme: 'one-dark', problemRatio: 36, reversed: true });
  });
});
