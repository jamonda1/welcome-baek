import { cli, filesystem } from '@bytecodealliance/preview2-shim';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { unzipSync } from 'fflate';
import { instantiate, type ImportObject } from '../../vendor/ristretto/runner.js';
import type { JavaAssets, JavaRequest, JavaWorkerMessage } from './protocol';

type FileTree = { dir: Record<string, FileTree | { source: Uint8Array }> };

const post = (message: JavaWorkerMessage) => self.postMessage(message);

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

function unpackJdk(archive: ArrayBuffer): FileTree {
  const root = directory();
  for (const [path, source] of Object.entries(unzipSync(new Uint8Array(archive)))) {
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

async function run({ source, input }: JavaRequest, assets: JavaAssets): Promise<JavaWorkerMessage> {
  const root = { dir: { jdk: unpackJdk(assets['jdk-11.zip']), workspace: directory(), tmp: directory() } };
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
  const engine = await instantiate(name => WebAssembly.compile(assets[name as keyof JavaAssets]), imports);
  try {
    engine.execute(JSON.stringify({ id: 1, action: 'run', javaVersion: 11, className: 'Main', source, stdin: input }));
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
  if (!finished || failure) {
    return { output, error: [diagnostics.trim(), failure].filter(Boolean).join('\n') || 'Java 실행이 결과 없이 종료되었습니다.' };
  }
  return { output };
}

self.addEventListener('message', async (event: MessageEvent<{ request: JavaRequest; assets: JavaAssets }>) => {
  try {
    post(await run(event.data.request, event.data.assets));
  } catch (error) {
    post({ output: '', error: error instanceof Error ? error.message : String(error) });
  }
}, { once: true });
