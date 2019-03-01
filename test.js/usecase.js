const cpus = require('os').cpus;
const rwModule = require('../js/mod.js');
const runWorker = rwModule.runWorker;
const isMaster = rwModule.isMaster;
const cluster = rwModule.cluster;

const numCPUs = cpus().length;


if (isMaster)(async () => {

	console.log(`Master ${process.pid} is running`);

	cluster.on('exit', (worker, code, signal) => {
		// proccess.pid = worker's unique identification id (os proccess id)
		// workerPathname = the script used for the worker - this can be used to spin off a similar worker
		console.log(`worker ${worker.process.pid} died (path: ${worker.workerPathname})`);
	});

	// just a list of different workers
	let possibleWorkerPaths = [
		'./worker.js',
		'./workerSimple.js',
		//'/tmp/not…loadble…test'
	];

	// initialized workers
	let workers = [];

	// Fork workers in parallel. Add them to the workers array when ready ... 
	let tasks = [];
	for (let i = 0; i < numCPUs; i++) {
		// get a random workerPath
		let randomWorkerPath = possibleWorkerPaths[Math.round(Math.random() * (possibleWorkerPaths.length -1))];

		let workerPromise = runWorker( randomWorkerPath ).then( newWorker => workers.push(newWorker) );
		tasks.push(workerPromise);
	}
	// ... And wait for all to be ready.
	await Promise.all(tasks).catch((err) => {
		// a worker file was not found or any other error 
		//  (should be visible on the console allready)

		// we require all workers to be up and running.
		process.exit(1);
	});

	// let us know, how many were started.
	console.log('Number of cpus:', numCPUs, ' - workers started:', workers.length);


	// we use a promise to be able to have the code await all the killers actions
	let killer = () => new Promise( (resolve) => {
		
		// every two seconds we tell a random worker to kill itself
		setTimeout(async () => {
			// get random worker
			let idx = Math.round(Math.random() * (workers.length -1));

			// extract worker from the list
			let worker = workers.splice(idx, 1)[0];

			// tell it to kill itself - we call the workers function
			await worker.suicide().catch(()=>{ /* will always throw: a dead man can not answer ... */});
			// -> instead of .catch(): you could also use a try..catch block

			// rerun if there is one left
			if (workers.length)
				await killer();
			
			// return to the main code, resolve all nested calls
			resolve();
		}, 2000);

	});

	// start to kill workers
	await killer();

	console.log('\nEnd. No living workers left.');

	// NOTE:
	//
	// master will exit, when all workers are dead. 
	//  - even if this async function is not done yet.
	// Because all this code is in an async closure.

})();
