import { QuickJS, type JSValueHandle } from 'quickjs-wasi';
import { javascriptRunLimit, javascriptTimeout, type JavaScriptTask, type JavaScriptTaskResult } from './protocol';

const memoryLimit = 128 * 1024 * 1024;
const outputLimit = 1024 * 1024;
const outputLimitError = 'JavaScript 출력 제한을 초과했습니다. (1 MiB)';

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return [error.name + ': ' + error.message, error.stack?.split('\n').slice(0, 8).join('\n')]
    .filter(Boolean).join('\n');
}

function rejectionText(reason: JSValueHandle): string {
  if (!reason.isObject) return reason.toString();
  if (reason.isError) return reason.getProp('message').consume(value => value.toString());
  return '자바스크립트 객체가 거부 사유로 전달되었습니다.';
}

async function run(task: JavaScriptTask): Promise<JavaScriptTaskResult> {
  let deadline = Infinity;
  let exitCode: number | undefined;
  let outputLimited = false;
  const rejected = new Map<number, { promise: JSValueHandle; reason: JSValueHandle }>();
  const vm = await QuickJS.create({
    wasm: task.wasm,
    memoryLimit,
    interruptHandler: () => exitCode !== undefined || outputLimited || performance.now() >= deadline,
    onUnhandledRejection(promise, reason, handled) {
      const old = rejected.get(promise.identity);
      if (old) {
        old.promise.dispose();
        old.reason.dispose();
        rejected.delete(promise.identity);
      }
      if (!handled) rejected.set(promise.identity, { promise: promise.dup(), reason: reason.dup() });
    },
  });

  try {
    if (task.action === 'compile') {
      const source = task.source.replace(/^#![^\r\n]*/, '');
      const wrapped = '(function (exports, require, module, __filename, __dirname) {' + source + '\n})';
      return { output: '', bytecode: vm.compile(wrapped, 'Main.js') };
    }

    let remaining = outputLimit;
    const stdoutDecoder = new TextDecoder();
    const stderrDecoder = new TextDecoder();
    let stdout = '';
    let stderr = '';
    vm.newArrayBuffer(new TextEncoder().encode(task.input)).consume(value => vm.global.setProp('__wbInput', value));
    vm.newFunction('wbWrite', (channel, chunk) => {
      const bytes = chunk.toUint8Array();
      const accepted = bytes.subarray(0, remaining);
      const stream = channel.toNumber() === 2 ? stderrDecoder : stdoutDecoder;
      const text = stream.decode(accepted, { stream: true });
      if (stream === stderrDecoder) stderr += text;
      else stdout += text;
      remaining -= accepted.length;
      if (accepted.length !== bytes.length) {
        outputLimited = true;
        throw new Error(outputLimitError);
      }
      return vm.undefined;
    }).consume(value => vm.global.setProp('__wbWrite', value));
    vm.newFunction('wbExit', (code) => {
      exitCode = code.toNumber();
      return vm.undefined;
    }).consume(value => vm.global.setProp('__wbExit', value));

    vm.evalBytecode(task.bootstrap).dispose();
    const main = vm.evalBytecode(task.bytecode);
    const invoke = vm.global.getProp('__wbRunMain');
    const process = vm.global.getProp('process');
    vm.evalCode('delete globalThis.__wbRunMain').dispose();
    let error: string | undefined;
    deadline = performance.now() + javascriptRunLimit;
    self.postMessage({ phase: 'running' });
    try {
      vm.callFunction(invoke, vm.undefined, main).dispose();
      vm.executePendingJobs();
      const unhandled = rejected.values().next().value;
      if (unhandled) error = 'UnhandledPromiseRejection: ' + rejectionText(unhandled.reason);
      exitCode = process.getProp('exitCode').consume(value => value.toNumber());
    } catch (failure) {
      if (exitCode === undefined) error = errorText(failure);
    } finally {
      process.dispose();
      invoke.dispose();
      main.dispose();
    }
    if (outputLimited) error = outputLimitError;
    else if (performance.now() >= deadline && exitCode === undefined) error = javascriptTimeout;
    else if (exitCode) error = 'JavaScript 프로그램이 종료 코드 ' + exitCode + '를 반환했습니다.';

    stdout += stdoutDecoder.decode();
    stderr += stderrDecoder.decode();
    return { output: stdout, ...(error ? { error: [stderr.trim(), error].filter(Boolean).join('\n') } : {}) };
  } finally {
    for (const { promise, reason } of rejected.values()) {
      promise.dispose();
      reason.dispose();
    }
    vm.dispose();
  }
}

self.addEventListener('message', async ({ data }: MessageEvent<JavaScriptTask>) => {
  try {
    self.postMessage(await run(data));
  } catch (error) {
    self.postMessage({ output: '', error: errorText(error) });
  }
}, { once: true });
