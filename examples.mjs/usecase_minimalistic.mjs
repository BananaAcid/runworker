import path from 'path';
import {runWorker, isMaster, cluster} from '../esm/mod.mjs';
const __dirname = path.resolve(path.dirname(decodeURI(new URL(import.meta.url).pathname)));


if (isMaster)(async () => {

	let worker = await runWorker(__dirname + '/worker.mjs');
	let worker2 = await runWorker(__dirname + '/workerSimple.mjs');

	let result = await worker.test('asd');
	console.log(result);

	let result2 = await worker2.addOne(2);
	console.log(result2);

	// halt for 5 secs (to let the workers show their tick)
	await new Promise(resolve=>setTimeout(resolve,5500));

	worker.kill();
	worker2.kill();

})();