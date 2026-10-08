let fs = require('fs');
let async = require('async');
let http = require('http');

let apiInterfaces = require('./apiInterfaces.js')(config.daemon, config.wallet, config.api);
let market = require('./market.js');

let cleanupInterval = config.redis.cleanupInterval && config.redis.cleanupInterval > 0 ? config.redis.cleanupInterval : 15;

let logSystem = 'charts';
require('./exceptionWriter.js')(logSystem);

function startDataCollectors () {
	async.each(Object.keys(config.charts.pool), function (chartName) {
		let settings = config.charts.pool[chartName];
		if (settings.enabled) {
			setInterval(function () {
				collectPoolStatWithInterval(chartName, settings);
			}, settings.updateInterval * 1000);
		}
	});

	let userSettings = config.charts.user.hashrate;
	if (userSettings.enabled) {
		setInterval(function () {
			collectUsersHashrate('hashrate', userSettings);
		}, userSettings.updateInterval * 1000)
	}

	let workerSettings = config.charts.user.worker_hashrate;
	if (workerSettings && workerSettings.enabled) {
		setInterval(function () {
			collectWorkersHashrate('worker_hashrate', workerSettings);
		}, workerSettings.updateInterval * 1000);
	}
}

let chartStatFuncs = {
	hashrate: getPoolHashrate,
	miners: getPoolMiners,
	workers: getPoolWorkers,
	difficulty: getNetworkDifficulty,
	price: getCoinPrice,
	profit: getCoinProfit
};

let statValueHandler = {
	avg: function (set, value) {
		set[1] = (set[1] * set[2] + value) / (set[2] + 1);
	},
	avgRound: function (set, value) {
		statValueHandler.avg(set, value);
		set[1] = Math.round(set[1]);
	},
	max: function (set, value) {
		if (value > set[1]) {
			set[1] = value;
		}
	}
};

let preSaveFunctions = {
	hashrate: statValueHandler.avgRound,
	hashrateSolo: statValueHandler.avgRound,
	workers: statValueHandler.max,
	workersSolo: statValueHandler.max,
	difficulty: statValueHandler.avgRound,
	price: statValueHandler.avg,
	profit: statValueHandler.avg
};

function storeCollectedValues (chartName, values, settings) {
	for (let i in values) {
		if (values[i]) {
			storeCollectedValue(chartName + ':' + i, [values[i]], settings);
		}
	}
}

function storeCollectedValue (chartName, values, settings) {
	if (!values) { return false; }

	let now = new Date() / 1000 | 0;
	values.forEach((value, index) => {
		let name = `${chartName}` + (index === 0 ? '' : 'Solo')
		return getChartDataFromRedis(name, function (sets) {
			let lastSet = sets[sets.length - 1];
			if (!lastSet || now - lastSet[0] > settings.stepInterval) {
				lastSet = [now, value, 1];
				sets.push(lastSet);
				while (now - sets[0][0] > settings.maximumPeriod) {
					sets.shift();
				}
			} else {
				preSaveFunctions[name] ?
					preSaveFunctions[name](lastSet, value) :
					statValueHandler.avgRound(lastSet, value);
				lastSet[2]++;
			}

			if (getStatsRedisKey(name)
				.search(`^${config.coin}:charts:hashrate$`) >= 0) {
				redisClient.set(getStatsRedisKey(name), JSON.stringify(sets), 'EX', (86400 * cleanupInterval));
			} else if (getStatsRedisKey(name)
				.search(`^${config.coin}:charts:hashrateSolo$`) >= 0) {
				redisClient.set(getStatsRedisKey(name), JSON.stringify(sets), 'EX', (86400 * cleanupInterval));
			} else {
				redisClient.set(getStatsRedisKey(name), JSON.stringify(sets));
			}
			log('info', logSystem, name + ' chart collected value ' + value + '. Total sets count ' + sets.length);
		});
	})
}

function collectPoolStatWithInterval (chartName, settings) {
	async.waterfall([
		chartStatFuncs[chartName],
		function (values, callback) {
			storeCollectedValue(chartName, values, settings, callback);
		}
	]);
}

function getChartDataFromRedis (chartName, callback) {
	redisClient.get(getStatsRedisKey(chartName), function (error, data) {
		callback(data ? JSON.parse(data) : []);
	});
}

function getStatsRedisKey (chartName) {
	return config.coin + ':charts:' + chartName;
}

function getPoolStats (callback) {
	apiInterfaces.pool('/stats', function (error, data) {
		if (error) {
			log('error', logSystem, 'Unable to get API data for stats: ' + error);
		}
		callback(error, data);
	});
}

function getPoolHashrate (callback) {
	getPoolStats(function (error, stats) {
		callback(error, stats.pool ? [Math.round(stats.pool.hashrate), Math.round(stats.pool.hashrateSolo)] : null);
	});
}

function getPoolMiners (callback) {
	getPoolStats(function (error, stats) {
		callback(error, stats.pool ? [stats.pool.miners, stats.pool.minersSolo] : null);
	});
}

function getPoolWorkers (callback) {
	getPoolStats(function (error, stats) {
		callback(error, stats.pool ? [stats.pool.workers, stats.pool.workersSolo] : null);
	});
}

function getNetworkDifficulty (callback) {
	getPoolStats(function (error, stats) {
		callback(error, stats.pool ? [stats.network.difficulty] : null);
	});
}

function getUsersHashrates (callback) {
	apiInterfaces.pool('/miners_hashrate', function (error, data) {
		if (error) {
			log('error', logSystem, 'Unable to get API data for miners_hashrate: ' + error);
		}
		let resultData = data && data.minersHashrate ? data.minersHashrate : {};
		callback(resultData);
	});
}

function getWorkersHashrates (callback) {
	apiInterfaces.pool('/workers_hashrate', function (error, data) {
		if (error) {
			log('error', logSystem, 'Unable to get API data for workers_hashrate: ' + error);
		}
		let resultData = data && data.workersHashrate ? data.workersHashrate : {};
		callback(resultData);
	});
}

function collectUsersHashrate (chartName, settings) {
	let redisBaseKey = getStatsRedisKey(chartName) + ':';
	redisClient.keys(redisBaseKey + '*', function (keys) {
		let hashrates = {};
		for (let i in keys) {
			hashrates[keys[i].substr(redisBaseKey.length)] = 0;
		}
		getUsersHashrates(function (newHashrates) {
			for (let address in newHashrates) {
				hashrates[address] = newHashrates[address];
			}
			storeCollectedValues(chartName, hashrates, settings);
		});
	});
}

function getUserHashrateChartData (address, callback) {
	getChartDataFromRedis('hashrate:' + address, callback);
}

function collectWorkersHashrate (chartName, settings) {
	let redisBaseKey = getStatsRedisKey(chartName) + ':';
	redisClient.keys(redisBaseKey + '*', function (keys) {
		let hashrates = {};
		for (let i in keys) {
			hashrates[keys[i].substr(redisBaseKey.length)] = 0;
		}
		getWorkersHashrates(function (newHashrates) {
			for (let addr_worker in newHashrates) {
				hashrates[addr_worker] = newHashrates[addr_worker];
			}
			storeCollectedValues(chartName, hashrates, settings);
		});
	});
}

function convertPaymentsDataToChart (paymentsData) {
	let data = [];
	if (paymentsData && paymentsData.length) {
		for (let i = 0; paymentsData[i]; i += 2) {
			data.unshift([+paymentsData[i + 1], paymentsData[i].split(':')[1]]);
		}
	}
	return data;
}

function getCoinPrice (callback) {
	let source = config.prices.source;
	let currency = config.prices.currency;

	let tickers = [config.symbol.toUpperCase() + '-' + currency.toUpperCase()];
	market.get(source, tickers, function (data) {
		let error = (!data || !data[0] || !data[0].price) ? 'No exchange data for ' + config.symbol.toUpperCase() + ' to ' + currency.toUpperCase() + ' using ' + source : null;
		let price = (data && data[0] && data[0].price) ? data[0].price : null;
		callback(error, [price]);
	});
}

function getCoinProfit (callback) {
	getCoinPrice(function (error, price) {
		if (error) {
			callback(error);
			return;
		}
		getPoolStats(function (error, stats) {
			if (error) {
				callback(error);
				return;
			}
			callback(null, [stats.lastblock.reward * price / stats.network.difficulty / config.coinUnits]);
		});
	});
}

function getPoolChartsData (callback) {
	let chartsNames = [];
	let redisKeys = [];
	for (let chartName in config.charts.pool) {
		if (config.charts.pool[chartName].enabled) {
			chartsNames.push(chartName);
			redisKeys.push(getStatsRedisKey(chartName));
		}
	}
	chartsNames.push('hashrateSolo')
	chartsNames.push('minersSolo')
	chartsNames.push('workersSolo')
	redisKeys.push(getStatsRedisKey('hashrateSolo'))
	redisKeys.push(getStatsRedisKey('minersSolo'))
	redisKeys.push(getStatsRedisKey('workersSolo'))
	if (redisKeys.length) {
		redisClient.mget(redisKeys, function (error, data) {
			let stats = {};
			if (data) {
				for (let i in data) {
					if (data[i]) {
						stats[chartsNames[i]] = JSON.parse(data[i]);
					}
				}
			}
			callback(error, stats);
		});
	} else {
		callback(null, {});
	}
}

function getUserChartsData (address, paymentsData, callback) {
	let stats = {};
	let chartsFuncs = {
		hashrate: function (callback) {
			getUserHashrateChartData(address, function (data) {
				callback(null, data);
			});
		},

		payments: function (callback) {
			callback(null, convertPaymentsDataToChart(paymentsData));
		}
	};
	for (let chartName in chartsFuncs) {
		if (!config.charts.user[chartName].enabled) {
			delete chartsFuncs[chartName];
		}
	}
	async.parallel(chartsFuncs, callback);
}

module.exports = {
	startDataCollectors: startDataCollectors,
	getUserChartsData: getUserChartsData,
	getPoolChartsData: getPoolChartsData
};
