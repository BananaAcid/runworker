const debug = require('debug');
const rwModule = require('../js/mod.js');
const runWorker = rwModule.runWorker;
const isMaster = rwModule.isMaster;

// handle log param -- windows and linux/osx have a different way of settung up env vars, so we use this to set debugs options
if (~process.argv.indexOf('--log') || ~process.argv.indexOf('-l')) debug.enable('*');


if (isMaster)(async () => {
	console.log('Master init');

	let worker = await runWorker(__dirname + '/worker.js');
	console.log('worker inited' /*, worker*/);
	worker.on('error', (err)=>console.log(err));

	worker.on('helloworld', msg => console.log('event helloworld: ', msg));

	let ret = await worker.test('asd');
	console.log('worker:test said: ', ret);

	ret = await worker.getY();
	console.log('worker:getY said: ', ret);

	try {
		ret = await worker.getNativeError();
		console.log('worker:getNativeError said: ', ret);
	}
	catch (e) {
		console.log('worker:getNativeError (error with stacktrace) - message: ', e.message);
	}

	ret = await worker.action1('out');
	console.log('worker:action1 said: ', ret);


	let worker2 = await runWorker(__dirname + '/worker.js');
	console.log('worker2 inited' /*, worker2*/);
	worker2.on('error', (err)=>console.log(err));

	ret = await worker.test('asd');
	console.log('worker1:test said: ', ret);

	ret = await worker2.test('efg');
	console.log('worker2:test said: ', ret);


	setInterval(async () => {
		worker.list[0]().then(r=>console.log('worker:list[0] said: ', r));
		await worker.list[1](); 
	}, 2000);

	setTimeout(()=> 
		worker.error().catch(err=>console.log('ERROR-TEST worker:error triggered error:',err))
	, 2000 );

})();