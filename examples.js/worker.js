const {sendToMaster} = require('../js/mod.js');

module.exports = {
	action1: async function(p1) {     //<-- all exported functions will be made available at the object
		console.log(p1, 1);
		await new Promise(resolve=>setTimeout(resolve,1500));

		sendToMaster('helloworld', 'hi');
		return 1;				//<-- posts back 
	},

	action2: function(p2) {
		return 2;
	},

	action3: new Promise( (resolve,reject)=>resolve(true) ),

	namespace: {
		sub1: function sub1(p3) {
			return 3;
		},
	},

	list: [
		function list1() {
			console.log('list1!');
			return 4;
		},
		function list2(p5) {
			console.log('list2!');
			return 5;
		},
	],

	x: 1,
	y: "abc",
	z: true,
	v1: null,

	suicide: ()=> process.exit(),

	error: ()=> { throw new Error('test error'); },

	getY: function() { return this.y; },

	getNativeError: function() { return nonExistingObject.nonExistingValueToTriggerNativeError; },

};

module.exports.test = str => str + '!'; 




// infinite async loop
(async () => {
	console.log('starting worker loop.');

	while(true) {
		// halt for 5 secs
		await new Promise(resolve=>setTimeout(resolve,5000));

		console.log('tick.');

		sendToMaster('helloworld', 'worker tick');
	}
})();


