'use strict';

const path = require('path');
const cluster = require('cluster');
const homeDir = require('os').homedir();
const Promise = require('bluebird');
const axon = require('axon');
const rpc = require('axon-rpc');
const BaseModule = require('./base');
const ChildProcessChannel = require('../channels/child_process');
const childProcessLoaderPath = path.resolve(__dirname, '../loaders/child_process');

module.exports = class ChildProcessModule extends BaseModule {

	constructor(moduleName, options={}, logger, bus){
		super(moduleName, options, logger);
		this.bus = bus;
		this.type = 'child_process';
	}

	async load(){
		this.logger.info(`Loading module with alias: ${this.alias}(${this.version})`);
		cluster.setupMaster({
			cwd: process.cwd(),
			stdio: [process.stdin, process.stdout, process.stderr, 'ipc'],
			uid: process.getuid(),
			gid: process.getgid(),
			execArgv: [],
			args: [
				`${this.name}`,
				JSON.stringify(this.options)
			],
			exec: `${childProcessLoaderPath}`
		});
		this.childProcess = cluster.fork();

		this.events.map((eventName) => {
			this.bus.on(`${this.alias}:${eventName}`, (data) => {
				this.childProcess.send({eventName: `${this.alias}:${eventName}`, eventData: data});
			});
		});

		this.rpcClient = null;

		return new Promise((resolve, reject) => {
			this.childProcess.once('message', (data) => {
				if(data === 'ready') {
					this.childProcess.removeAllListeners('message');

					// Register event handler
					this.childProcess.on('message', (data) => {
						this.bus.emit(data.eventName, data.eventData);
					});


					// Create socket for module
					const moduleSocket = axon.socket('req');
					const moduleSocketPath = `${homeDir}/.lisk-core/sockets/${this.alias}_rpc.sock`;
					this.rpcClient = new rpc.Client(moduleSocket);
					moduleSocket.connect(`unix://${moduleSocketPath}`);

					return setImmediate(resolve);
				} else {
					return setImmediate(reject, new Error('Child process sent some other event than ready.'));
				}
			});
		}).timeout(5000).then(() => {
			this.logger.info(`Ready module with alias: ${this.alias}(${this.version})`);
		});
	}

	async invoke(actionName, params) {
		return new Promise((resolve, reject) => {
			this.rpcClient.call('invoke', actionName, params, (err, result)=> {
				if(err) return setImmediate(reject, err);

				return setImmediate(resolve, result);
			});
		})
	}

	// This method will be called from the forked process only
	static async forkProcess(moduleName, moduleOptions){
		if(cluster.isMaster) {
			throw 'You can\'t call this method on master process.';
			process.exit(1);
		}

		const modulePackage = require(`../../../../modules/${moduleName}`);

		process.title = `${modulePackage.alias} (${modulePackage.pkg.version})`;

		const channel = new ChildProcessChannel(modulePackage.alias, modulePackage.events, modulePackage.actions, {});
		await channel.registerToBus();
		await modulePackage.load(channel, moduleOptions).then(() => {
			process.send('ready');
		});
	}
};
