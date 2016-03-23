'use strict';

var express = require('express');
var bodyParser = require('body-parser');

var Amqp = require('azure-iot-device-amqp').Amqp;
var DeviceClient = require('azure-iot-device').Client;
var ServiceClient = require('azure-iothub').Client;
var Message = require('azure-iot-device').Message;
var EventHubClient = require('azure-event-hubs').Client;
var DeviceConnectionString = require('azure-iot-device').ConnectionString;
var azure = require('azure-storage');
var nconf = require('nconf');

nconf.argv().env().file('./config.json');
var eventHubName = nconf.get('eventHubName');
var ehConnString = nconf.get('ehConnString');
var deviceConnString = nconf.get('deviceConnString');
var storageAcountName = nconf.get('storageAcountName');
var storageAccountKey = nconf.get('storageAccountKey');
var storageTable = nconf.get('storageTable');
var iotHubConnString = nconf.get('iotHubConnString');

var deviceId = DeviceConnectionString.parse(deviceConnString).DeviceId;
var deviceClient = DeviceClient.fromConnectionString(deviceConnString, Amqp);
var iotHubClient = ServiceClient.fromConnectionString(iotHubConnString, Amqp);

// event hub alerts
var alerts = [];
var ehclient = EventHubClient.fromConnectionString(ehConnString, eventHubName)
ehclient.createReceiver('$Default', '0', { startAfterTime: Date.now() })
    .then(function(rx) {
        rx.on('errorReceived', function(err) { console.log(err); });
        rx.on('message', function(message) {
            alerts.push(message.body);
            alerts = alerts.slice(-5); // keep last 5
        });
    });

// table storage
var tableSvc = azure.createTableService(storageAcountName, storageAccountKey);
tableSvc.createTableIfNotExists(storageTable, function(err, result, response) {
    if (err) {
        console.log('error looking up table');
        console.log(err)
    }
});

// website setup
var app = express();
var port = nconf.get('port');
app.use(express.static('public'));
app.use(express.static('bower_components'));
app.use(bodyParser.json());

// app api
app.get('/api/alerts', function(req, res) {
    res.json(alerts);
});

app.get('/api/temperatures', function(req, res) {
    var query = new azure.TableQuery()
        .select(['eventtime', 'temperaturereading', 'deviceid'])
        .where('PartitionKey eq ?', deviceId);
    tableSvc.queryEntities(storageTable, query, null, function(err, result, response) {
        res.json(result.entries.slice(-10));
    })
})

var completedCallback = function(err, res) {
    if (err) { console.log(err); }
    else { console.log(res); }
};

app.post('/api/command', function(req, res) {
    console.log('command received: ' + req.body.command);

    var command = 'your-off-string';
    if (req.body.command === 1) {
        command = 'your-on-string';
    }

    iotHubClient.open(function(err) {
        if (err) {
            console.error('Could not connect: ' + err.message);
        } else {
            var data = JSON.stringify({ message: command });
            var message = new Message(data);
            console.log('Sending message: ' + message.getData());
            iotHubClient.send(deviceId, message, printResultFor('send'));
        }
    });

    // Helper function to print results in the console
    function printResultFor(op) {
        return function printResult(err, res) {
            if (err) {
                console.log(op + ' error: ' + err.toString());
            } else {
                console.log(op + ' status: ' + res.constructor.name);
            }
        };
    }

    res.end();
});

deviceClient.open(function(err, result) {
    if (err) {
        console.log('could not connect: ' + err.message);
        return;
    }
    console.log('client connected');

    deviceClient.on('message', function(msg) {
        console.log('Id: ' + msg.messageId + ' Body: ' + msg.data);
        deviceClient.complete(msg, completedCallback);
    });

    deviceClient.on('error', function(err) {
        console.error('Error: ' + err.message);
    })

    deviceClient.on('disconnect', function() {
        console.log('client disconnected');
        deviceClient.removeAllListeners();
        deviceClient.connect(connectCallback);
    });
});


app.listen(port, function() {
    console.log('app running on http://localhost:' + port);
});
