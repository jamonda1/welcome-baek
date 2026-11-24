// @vitest-environment node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { javaAssets } from '../src/java/protocol';
const ticks = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());
function fixture() {
  const workers: FakeWorker[] = [];
  const parent = {};
  let listener: (event: unknown) => void;
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: () => void;
    message: any;
    terminate = vi.fn();
    constructor(_url: string) { workers.push(this); }
    postMessage(message: unknown) { this.message = message; }
    reply(data: unknown) { this.onmessage?.({ data }); }
  }
  vm.runInNewContext(readFileSync('dist/java-sandbox.js','utf8'), {
    window: { addEventListener(_type: string, handler: typeof listener) { listener = handler; } }, parent,
    Worker: FakeWorker, Blob: class {}, URL: { createObjectURL: () => 'worker', revokeObjectURL: vi.fn() },
    ArrayBuffer, performance, setTimeout, clearTimeout
  });
  const request = (source = 'code', inputs = ['a','b']) => {
    const messages: any[] = [];
    listener({ source: parent, data: { type: 'welcome-baek-java-batch', request: {source,inputs},
      assets: Object.fromEntries(javaAssets.map(name => [name,new ArrayBuffer(1)])) },
    ports: [{ postMessage: (value: unknown) => messages.push(value), close: vi.fn() }] });
    return messages;
  };
  const compiled = { result: {output:''}, prepared: {jdk:{},modules:{}}, classes: {Main:[1,2]}, preparationMs:12, operationMs:30 };
  return {workers,request,compiled};
}
it('compiles once, uses fresh workers per case, caches unchanged code and recompiles changed code', async () => {
  const {workers,request,compiled} = fixture();
  const messages = request();
  expect(workers[0].message.action).toBe('compile');
  workers[0].reply(compiled); await ticks();
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  expect(workers[1].message).toMatchObject({action:'execute',input:'a',classes:compiled.classes});
  workers[1].reply({result:{output:'first'},preparationMs:0,operationMs:1}); await ticks();
  expect(workers[2]).not.toBe(workers[1]);
  expect(workers[2].message).toMatchObject({action:'execute',input:'b'});
  workers[2].reply({result:{output:'second'},preparationMs:0,operationMs:1}); await ticks();
  expect(messages.map(message=>message.type)).toEqual(['start','result','start','result','done']);
  expect(messages.at(-1).metrics.cached).toBe(false);
  const warm = request('code',['c']);
  expect(workers[3].message.action).toBe('execute');
  workers[3].reply({result:{output:'warm'},preparationMs:0,operationMs:1}); await ticks();
  expect(warm.at(-1).metrics).toMatchObject({cached:true,compileMs:0,preparationMs:0});
  request('different',['d']);
  expect(workers[4].message).toMatchObject({action:'compile',source:'different',prepared:compiled.prepared});
  workers[4].reply({...compiled,result:{output:'',error:'compile error'},classes:undefined}); await ticks();
});
it('reports a compilation failure for every case without trying to execute them', async () => {
  const {workers,request} = fixture();
  const messages = request();
  workers[0].reply({result:{output:'',error:'syntax error'},preparationMs:0,operationMs:1}); await ticks();
  expect(workers).toHaveLength(1);
  expect(messages.filter(message=>message.type==='result').map(message=>message.result.error)).toEqual(['syntax error','syntax error']);
  expect(messages.at(-1).type).toBe('done');
});
it('terminates an infinite case after 5 seconds and runs the next case with the same compiled classes', async () => {
  vi.useFakeTimers();
  const {workers,request,compiled} = fixture();
  const messages = request();
  workers[0].reply(compiled); await ticks();
  workers[1].reply({phase:'running'});
  await vi.advanceTimersByTimeAsync(5000);
  expect(workers[1].terminate).toHaveBeenCalledOnce();
  expect(messages.find(message=>message.type==='result').result.error).toContain('시간 초과');
  expect(workers[2].message).toMatchObject({action:'execute',input:'b',classes:compiled.classes});
  workers[2].reply({result:{output:'ok'},preparationMs:0,operationMs:1}); await ticks();
  expect(messages.at(-1).type).toBe('done');
});
