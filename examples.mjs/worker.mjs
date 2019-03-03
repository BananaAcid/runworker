import {sendToMaster} from '../esm/mod.mjs';

//export default { // <- would create a sub property named 'default'
	export let action1 = async function (p1) {     //<-- all exported functions will be made available at the object
		console.log(p1, 1);
		await new Promise(resolve=>setTimeout(resolve,1500));

		sendToMaster('helloworld', 'hi');
		return 1;				//<-- posts back 
	};

	export let action2 = function(p2) {
		return 2;
	};

	export let action3 = new Promise( (resolve,reject)=>resolve(true) );

	export let namespace = {
		sub1: function sub1(p3) {
			return 3;
		},
	};

	export let list = [
		function list1() {
			console.log('list1!');
			return 4;
		},
		function list2(p5) {
			console.log('list2!');
			return 5;
		},
	];

	export let x = 1;
	export let y = "abc";
	export let z = true;
	export let v1 = null;

	export let suicide = ()=> process.exit();

	export let error = ()=> { throw new Error('test error'); };

	export let getY = function() { return this.y; };

	export let getNativeError = function() { return nonExistingObject.nonExistingValueToTriggerNativeError; };

//}

export let test = str => str + '!'; 




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
