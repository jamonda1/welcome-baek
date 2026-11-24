// @vitest-environment jsdom
import { MessageChannel } from 'node:worker_threads';
import { afterEach, expect, it, vi } from 'vitest';
import { javaAssets } from '../src/java/protocol';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.querySelectorAll('iframe').forEach(frame=>frame.remove()); });
async function fixture(failFirst = false) {
  vi.resetModules();
  vi.stubGlobal('MessageChannel', MessageChannel);
  vi.stubGlobal('chrome', {runtime:{getURL:(path:string)=>`http://localhost/${path}`}});
  let failed = false;
  const fetcher = vi.fn(async () => {
    if (failFirst && !failed) { failed = true; throw new Error('network failure'); }
    return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};
  });
  vi.stubGlobal('fetch',fetcher);
  // jsdom does not implement HTMLIFrameElement.sandbox's DOMTokenList.
  const createElement = document.createElement.bind(document);
  vi.spyOn(document,'createElement').mockImplementation(((name:string,...args:any[])=> {
    const node = createElement(name,...args);
    if (name === 'iframe') Object.defineProperty(node,'sandbox',{value:{add:vi.fn()}});
    return node;
  }) as typeof document.createElement);
  const requests: any[] = [];
  const append = document.documentElement.append.bind(document.documentElement);
  vi.spyOn(document.documentElement,'append').mockImplementation((...nodes) => {
    append(...nodes);
    const frame = nodes[0] as HTMLIFrameElement;
    vi.spyOn(frame.contentWindow!,'postMessage').mockImplementation(((message:any,_origin:any,transfer:any[])=> {
      requests.push(message);
      const port = transfer[0];
      message.request.inputs.forEach((_input:string,index:number)=> {
        port.postMessage({type:'start',index});
        port.postMessage({type:'result',index,result:{output:String(index)}});
      });
      port.postMessage({type:'done',metrics:{preparationMs:0,compileMs:0,caseMs:[],totalMs:1,cached:requests.length>1}});
      port.close();
    }) as any);
    queueMicrotask(()=>frame.dispatchEvent(new Event('load')));
  });
  const {runJavaBatch} = await import('../src/java/client');
  return {fetcher,requests,runJavaBatch};
}
it('reads assets once and reuses the sandbox for subsequent complete batches',async()=> {
  const {fetcher,requests,runJavaBatch} = await fixture();
  const events:any[]=[];
  await runJavaBatch({source:'code',inputs:['a','b']},event=>events.push(event));
  expect(events.map(event=>event.type)).toEqual(['start','result','start','result']);
  const firstFrame=document.querySelector('iframe');
  const metrics=await runJavaBatch({source:'code',inputs:['c']},()=>{});
  expect(fetcher).toHaveBeenCalledTimes(javaAssets.length);
  expect(document.querySelector('iframe')).toBe(firstFrame);
  expect(requests[0].assets).toBe(requests[1].assets);
  expect(metrics.cached).toBe(true);
});
it('retries asset loading after a failure',async()=> {
  const {runJavaBatch,requests,fetcher} = await fixture(true);
  await expect(runJavaBatch({source:'code',inputs:['a']},()=>{})).rejects.toThrow('network failure');
  await runJavaBatch({source:'code',inputs:['b']},()=>{});
  expect(requests).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(javaAssets.length*2);
});
