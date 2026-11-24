// Runs the shipped browser worker in Node worker_threads, without mocking Java/WASM.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
const repo = new URL('../', import.meta.url);
export function assets() {
  return Object.fromEntries(['jdk-11.zip','runner.core.wasm','runner.core2.wasm','runner.core3.wasm'].map(name=> {
    const bytes = readFileSync(new URL(`public/java/${name}`,repo));
    return [name,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)];
  }));
}
export function runtime() {
  let listener;
  const scripts = new Map();
  const active = new Set();
  const parent = {};
  let sequence = 0;
  const prefix = `const {parentPort}=require('node:worker_threads'); globalThis.self=globalThis; globalThis.postMessage=value=>parentPort.postMessage(value); globalThis.addEventListener=(_name,handler)=>parentPort.on('message',data=>handler({data}));\n`;
  class WorkerBridge {
    constructor(url) {
      this.worker = new Worker(prefix+scripts.get(url),{eval:true});
      active.add(this);
      this.worker.on('message',data=>this.onmessage?.({data}));
      this.worker.on('error',error=>this.onerror?.(error));
    }
    postMessage(value,transfer) { this.worker.postMessage(value,transfer); }
    terminate() { active.delete(this); void this.worker.terminate(); }
  }
  vm.runInNewContext(readFileSync(new URL('dist/java-sandbox.js',repo),'utf8'), {
    window:{addEventListener(_name,handler){listener=handler;}},parent,Worker:WorkerBridge,
    Blob:class {constructor(parts){this.code=parts.join('');}},
    URL:{createObjectURL(blob){const key=String(sequence++);scripts.set(key,blob.code);return key;},revokeObjectURL(key){scripts.delete(key);}},
    ArrayBuffer,performance,setTimeout,clearTimeout,console
  });
  return (request,payload,onEvent=()=>{})=>new Promise((resolve,reject)=> {
    const abort = error => {clearTimeout(timer);for(const worker of active)worker.terminate();reject(error);};
    const timer=setTimeout(()=>abort(new Error('Java runtime harness timed out')),180_000);
    const port={postMessage(data){
      try {onEvent(data);} catch(error) {abort(error);return;}
      if(data.type==='done'){clearTimeout(timer);resolve(data);}
    },close(){}};
    listener({source:parent,data:{type:'welcome-baek-java-batch',request,assets:payload},ports:[port]});
  });
}
