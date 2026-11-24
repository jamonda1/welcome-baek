import { cli, filesystem } from '@bytecodealliance/preview2-shim';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { unzipSync } from 'fflate';
import { instantiate, type ImportObject } from '../../vendor/ristretto/runner.js';
import { javaAssets, type JavaPrepared, type JavaTask, type JavaTaskResult, type JavaClasses } from './protocol';

type FileTree = { dir: Record<string, FileTree | { source: Uint8Array }> };

const post = (message: JavaTaskResult | { phase: 'running' }) => self.postMessage(message);

// The browser WASI shim can return ENOTDIR for missing parents. OpenJDK needs ENOENT.
const { openAt, statAt } = filesystem.types.Descriptor.prototype;
filesystem.types.Descriptor.prototype.openAt = function (...args) {
  try {
    return openAt.apply(this, args);
  } catch (error) {
    if (error === 'not-directory') {
      const [flags, path] = args;
      const segments = path.split('/');
      for (let count = 1; count < segments.length; count++) {
        try {
          statAt.call(this, flags, segments.slice(0, count).join('/') || '.');
        } catch (parentError) {
          if (parentError === 'no-entry') throw parentError;
          break;
        }
      }
    }
    throw error;
  }
};
filesystem.types.Descriptor.prototype.readlinkAt = () => { throw 'invalid'; };

function directory(): FileTree {
  return { dir: Object.create(null) };
}

function mountJdk(files: Record<string, Uint8Array>): FileTree {
  const root = directory();
  for (const [path, source] of Object.entries(files)) {
    if (path.endsWith('/')) continue;
    const segments = path.split('/');
    let parent = root;
    for (const name of segments.slice(0, -1)) {
      const next = parent.dir[name] ??= directory();
      if (!('dir' in next)) throw new Error('잘못된 Java 실행 환경 파일입니다.');
      parent = next;
    }
    parent.dir[segments.at(-1)!] = { source };
  }
  return root;
}

async function run(task: JavaTask): Promise<JavaTaskResult> {
  const started = performance.now();
  let prepared = task.prepared;
  if (!prepared) {
    if (task.action !== 'compile' || !task.assets) throw new Error('Java 실행 환경 파일이 없습니다.');
    const assets = task.assets;
    prepared = { jdk: unzipSync(new Uint8Array(assets['jdk-11.zip'])),
      modules: Object.fromEntries(await Promise.all(javaAssets.filter(name => name.endsWith('.wasm')).map(async name =>
        [name, await WebAssembly.compile(assets[name])])) ) as JavaPrepared['modules'] };
  }
  const preparationMs = performance.now() - started;
  const root = { dir: { jdk: mountJdk(prepared.jdk), workspace: directory(), tmp: directory() } };
  filesystem._setFileData(root);
  filesystem._setPreopens({ '/': root });
  cli._setCwd('/workspace');
  cli._setEnv({});
  cli._setArgs(['welcome-baek-java']);
  cli._setStdin({ blockingRead() { throw { tag: 'closed' }; } });

  const protocol = new TextDecoder();
  const stdout = new TextDecoder();
  const stderr = new TextDecoder();
  const wasiErrors = new TextDecoder();
  let output = '';
  let diagnostics = '';
  let pending = '';
  let finished = false;
  let failure: string | undefined;
  let classes: JavaClasses | undefined;
  cli._setStdout({ write(bytes) {
    pending += protocol.decode(bytes, { stream: true });
    let end: number;
    while ((end = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === 'output') {
        if (event.stream === 'stdout') output += stdout.decode(new Uint8Array(event.bytes), { stream: true });
        if (event.stream === 'stderr') diagnostics += stderr.decode(new Uint8Array(event.bytes), { stream: true });
      } else if (event.type === 'bytecode') {
        classes = event.classes;
      } else if (event.type === 'phase' && event.phase === 'running') {
        post({ phase: 'running' });
      } else if (event.type === 'done') {
        finished = true;
      } else if (event.type === 'error') {
        failure = event.message;
      }
    }
  } });
  cli._setStderr({ write(bytes) { diagnostics += wasiErrors.decode(bytes, { stream: true }); } });

  const shim = new WASIShim({ sandbox: { enableNetwork: false } });
  const imports = { ...shim.getImportObject(), ...shim.getImportObject({ asVersion: '0.2.12' }) } as unknown as ImportObject;
  const engine = await instantiate(async name => prepared!.modules[name as keyof JavaPrepared['modules']], imports);
  const operationStart = performance.now();
  try {
    engine.execute(JSON.stringify({ id: 1, javaVersion: 11, className: 'Main',
      ...(task.action === 'compile' ? { action: 'compile', source: task.source } :
        { action: 'execute', source: '', stdin: task.input, classes: task.classes }) }));
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'exitError' in error && 'code' in error) {
      finished = Number(error.code) === 0;
      if (!finished) failure ??= `Java가 오류 코드 ${error.code}로 종료되었습니다.`;
    } else {
      failure ??= error instanceof Error ? error.message : String(error);
    }
  }
  output += stdout.decode();
  diagnostics += stderr.decode() + wasiErrors.decode();
  const metadata = { preparationMs, operationMs: performance.now() - operationStart,
    ...(task.action === 'compile' ? { prepared, classes } : {}) };
  if (!finished || failure) {
    return { ...metadata, result: { output, error: [diagnostics.trim(), failure].filter(Boolean).join('\n') || 'Java 실행이 결과 없이 종료되었습니다.' } };
  }
  return { ...metadata, result: { output } };
}

self.addEventListener('message', async (event: MessageEvent<JavaTask>) => {
  try {
    post(await run(event.data));
  } catch (error) {
    post({ result: { output: '', error: error instanceof Error ? error.message : String(error) }, preparationMs: 0, operationMs: 0 });
  }
}, { once: true });
