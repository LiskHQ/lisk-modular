const Promise = require('bluebird');
const { ModuleFactory, ComponentFactory } = require('@lisk/core-utils');
const EventEmitterChannel = require('@lisk/core-utils/src/channels/event_emitter');
const Bus = require('./bus');

const logger = ComponentFactory.create('logger');

module.exports = class Controller {
	constructor(options) {
		logger.info('Initializing controller');
		this.config = options;
		this.modules = {};
		this.channel = null;

		// Setting up bus
		if (!this.bus) {
			this.bus = new Bus(this, {
				wildcard: true,
				delimiter: ':',
				maxListeners: 1000,
			});
		}
	}

	async load() {
		await this.establishChannel();
		await this.loadModules();

		logger.info('Bus listening to events', this.bus.getEvents());
		logger.info('Bus ready for actions', this.bus.getActions());
	}

	getModule(alias) {
		return this.modules[alias];
	}

	async establishChannel() {
		this.channel = new EventEmitterChannel(
			'lisk',
			['ready'],
			['getComponentConfig'],
			this.bus,
			{},
		);

		await this.channel.registerToBus();

		this.channel.action(
			'getComponentConfig',
			async action => this.config.components[action.params],
		);
	}

	async loadModules() {
		Object.keys(this.config.modules).forEach(moduleName => {
			const moduleConfig = this.config.modules[moduleName];
			const module = ModuleFactory.create(
				moduleConfig.loadAs,
				moduleName,
				moduleConfig,
				logger,
				this.bus,
			);
			this.modules[module.alias] = module;
		});

		await Promise.map(Object.keys(this.modules), m => this.modules[m].load());
	}
};
