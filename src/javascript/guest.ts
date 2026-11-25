import { Buffer } from 'buffer/';

type Listener = (...args: unknown[]) => void;
type Output = (channel: number, chunk: Uint8Array) => void;
type Encoding = Parameters<Buffer['toString']>[0];

const scope = globalThis as typeof globalThis & {
  __wbInput?: ArrayBuffer;
  __wbWrite?: Output;
  __wbExit?: (code: number) => void;
};
const writeBytes = scope.__wbWrite!;
const exitProgram = scope.__wbExit!;
let input = Buffer.from(scope.__wbInput!);
delete scope.__wbWrite;
delete scope.__wbExit;
delete scope.__wbInput;

const schedule = (job: () => void) => { void Promise.resolve().then(job); };

function takeInput(encoding?: Encoding | null) {
  const bytes = input;
  input = Buffer.alloc(0);
  return encoding ? bytes.toString(encoding) : bytes;
}

class Listeners {
  private callbacks = new Map<string, Listener[]>();

  constructor(private readonly onAttach?: (event: string) => void) {}

  on(event: string, listener: Listener) {
    if (typeof listener !== 'function') throw new TypeError('Expected a listener function');
    let listeners = this.callbacks.get(event);
    if (!listeners) this.callbacks.set(event, listeners = []);
    listeners.push(listener);
    this.onAttach?.(event);
    return this;
  }

  once(event: string, listener: Listener) {
    if (typeof listener !== 'function') throw new TypeError('Expected a listener function');
    const wrapper: Listener = (...args) => {
      this.off(event, wrapper);
      listener.apply(this, args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: Listener) {
    const listeners = this.callbacks.get(event);
    const index = listeners?.lastIndexOf(listener) ?? -1;
    if (index !== -1) listeners?.splice(index, 1);
    return this;
  }

  removeListener(event: string, listener: Listener) { return this.off(event, listener); }

  emit(event: string, ...args: unknown[]) {
    for (const callback of [...(this.callbacks.get(event) ?? [])]) callback.apply(this, args);
  }
}

let encoding: Encoding;
let flowing = false;
const stdin = Object.assign(new Listeners(event => { if (event === 'data') stdin.resume(); }), {
  isTTY: false,
  setEncoding(value: Encoding) { encoding = value; return this; },
  read() { return input.length ? takeInput(encoding) : null; },
  resume() {
    if (!flowing) {
      flowing = true;
      schedule(() => {
        const data = this.read();
        if (data !== null) stdin.emit('data', data);
        stdin.emit('end');
      });
    }
    return this;
  },
  async *[Symbol.asyncIterator]() {
    const data = this.read();
    if (data !== null) yield data;
  }
});

function createInterface(options: { input: typeof stdin } | typeof stdin) {
  if (options !== stdin && (!('input' in options) || options.input !== stdin)) {
    throw new TypeError('readline supports process.stdin as input');
  }
  let lines: string[] | undefined;
  const readLines = () => {
    if (lines) return lines;
    const text = takeInput('utf8') as string;
    lines = text ? text.split(/\r\n|\n|\r/) : [];
    if (lines.at(-1) === '') lines.pop();
    return lines;
  };
  let started = false;
  let closed = false;
  const listeners = new Listeners(event => {
    if (started || (event !== 'line' && event !== 'close')) return;
    started = true;
    schedule(() => {
      if (closed) return;
      for (const line of readLines()) {
        if (closed) break;
        listeners.emit('line', line);
      }
      reader.close();
    });
  });
  const reader = Object.assign(listeners, {
    close() {
      if (closed) return;
      closed = true;
      listeners.emit('close');
    },
    async *[Symbol.asyncIterator]() {
      if (closed) return;
      for (const line of readLines()) {
        if (closed) break;
        yield line;
      }
      reader.close();
    },
  });
  return reader;
}

function write(channel: number, value: string | Uint8Array, encoding?: Encoding) {
  if (typeof value === 'string') writeBytes(channel, Buffer.from(value, encoding));
  else if (value instanceof Uint8Array) writeBytes(channel, value);
  else throw new TypeError('Output must be a string or Uint8Array');
}

function outputStream(channel: number) {
  return {
    isTTY: false,
    write(value: string | Uint8Array, encoding?: Encoding) {
      write(channel, value, encoding);
      return true;
    },
  };
}

const fs = {
  readFileSync(path: number | string, options?: Encoding | { encoding?: Encoding | null } | null) {
    if (path !== 0 && path !== '/dev/stdin' && path !== '/dev/fd/0') {
      throw new Error('fs.readFileSync supports standard input only');
    }
    return takeInput(typeof options === 'string' ? options : options?.encoding);
  },
  writeFileSync(path: number | string, value: string | Uint8Array, options?: Encoding | { encoding?: Encoding }) {
    const encoding = typeof options === 'string' ? options : options?.encoding;
    if (path === 1 || path === '/dev/stdout') write(1, value, encoding);
    else if (path === 2 || path === '/dev/stderr') write(2, value, encoding);
    else throw new Error('fs.writeFileSync supports standard output and standard error only');
  },
};

function parseExitCode(value: number | string) {
  if ((typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) ||
      !Number.isInteger(Number(value))) throw new TypeError('process.exitCode must be an integer');
  return Number(value) & 0xff;
}

let exitCode = 0;
const process = {
  stdin, stdout: outputStream(1), stderr: outputStream(2),
  platform: 'linux',
  argv: ['node', '/Main.js'],
  env: {},
  cwd: () => '/',
  nextTick(callback: Listener, ...args: unknown[]) { schedule(() => callback(...args)); },
  get exitCode() { return exitCode; },
  set exitCode(value: number | string) { exitCode = parseExitCode(value); },
  exit(code: number | string = exitCode) {
    exitProgram(parseExitCode(code));
    throw new Error('Program exited');
  },
};

function display(value: unknown, nested = false, seen = new Set<object>()): string {
  if (typeof value === 'bigint') return String(value) + 'n';
  if (typeof value === 'string') return nested ? "'" + value.replaceAll("'", "\\'") + "'" : value;
  if (value === null || typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  if (seen.size >= 2) return Array.isArray(value) ? '[Array]' : '[Object]';
  seen.add(value);
  const body = Array.isArray(value)
    ? value.slice(0, 100).map(item => display(item, true, seen)).join(', ')
    : Object.keys(value).slice(0, 100).map(key => key + ': ' + display((value as Record<string, unknown>)[key], true, seen)).join(', ');
  seen.delete(value);
  if (Array.isArray(value)) return body ? '[ ' + body + ' ]' : '[]';
  return body ? '{ ' + body + ' }' : '{}';
}

function format(values: unknown[]) {
  const [first, ...rest] = values;
  if (typeof first !== 'string' || !rest.length) return values.map(value => display(value)).join(' ');
  let index = 0;
  const message = first.replace(/%[sdifojO%]/g, token => {
    if (token === '%%') return '%';
    if (index >= rest.length) return token;
    const value = rest[index++];
    if (token === '%s' || token === '%o' || token === '%O') return display(value);
    if (token === '%d') return typeof value === 'bigint' ? display(value) : String(Number(value));
    if (token === '%i') return String(parseInt(String(value), 10));
    if (token === '%f') return String(parseFloat(String(value)));
    try { return JSON.stringify(value) ?? 'undefined'; } catch { return '[Circular]'; }
  });
  return index === rest.length ? message : message + ' ' + rest.slice(index).map(value => display(value)).join(' ');
}

const print = (channel: number) => (...values: unknown[]) => write(channel, format(values) + '\n');
const log = print(1);
const error = print(2);
const readline = { createInterface };
const supportedModules = new Map<string, unknown>([
  ['fs', fs], ['readline', readline], ['readline/promises', readline], ['buffer', { Buffer }], ['process', process]
]);
const require = (name: string) => {
  const key = name.startsWith('node:') ? name.slice(5) : name;
  if (!supportedModules.has(key)) throw new Error('Unsupported JavaScript module: ' + name);
  return supportedModules.get(key);
};
type Main = (exports: object, require: (name: string) => unknown, module: { exports: object }, filename: string, dirname: string) => unknown;

Object.assign(scope, {
  Buffer, process, global: scope,
  console: { log, info: log, debug: log, warn: error, error },
  __wbRunMain(main: Main) {
    const module = { exports: {} };
    main.call(module.exports, module.exports, require, module, '/Main.js', '/');
  },
});
