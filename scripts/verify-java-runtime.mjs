import assert from 'node:assert/strict';
import { runtime, assets } from './java-runtime-harness.mjs';
const run = runtime();
const history = [];
async function batch(source, inputs) {
  const results = [];
  const done = await run({source,inputs}, assets(), event => {
    if (event.type === 'result') results.push(event.result);
  });
  assert.equal(results.length, inputs.length);
  history.push({inputs,results,metrics:done.metrics});
  console.log(JSON.stringify(history.at(-1)));
  return results;
}
const isolated = await batch(`import java.io.*; public class Main {
  static class Counter { static int value; }
  public static void main(String[] args) throws Exception {
    String input = new BufferedReader(new InputStreamReader(System.in)).readLine();
    System.out.println(++Counter.value + ":" + System.getProperty("wb-test", "clean") + ":" + input);
    System.setProperty("wb-test", "dirty");
  }
}`, ['a','b','c']);
assert.deepEqual(isolated.map(r=>r.output.trim()), ['1:clean:a','1:clean:b','1:clean:c']);
assert.ok(isolated.every(r=>!r.error));
const recovered = await batch(`import java.io.*; public class Main {
  public static void main(String[] args) throws Exception {
    String input = new BufferedReader(new InputStreamReader(System.in)).readLine();
    if (input.equals("loop")) { while (true) {} }
    if (input.equals("throw")) throw new IllegalArgumentException("expected failure");
    if (input.equals("exit")) System.exit(0);
    System.out.println(input);
  }
}`, ['loop','good','throw','exit','after']);
assert.match(recovered[0].error, /시간 초과/);
assert.equal(recovered[1].output.trim(),'good');
assert.ok(recovered[2].error);
assert.equal(recovered[3].output,'');
assert.ok(!recovered[3].error);
assert.equal(recovered[4].output.trim(),'after');
const invalid = await batch('public class Main { syntax error }',['a','b']);
assert.ok(invalid.every(r=>r.error));
console.log('PASS: static state, nested classes, input, system properties, timeout, exceptions, System.exit and compile errors');
