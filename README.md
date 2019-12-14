# runworker
Simple worker handling (in a cluster or just as multi threaded) in NodeJs.

Any exported worker function can be awaited in the main script. Since it it using the clusters
and Promises behind the scene, you may just use it to handle stuff multithreaded.
Or orchestrate a worker pool.

# Installation
```sh
$ npm i runworker
```

# Usage
1. init the worker script
2. have the worker script `export` or `module.exports` functions/promises to be callable from the master script
3. use those exported functions in your master script off the worker object

## .mjs / ECMAScript Modules
Uses `import` and `import()`, this is require free code (no magic constants and so on). You have to import `from 'runworker/esm'`. Starting the script with `node --experimental-modules ????.mjs` or `node -r esm ????.mjs`.

### index.mjs
```js
import {runWorker, isMaster} from 'runworker/esm';

if (isMaster)(async () => {

	let worker = await runWorker('..path..to..worker/worker.mjs');

	let result = await worker.test('asd');  // execute worker's exported fn 
	console.log(result);

	worker.kill();

})();
```

### worker.mjs
```js
export let test = str => str + '!';

process.stdin.resume(); //so the worker will not close instantly and will be able to communicate
```
... or any worker function.


## .js / CommonJs Modules
Is `require()` based. It has one advantage: the worker path can be relative.

### index.js
```js
const {runWorker, isMaster} = require('runworker');

if (isMaster)(async () => {

	let worker = await runWorker('..path..to..worker/worker.mjs');

	let result = await worker.test('asd');  // execute worker's exported fn
	console.log(result);

	worker.kill();

})();
```

### worker.mjs
```js
module.exports.test = str => str + '!';

process.stdin.resume(); //so the worker will not close instantly and will be able to communicate
```
... or any worker function.

## Old school: Promise based
Naturally, you can use the Promise chain syntax instead of `await`

### index.js
```js
const {runWorker, isMaster} = require('runworker');

if (isMaster) {
	let newWorker = null;
	runWorker('..path..to..worker/worker.mjs') // returns worker
	.then( worker => newWorker = worker ) // save worker, returns worker
	.then( worker => worker.test('asd') ) // execute worker's exported fn, returns result
	.then( console.log ) // logs result, returns nothing
	.then( newWorker.kill ); // calls kill, returns nothing
}
```

... and worker as above.

# Methods, functions, events

## The master script
Since the clustering works by forking the running process, the master only script part has to be differentiated.
And since the worker object additions are based on `Promises`, we need to check if we are within the master proccess (import/require `isMaster` from this module) and wrap our code into an async closure.
```
if (isMaster)(async () => {

	// code ..

})();
```
The long form is `if(isMaster) { let x = async()=>{ /* code .. */ }; x(); }`

## Helpers
The boolean constants `isMaster` and `isWorker` can be imported/required as well. They are streight from the internal cluster object.

`runMaster(masterPathname)` can be used, to have your start script include the master script (taking care of the `if (isMaster)` part). This is a `Promise` to `await` and catch errors on as well.

## The worker script
Export any function to be proxied to the master script's worker object.

Exported functions may be of type: normal function, async function or promise. They may only return serializeable values (JSON.stringify compatible).

Exported variables will not be proxied, use a custom getter or settter function. _The reason not it is not implemented using observables: If the value would be send through, the master script could have triggered a follow up function and the value might not yet have been set on the worker (race conditions)._

## The worker object
__Is used in the master script.__

- `runWorker(workerPathname)`    -- needs to be required/imported to initialize a worker, returns a Promise to await, resolves as [Cluster Worker](https://nodejs.org/api/cluster.html#cluster_class_worker) with a few additions (mainly, the proxies to the exported functions - see additional members below)!

_Note:_
-  `runWorker(workerPathname [, useModeFast = true [, enableRespawn = false]])`
- `runWorker(workerPathname, { useModeFast: true, enableRespawn: false })` (with option object, properties are optional)
 has a `useModeFast` that toggles 2 ways of loading the worker script:
1. __TRUE__: is faster: no IPC call to load script, but blocks longer on weak cpus
2. __FALSE__: does perform better on weak single-core / dual-cores: tells the fork (using the IPC) to load the worker resulting in less blocking
and has a `enableRespawn` that can be used to automatically listen to `on('error' ...)` and check for `.exitedAfterDisconnect` to run a new worker and triggers `.on('respawn', function(newWorker){ let old = this; ... })` on the worker object.


`runWorker()` returned worker gets __additional members__ that can be used within the master on the worker object:
- `...()`                        -- all the exported methods proxied (as Promises) from the worker module
- `.sendToWorker(key, message)`  -- To send a custom message to the worker. **Usually you would use the proxied methods.** The worker can use `process.on('customKey', (msg)=>...)` to process it.
- `.workerPathname`              -- To retrive the loaded worker script file path
- all the usual [Cluster Worker](https://nodejs.org/api/cluster.html#cluster_class_worker) methods and properties apply
    - `.process.pid` can be used to access the unique worker id

_Note:_ Multiple workers can be instantiated from different or the same module scripts.

`cluster` - can be required/imported in the master script as well from the `runworker module` to use `cluster.on(..)`

`cluster.workers[]` holds all workers (worker pool)

## messaging back
__From the worker script.__

- `sendToMaster(customKey, customMessage)` -- can be required/imported in the worker to send an event to the master. The master will be able to use `workerObj.on('customKey', (msg)=>...)` to receive it.

# Examples
check out the `examples.mjs/` and `examples.js/` folders to see some code. The `usecase.*` files are rather complete in setting up a cluster. The _minimalistic_ versions are not - they lack catching errors.

# How it works
using `runWorker(..)`
1. master: spins off a fork, sets the script file path as property (is not used other then to provide the user with the file path to be able to kick off another worker when it died)
2. master: waits for the fork to have started
3. master: tells (messages) the fork to load the worker script
4. worker: answers (messages back) with a list of functions and how they are nested
5. master: creates proxy functions using promises of the same object structure (to message a worker what function to call)
6. master: resolves the promise with the worker object

now you are free to await the proxy functions on the worker object or listen to events: `.on(..)`

The normal cluster module and its IPC is used, so no speed difference in communication. BUT: the spin up time can be faster/slower - since the specific worker module file is loaded, when the fork has started and is ready to communicate.
