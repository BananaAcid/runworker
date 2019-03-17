/**
 * runworker - Simple cluster worker module handling
 *
 * @author Nabil Redmann <repo@bananaacid.de>
 * @license MIT
 */

const debug = require('debug');
const path = require('path');
const cluster = require('cluster');
const crypto = require('crypto');
const REF = 'runWorker';      // IPC message identifier
const debugInfo = debug(REF);
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor; // for instanceof compares
let worker_mode_fast = false;


/**
 * Builds a map of all properties of an object
 *
 * @param      {Object}  obj     The input object
 * @param      {string}  _key    The property's key
 * @return     {Object}  The map
 * 
 * @example
 *	{ type: 'Object',
 *	  key: undefined,
 *	  children:
 *	   [ { type: 'Object',
 *	       key: 'default',
 *	       children:
 *	        [ { type: 'AsyncFunction', key: 'action1' },
 *	          { type: 'Function', key: 'action2' },
 *	          { type: 'Promise', key: 'action3' },
 *	          { type: 'Object',
 *	            key: 'namespace',
 *	            children: [ { type: 'Function', key: 'sub1' } ] },
 *	          { type: 'Array',
 *	            key: 'list',
 *	            children:
 *	             [ { type: 'Function', key: '0' },
 *	               { type: 'Function', key: '1' } ] },
 *	          { type: 'number', key: 'x' },
 *	          { type: 'string', key: 'y' },
 *	          { type: 'boolean', key: 'z' },
 *	          { type: 'null', key: 'v1' },
 *	          { type: 'Function', key: 'exit' },
 *	          { type: 'Function', key: 'error' } ] },
 *	     { type: 'Function', key: 'test' },
 *	     { type: 'string', key: 'z' } ] }
 */
function buildMap(obj, _key) {
	if (obj instanceof Function && !(obj instanceof AsyncFunction))
		return {type: 'Function', key: _key};
	else if (obj instanceof AsyncFunction)
		return {type: 'AsyncFunction', key: _key};
	else if (obj instanceof Promise)
		return {type: 'Promise', key: _key};
	else if (Array.isArray(obj)) {
		let children = [];
		for (let i in obj)
			children.push( buildMap(obj[i], i) );
		return {type: 'Array', key: _key, children: children};
	}
	else if (typeof obj === "object" && obj !== null) {
		let children = [];
		for (let i in obj)
			children.push( buildMap(obj[i], i) );
		return {type: 'Object', key: _key, children: children};
	}
	else if (obj === null)
		return {type: 'null', key: _key};
	else
		return {type: typeof obj, key: _key};
}

/**
 * convert an error class to a serializeable simple plain object
 *
 * @param      {Error}  error   The error
 * @return     {Object} An object with all properties normalized
 */
function convertErrorToPlainObj(error) {
	// convert the error to a plain object to be able to send it through to the master
	let plainObject = {};
	Object.getOwnPropertyNames(error).forEach(key => plainObject[key] = error[key]);
	return plainObject;
}

/**
 * worker handler (used in child instance)
 *
 * @param      {string}   workerJsFile  The worker js file path
 */
async function _runWorkerHandler(workerJsFile) {

	debugInfo('initializing worker ' + workerJsFile);
	// get worker js
	let requiredWorker;
	try {
		requiredWorker = require(workerJsFile);
	}
	catch(err) {
		console.error(err);
		sendToMaster('error', convertErrorToPlainObj(err));
		process.exit(1);
	}
	debugInfo('worker loaded');

	//receive-post functionPath and arguments as json_encoded_string
	process.on('message', async (msg) => {
		// {ref:'runWorker.js', cmd: 'call', id: randx, functionPath: [...fn], arguments: arguments_array}
		if (msg.ref !== REF) return;

		else if (msg.cmd == 'emit')
			process.emit(msg.key, msg.obj);

		else if (msg.cmd == 'call') {
			debugInfo('exec call ', msg);
			
			// get to the fn within the worker
			let fn = requiredWorker, 
				fnLast = requiredWorker;
			for (let fnPart of msg.functionPath) {
				fnLast = fn;
				fn = fn[fnPart]; // loosing context
			}

			let error = null,
				ret;

			try {
				if (fn instanceof Function && !(fn instanceof AsyncFunction))
					//ret = fn(...msg.arguments);
					ret = fn.apply(fnLast, msg.arguments); // reapplying context

				else if (fn instanceof AsyncFunction)
					//ret = await fn(...msg.arguments);
					ret = await fn.apply(fnLast, msg.arguments); // reapplying context

				else if (fn instanceof Promise)
					//ret = await fn(...msg.arguments);
					ret = await fn.apply(fnLast, msg.arguments); // reapplying context

				else // should never happen. Since proxy functions exist on the worker object in master, all functions known are mapped
					throw new Error(`worker ${workerJsFile} has no function '${msg.functionPath.join('.')}'`);
			}
			catch(err) { // thrown within the functions
				// log locally
				console.error(REF+':WORKER', err);
				error = convertErrorToPlainObj(err);
			}

			//post-send {ref:'runWorker.js', cmd: 'call-ret', id: randx, functionPath: fn, result: JSON.stringify(ret) };
			let message = {ref:REF, cmd: 'call-ret', id: msg.id, functionPath: msg.functionPath, error: error, result: ret !== undefined ? JSON.stringify(ret):undefined };
			debugInfo('returning result: ', message);
			process.send( message );
		}

		/* ??
		on exported property change
			post-send {ref:'runWorker.js', cmd: 'content-update', obj: json_encode(properties) };
		*/
	});

	debugInfo('announcing fns');
	process.send( {ref: REF, cmd: 'content', obj: buildMap(requiredWorker) } );
		//-> all exports as json_encode to runWorker()
		// => ready (this will make runWorker return the object)
}

/**
 * Start a worker
 * 
 * @desc
 *   this is the function to call in the master to start a worker
 *   appends to worker:
 *     .sendToWorker(key, message)  - to trigger a custom message
 *     .workerPathname              - the loaded worker script file path
 *
 * @param      {string}   workerJsFile           The worker js file, requires a full path (ESM version)
 * @param      {boolean}  [useModeFast=true]     The use the fast mode to load the worker js file
 * @param      {boolean}  [enableRespawn=false]  The enable automatic respawn, spin off a new worker on crash, triggers .on('respawn', function(newWorker){ let old = this; ... })
 * @return     {Promise}  A promise that gets resolved when the worker is ready to be interfaced with
 *//**
 * Start a worker
 * 
 * @desc
 *   this is the function to call in the master to start a worker
 *   appends to worker:
 *     .sendToWorker(key, message)  - to trigger a custom message
 *     .workerPathname              - the loaded worker script file path
 *
 * @param      {string}   workerJsFile                   The worker js file, requires a full path (ESM version)
 * @param      {object}   options                        Options
 * @param      {boolean}  [options.useModeFast=true]     The use the fast mode to load the worker js file
 * @param      {boolean}  [options.enableRespawn=false]  The enable automatic respawn, spin off a new worker on crash, triggers .on('respawn', function(newWorker){ let old = this; ... })
 * @return     {Promise}  A promise that gets resolved when the worker is ready to be interfaced with
 */
function runWorker(workerJsFile, useModeFast = true, enableRespawn = false) {

	let options = {useModeFast: useModeFast, enableRespawn: enableRespawn};
	if (typeof useModeFast !== "boolean" && typeof useModeFast === "object")
		options = {...options, ...useModeFast};

	return new Promise( (resolve, reject) => {
	
		// random number as key, value is the resolve,reject fn
		let returnResolvers = {}; 

		// spin off webservice/cluster and load _runWorkerHandler
		// https://nodejs.org/api/cluster.html
		let retObj = cluster.fork(options.useModeFast ? {workerJsFile: workerJsFile} : undefined);
		retObj.workerPathname = workerJsFile;   // just remember - will be available on all cluster functions returning the worker

		// just for completeness
		// for master to trigger custom events
		//  e.g. worker.send('customkey', 'bla');
		//       process.on('customkey', msg=>console.log(msg))
		retObj.sendToWorker = function sendToWorker(key, message) {
			if (~['disconnect', 'exit', 'fork', 'listening', 'message', 'online', 'setup' /*, 'error'*/].indexOf(key))
				throw new Error(`'${key}' is a reserved message keyword`);

			reObj.send( {ref: REF, cmd: 'emit', key: key, obj: msg} );
		};

		// will be available to the return object
		retObj.on('error', function(err) {
			console.error(err);
			try { reject(new Error('Could not initialize worker. ' + err.message, workerJsFile)); } catch(_){} // for initial call
		});

		// Listen to exit to respawn. Afer error handler.
		if (options.enableRespawn)
			retObj.on('error', async function(err) {
				if (retObj.exitedAfterDisconnect !== true) {
					debugInfo('respawning ' + this.process.id);
					let newWorker = await runWorker(workerJsFile, useModeFast, enableRespawn);
					retObj.emit('respawn', newWorker);
				}
			});

		// will be available to the return object
		//retObj.on('disconnect', ()=>() ) // Noop

		// will be available to the return object 
		retObj.on('exit', () => {
			//iterate all returnResolvers and call returnResolvers[...].reject()
			for (let i of Object.values(returnResolvers))
				i.reject(new Error('Worker exited.', workerJsFile));
		});

		// results will be resolved here
		retObj.on('message', (msg) => {
			// {ref:'runWorker.js',cmd,id,functionPath,result}

			if (msg.ref !== REF) return;

			else if (msg.cmd == 'emit')
				retObj.emit(msg.key, msg.obj);

			// receiving a result from a function on the worker
			else if (msg.cmd=='call-ret' && msg.id) {
				debugInfo('function result', msg);

				if (!returnResolvers[msg.id]) {
					throw new Error('trying to resolve an answered function - ' + JSON.stringify(msg));
				}
				else {
					if (msg.error)
						returnResolvers[msg.id].reject( msg.error );
					else
						returnResolvers[msg.id].resolve( msg.result?JSON.parse(msg.result):undefined );

					delete returnResolvers[msg.id];
				}
			}

			// wait for initial post receive of the worker functions
			else if (msg.cmd == 'content') {
				debugInfo('got announced fns', msg.obj);
				/* ??
					retObj.append
						- post-receive all BASIC type (json_encoded)
				*/

				// will handle buildMap()
				let mapper = function(obj, parent, pathParts = []) {

					let newParent = parent;
					let newPathParts = pathParts;
					if (obj.key) {
						newPathParts = [...pathParts, obj.key];
					}

					debugInfo('mapping: ', newPathParts);


					if (obj.type == 'Array') {
						if (obj.key) {
							parent[obj.key] = [];
							newParent = parent[obj.key];
						}

						for (let el of obj.children)
							mapper(el, newParent, newPathParts);
					}
					else if (obj.type == 'Object') {
						if (obj.key) {
							parent[obj.key] = {};
							newParent = parent[obj.key];
						}
						for (let el of obj.children)
							mapper(el, newParent, newPathParts);
					}


					// bild accessible proxy functions on worker object
					//  all module.exports == function/promise
					else if (obj.type == "Function" || obj.type == "AsyncFunction" || obj.type == "Promise" ) {
						let functionName = obj.key;

						// create promises for each function  -> 
						//   they resolve with the received return
						let fn = function () {
							// get function arguments to be send to the worker
							let args = Array.from(arguments);
							let fnName = newPathParts;

							return new Promise( function(resolve, reject) { 
								if (!retObj.isDead()) {
									
									let randx =  crypto.randomBytes(3*4).toString('base64'); // unique message id

									// store for result receive
									returnResolvers[randx] = {resolve: resolve, reject: reject};

									let message = {ref: REF, cmd: 'call', id: randx, functionPath: fnName, arguments: args};
									debugInfo('send fn call ', message);

									// post-send
									retObj.send(message);

									// on message will resolve this promise
								}
								else
									reject(`worker '${workerJsFile}' not available`);
							});//return Promise
						};
						if (functionName) parent[functionName] = fn;
						else parent = fn;
					}//if

				};//mapper

				debugInfo('mapping fns');
				mapper(msg.obj, retObj);
				debugInfo('all fns mapped');

				debugInfo('returning worker');
				resolve( retObj );
			}

		});

		if (!worker_mode_fast) {
			// post-send workerJsFile to _runWorkerHandler
			retObj.send( {ref: REF, cmd: 'init', workerJsFile: workerJsFile} );
		}
	});
}

/**
 * Trigger a custom event on the worker object at the master script
 * @desc
 *  e.g. master:  worker.on('customkey', msg=>console.log(msg))
 *       worker:  sendToMaster('customkey', msg)
 *
 * @param      {string}  key     The custom event key
 * @param      {Object}  msg     The message, must be a serializeable object
 */
function sendToMaster(key, msg) {
	if (~['disconnect', 'exit', 'fork', 'listening', 'message', 'online', 'setup' /*, 'error'*/].indexOf(key))
		throw new Error(`'${key}' is a reserved message keyword`);

	process.send( {ref: REF, cmd: 'emit', key: key, obj: msg} );
}

/**
 * run a master script
 * 
 * @desc Simple helper if the user wants to seperate the master from the main js. Wraps the import with isMaster.
 *
 * @param      {string}  mainJsFile  The master js file
 * @return     {Promise}  A promise that gets resolved with the exports of the master script, when it is loaded and executed
 */
function runMaster(mainJsFile) {
	if (cluster.isMaster)
		return new Promise((resolve,reject) => {try { let ret = require(path.resolve(path.dirname(module.parent.filename), mainJsFile)); resolve(ret); } catch(err) {reject(err);} });// = Promise. Handle error in the script that calls runMaster() !
	else
		return undefined;
}

module.exports.runMaster = runMaster;
module.exports.runWorker = runWorker;
module.exports.sendToMaster = sendToMaster;
module.exports.cluster = cluster;
module.exports.isMaster = cluster.isMaster;
module.exports.isWorker = cluster.isWorker;



/**
 * slave? load worker js file
 * 
 * never init twice, since a worker itself might require this file to get `sendToMaster()`
 */
if (cluster.isWorker && !global[REF+'_INIT']) {
    global[REF+'_INIT'] = true; // run once only

    // this way is faster: no IPC call to load script but blocks longer on weak cpus
    let workerJsFile = process.env.workerJsFile;
    if (workerJsFile) {
        worker_mode_fast = true;
        _runWorkerHandler(path.resolve(path.dirname(module.parent.filename), workerJsFile));
    }

    // this way does perform better on single-core / dual-core: tells the fork using IPC to load the worker (less blocking)
    else {
        process.on('message', (msg) => {
            if (msg.ref !== REF) return;

            // {ref:'runWorker.js', cmd: init, workerJsFile: string} )
            if (msg.cmd == 'init' && msg.workerJsFile)
                _runWorkerHandler(path.resolve(path.dirname(module.parent.filename), msg.workerJsFile));
        });
    }
}
