
module.exports.suicide = ()=> process.exit();

module.exports.addOne = function addOne(val) {return val + 1;};


// infinite async loop
(async () => {
	console.log('starting workerSimple loop.');

	while(true) {
		// halt for 5 secs
		await new Promise(resolve=>setTimeout(resolve,5000));

		// just log to console.
		console.log('tock.');
	}
})();