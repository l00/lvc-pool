let fs = require('fs');
let async = require('async');
let http = require('http');

let charts = require('./charts.js');

let logSystem = 'chartsDataCollector';
require('./exceptionWriter.js')(logSystem);

log('info', logSystem, 'Started');
charts.startDataCollectors();
