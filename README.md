# runworker
Simple cluster worker module handling

# Installation
```sh
$ npm i runworker
```

# Usage
1. load the worker script
2. have the worker script `export` or `module.exports` functions to be callable from the master script
3. use those exported functions in your master script off the worker object

## .mjs / ECMAScript Modules
Uses `import` and `import()`, this is require free code (no magic constants and so on). You have to import `from 'runworker/esm'`.

### index.mjs
```js
import {runWorker, isMaster} from 'runworker/esm';

if (isMaster)(async () => {

	let worker = await runWorker('..path..to..worker/worker.mjs');

	let result = await worker.test('asd');
	console.log(result);

	worker.kill();

})();
```

### worker.mjs
```js
export let test = str => str + '!';

process.stdin.resume(); //so the worker will not close instantly and will be able to communicate
```
... or any time consuming function.


## .js / CommonJs Modules
Is `require()` based. It has one advantage: the worker path can be relative.

### index.js
```js
const {runWorker, isMaster} = require('runworker');

if (isMaster)(async () => {

	let worker = await runWorker('..path..to..worker/worker.mjs');

	let result = await worker.test('asd');
	console.log(result);

	worker.kill();

})();
```

### worker.mjs
```js
module.exports.test = str => str + '!';

process.stdin.resume(); //so the worker will not close instantly and will be able to communicate
```
... or any time consuming function.

# Methods, functions, events

## The master script
Since the clustering works by forking the running process, the master only script part has to be differentiated.
And since the worker object additions are based on `Promises`, we need to check if we are within the master proccess (import/require `isMaster` from this module) and wrap our code into an async closure.
```
if (isMaster)(async () => {

	// code ..

})();
```
The long form `if(isMaster) { let x = async()=>{ /* code .. */ }; x(); }` ).

## Helpers
The boolean constants `isMaster` and `isWorker` can be imported/required as well. They are streight from the internal cluster object.

The `runMaster(masterPathname)` can be used, to have your start script include the master script (taking care of the `if (isMaster)` part). This is a `Promise` to `await` and catch errors on as well.

## The worker object
- `runWorker(workerPathname)`    -- needs to be required/imported to initialize a worker, returns a Promise to await, resolves as [Cluster Worker](https://nodejs.org/api/cluster.html#cluster_class_worker) with a few additions

_Note:_ `runWorker(workerPathname [, useModeFast = true])` has a `useModeFast` that toggles 2 ways of loading the worker script:
1. __TRUE__: is faster: no IPC call to load script, but blocks longer on weak cpus
2. __FALSE__: does perform better on weak single-core / dual-cores: tells the fork (using the IPC) to load the worker resulting in less blocking

`runWorker()` returned worker gets additional members that can be used within the master on the worker object:
- `...()`                        -- all the exported methods proxied (as Promises) from the worker module
- `.sendToWorker(key, message)`  -- To send a custom message to the worker. **Usually you would use the proxied methods.** The worker can use `process.on('customKey', (msg)=>...)` to process it.
- `.workerPathname`              -- To retrive the loaded worker script file path
- all the usual [Cluster Worker](https://nodejs.org/api/cluster.html#cluster_class_worker) methods and properties apply
    - `.process.pid` can be used to access the unique worker id

`cluster` - can be required/imported in the master script as well to use `cluster.on(..)`

`cluster.workers[]` holds all workers (worker pool)

## messaging back

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