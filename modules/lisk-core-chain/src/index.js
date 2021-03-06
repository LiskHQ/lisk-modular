const packageJSON = require('../package.json');
const Chain = require('./chain');

let blockChain = null;

module.exports = {
	alias: 'chain',
	pkg: packageJSON,
	defaults: {},
	events: ['newTransaction', 'newBlock', 'forgingStatusChange'],
	actions: ['verifyTransaction'],
	async load(channel, options) {
		blockChain = new Chain(channel, options);
		channel.once('lisk:ready', blockChain.bootstrap.bind(blockChain));
	},
	// eslint-disable-next-line no-unused-vars
	async unload(channel, options) {
		blockChain.logger.info('Unloading module chain');
	},
};
