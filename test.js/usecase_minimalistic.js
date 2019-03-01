const rwModule = require('../js/mod.js');
const runWorker = rwModule.runWorker;
const isMaster = rwModule.isMaster;


if (isMaster)(async () => {

	let worker = await runWorker('./worker.js');
	let worker2 = await runWorker('./workerSimple.js');

	let result = await worker.test('asd');
	console.log(result);

	let result2 = await worker2.addOne(2);
	console.log(result2);

	// halt for 5 secs (to let the workers show their tick)
	await new Promise(resolve=>setTimeout(resolve,5500));

	worker.kill();
	worker2.kill();

})();