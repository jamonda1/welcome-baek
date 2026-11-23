import type { CodeLanguage } from '../languages/catalog';
import { Repository } from './storage';

export type SaveState = 'ready' | 'pending' | 'saving' | 'saved' | 'error';

/** One writer per storage key. Never lets an older async write finish after a newer one. */
export class BufferedValue<T> {
  state: SaveState = 'ready';
  error: unknown;
  private revision = 0;
  private savedRevision = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<boolean>;

  constructor(public value: T, private write: (value: T) => Promise<void>,
    private notify: () => void = () => {}, private delay = 500) {}

  get dirty(): boolean { return this.revision !== this.savedRevision; }

  update(value: T): void {
    if (value === this.value) return;
    this.value = value;
    this.revision++;
    this.state = 'pending';
    this.error = undefined;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, this.delay);
    this.notify();
  }

  flush(force = false): Promise<boolean> {
    clearTimeout(this.timer);
    if (force && !this.dirty && !this.running) this.revision++;
    if (this.running) return this.running;
    if (!this.dirty) return Promise.resolve(true);
    // Defer the loop one microtask so running is set even for synchronous API errors.
    this.running = Promise.resolve().then(async () => {
      while (this.dirty) {
        const revision = this.revision;
        const value = this.value;
        this.state = 'saving';
        this.notify();
        try {
          await this.write(value);
          this.savedRevision = revision;
          this.error = undefined;
        } catch (error) {
          this.error = error;
          this.state = 'error';
          this.notify();
          return false;
        }
      }
      this.state = 'saved';
      this.notify();
      return true;
    }).finally(() => { this.running = undefined; });
    return this.running;
  }
}

export class Drafts {
  readonly entries = new Map<CodeLanguage, BufferedValue<string>>();
  private loads = new Map<CodeLanguage, Promise<BufferedValue<string>>>();

  constructor(private repository: Repository, private problemId: string,
    private template: (language: CodeLanguage) => string, private notify: () => void) {}

  load(language: CodeLanguage): Promise<BufferedValue<string>> {
    const existing = this.entries.get(language);
    if (existing) return Promise.resolve(existing);
    const pending = this.loads.get(language);
    if (pending) return pending;
    const load = this.repository.readCode(this.problemId, language).then(code => {
      const draft = new BufferedValue(code ?? this.template(language),
        value => this.repository.writeCode(this.problemId, language, value), this.notify);
      this.entries.set(language, draft);
      return draft;
    }).finally(() => { this.loads.delete(language); });
    this.loads.set(language, load);
    return load;
  }

  get dirty(): boolean { return [...this.entries.values()].some(draft => draft.dirty); }

  flush(): Promise<boolean[]> {
    return Promise.all([...this.entries.values()].map(draft => draft.flush()));
  }
}
