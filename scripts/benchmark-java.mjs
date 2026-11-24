import assert from 'node:assert/strict';
import { assets, runtime } from './java-runtime-harness.mjs';
const run=runtime();
const payload=assets();
const source='import java.io.*; import java.util.*; public class Main { public static void main(String[] args) throws Exception { BufferedReader r = new BufferedReader(new InputStreamReader(System.in)); StringTokenizer s = new StringTokenizer(r.readLine()); System.out.println(Integer.parseInt(s.nextToken()) + Integer.parseInt(s.nextToken())); } }';
for(const count of [2,2,20]) {
  const results=[];
  const start=performance.now();
  const done=await run({source,inputs:Array(count).fill('1 2')},payload,event=>{if(event.type==='result')results.push(event.result);});
  assert.equal(results.length,count);
  assert.ok(results.every(result=>!result.error&&result.output.trim()==='3'));
  console.log(JSON.stringify({count,elapsedMs:performance.now()-start,...done.metrics}));
}
