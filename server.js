'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var Amqp = require('azure-iot-device-amqp').Amqp;
var Client = require('azure-iot-device').Client;
var Message = require('azure-iot-device').Message;
var connectionString = '<your connection string>';
var client = Client.fromConnectionString(connectionString, Amqp);

var app = express();
app.use(express.static('public'))
app.use(bodyParser.json());

var completedCallback = function(err, res) {
    if(err) {
        console.log(err);
    }
    else {
        console.log(res);
    }
};

app.post('/api/command', function(req, res) {
   console.log('command received: ' + req.body.command);
   
   var command = 'your-off-string';
   if(req.body.command === 1) {
       command = 'your-on-string';
   }
   
   var message = new Message({Message:command});
   client.sendEvent(message, completedCallback);
   
   res.end(); 
});

var connectCallback = function(err) {
  if(err) {
      console.log('could not connect: ' + err.message);
      return;
  }
  console.log('client connected');
  
  client.on('message', function(msg) {
     console.log('Id: ' + msg.messageId + ' Body: ' + msg.data);
     client.complete(msg, completedCallback); 
  });
  
  client.on('error', function(err) {
      console.error('Error: ' + err.message);
  })
  
  client.on('disconnect', function() {
     console.log('client disconnected');
     client.removeAllListeners();
     client.connect(connectCallback); 
  });
};

client.open(connectCallback);

app.listen(3000, function() {
   console.log('app running on http://localhost:3000'); 
});
