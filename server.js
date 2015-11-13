var fs = require('fs');
//var express = require('express');
//var app = express();
var http = require('http');
var WebSocketServer = require('websocket').server;
var path = require('path');


function getWords(callback) {
  var options = {
    hostname: 'api.wordnik.com',
    port: 80,
    path: '/v4/words.json/randomWords',
    method: 'GET',
    headers: {
      'api_key': '1169abd1ba9560689d50309ddb8051598e7b7c04518f0c5c4'
    }
  };

  var req = http.get(options, function(res) {
    res.setEncoding('utf8');
    var data = '';
    res.on('data', function (chunk) {
      data += chunk
    });
    res.on('end', function() {
      data = JSON.parse(data);
      words = [];
      console.log(data);
      data.forEach(function(entry) {
        words.push(entry.word);
      })
      callback();
      console.log(words);
      console.log('No more data in response.')
    })
  });
}

var clients = {};
var clientCount = 0, gameCount = 0;
var games = {};

var words = ['Potato', 'Monkey', 'House', 'Mailbox', 'Townhouse', 'Mall', 'Book', 'Ball', 'Turtle', 'Bicycle'];

var server = http.createServer(function(req, res) {
  if (!fileServe(req, res)) {
    if (req.url == "/") {
      render('index', res);
    }
  }
  res.end();
});

function render(view, res) {
  res.writeHead(200, {'Content-Type': 'text/html'});
  var page = fs.readFileSync('./client/views/' + view + '.html', {encoding: 'utf8'});
  res.write(page);
};

function fileServe(req, res) {
  try {
  var encoding = 'utf8', contentType = '';
  var filePath = "." + req.url;
  var ext = path.extname(filePath);

  switch (ext) {
    case '.css':
      contentType = 'text/css';
      break;
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.png':
      contentType = 'image/png';
      encoding = 'binary';
      break;
    case '.jpg':
      contentType = 'image/jpg';
      encoding = 'binary';
      break;
    case '.gif':
      contentType = 'image/gif';
      encoding= 'binary';
      break;
  }

  if (contentType) {
    var contents = fs.readFileSync(filePath, {encoding: encoding}); //Loads the requested file contents, ex. CSS template
    res.writeHead(200, {'Content-Type': contentType});
    res.end(contents, encoding); //Renders the file on the webpage
    return true;
  } else {
    return false;
  }
  } catch (error){
    console.log(error);
  }
}

server.listen(8080, function() {
  console.log("Server running on port 8080");
})

var ws = new WebSocketServer({
  httpServer: server
});


ws.on('request', function(req) {

  var connection = req.accept('echo-protocol', req.origin);
  var clientID = clientCount++;
  clients[clientID] = {connection: connection, id: clientID};
  console.log('Client [' + clientID + '] has connected.');

  connection.on('message', function(data) {
    data = JSON.parse(data.utf8Data);
    if (data.type.endsWith('Request')) {
      requestHandlers[data.type](clients[clientID], data);
    } else {
      responseHandlers[data.type](clients[clientID], data);
    }

  });

  connection.on('close', function() {
    if (clients[clientID].hasOwnProperty('player')) {
      games[clients[clientID].player.gameID].removePlayer(clients[clientID].player);
    }
    delete clients[clientID];
    console.log('Client [' + clientID + '] disconnected.')
  });

});


var requestHandlers = {
  joinGameRequest : function(client, data) {
    client.player = new Player(data.username, client.id);
    var page = retrievePage('game');
    sendData(client.connection, constructResponse('html', {page: page, route: 'game', me: client.player.username}));
    findGame(client.player);
  },
  htmlRequest : function(client, data) {
    var page = retrievePage(data.route);
    sendData(client.connection, constructResponse('html', {page: page, route: data.route}));
  }
};

var responseHandlers = {
  playerReadyResponse : function(client, data) {
    client.player.isReady = true;
    games[client.player.gameID].checkReady();
  },
  playerFinishedResponse : function(client, data) {
    games[client.player.gameID].finishedPlayer(client.player);
  },
  playerWordResponse : function(client, data) {
    games[client.player.gameID].sendData(constructResponse('playersWords', {username: client.player.username, word: data.word}));
  }
};

function constructRequest(type, data) {
  if (!data) data = {};
  data.type = type + "Request";
  return data;
};

function constructResponse(type, data) {
  if (!data) data = {};
  data.type = type + "Response";
  return data;
};

function sendData(connection, data) {
  if (client === 'all') {
    for (var client in clients) {
      clients[client].connection.send(JSON.stringify(data));
    };
  } else {
    connection.send(JSON.stringify(data));
  }
};

function retrievePage(view, keys) {
  var page = fs.readFileSync('./client/views/' + view + '.html', {encoding: 'utf8'});
  if (keys) {
    page = keyReplacer(page, keys);
  }
  return page;
};

function keyReplacer(page, keys) {
    keys.forEach(function(key) {
        page = page.replace(key.match, key.value);
    });
    return page;
};

function findGame(player) {
  var joinableGame = null;

  for (var key in games) { //Check for open games to join
    var game = games[key];
    if (game != null && game.players.length < game.maxPlayers && game.state == 'open') {//Check for games with less than max players.
      console.log("Client [" + player.clientID + "] has joined Game [" + game.gameID + "]");
      joinableGame = game;
      break;
    }
  }

  if (!joinableGame) {
    getWords(function() {
      var gameID = gameCount++;
      console.log('Game created: ID [' + gameID + ']');
      joinableGame = new Game(gameID);
      games[joinableGame.gameID] = joinableGame;
      joinableGame.addPlayer(player);
    });
  } else {
    joinableGame.addPlayer(player);
  }
};

function Player(username, clientID) {
  this.username = username;
  this.isReady = false;
  this.isFinished = false;
  this.clientID = clientID;
  this.gameID = null;
  this.roundPoints = 0;
  this.element = retrievePage('player', [{match: '{{username}}', value: username}, {match: '{{name}}', value: username}]);

  this.getClient = function() {
    return clients[this.clientID];
  };
};

Player.prototype.sendData = function(data) {
  sendData(this.getClient().connection, data);
};

function Game(gameID) {
  this.gameID = gameID;
  this.players = [];
  this.isFull = false;
  this.state = 'open';
  this.maxPlayers = 4;
  this.words = words;
  this.finishedPlayers= [];
};

Game.prototype.addPlayer = function(player) {
  var pCount = this.players.length;
  if (pCount < this.maxPlayers) {
    player.gameID = this.gameID;
    this.players.push(player);
    this.sendData(constructResponse('playersList', {players: this.players}));
  }
};

Game.prototype.removePlayer = function(player) {
  this.players = this.players.filter(function(otherplayer) {
    if (otherplayer === player) {
      return false;
    } else {
      return true;
    }
  });
  if (this.players.length < 1) {
    console.log('Game removed: ID [' + this.gameID + ']');
    delete games[this.gameID];
  } else {
    this.sendData(constructResponse('playersList', {players: this.players}));
  }
};

Game.prototype.sendData = function(data) {
  this.players.forEach(function(player) {
    player.sendData(data);
  });
};

Game.prototype.checkReady = function() {
  var readyPlayers = this.players.filter(function(player){
    return player.isReady;
  });
  this.sendData(constructResponse('playersReady', {players: readyPlayers}));

  if (this.players.length > 1) {
    var check = this.players.every(function(player) {
      return player.isReady;
    });
    if (check === true) {
      this.state = 'in progress';
      console.log('everyones ready!');
      this.run();
    }
  }
};

Game.prototype.wordList = function() {
  var wordIndex = Math.floor(Math.random() * this.words.length);
  var word = this.words.splice(wordIndex, 1);
  this.currentWord = word;
  return word;
};

Game.prototype.run = function() {
  this.sendData(constructResponse('words', {words: this.words}))
};

Game.prototype.end = function() {
  this.status = 'open';
  this.finishedPlayers = [];
  this.players.forEach(function(player) {
    player.isReady = false;
    player.isFinished = false;
  });
  this.sendData(constructResponse('gameOver'));
};

Game.prototype.finishedPlayer = function(player) {
  var place = this.finishedPlayers.push(player);
  player.isFinished = true;
  this.sendData(constructResponse('playerPlacement', {username: player.username, place: getPlace(place)}));
  var check = this.players.every(function(player) {
    return player.isFinished;
  });
  if (check) {
    this.end();
  };
};

function getPlace(place) {
  switch (place) {
    case 1:
      place = "1st Place";
      break;
    case 2:
      place = "2nd Place";
      break;
    case 3:
      place = "3rd Place";
      break;
    case 4:
      place = "4th Place";
      break;
  }
  return place;
}
/*
function Round (words) {
  this.roundNum = 0;
  this.maxRounds = 10;
  this.roundTimeout = 8;
  this.words = words;
  this.currentWord = null;
  this.currentRoundTime = 0;
};

Round.prototype.nextRound = function() {
  if (this.roundNum > 10) {
    this.roundNum = 0;
    return false;
  } else {
    return this.roundNum++;
  }
};

Round.prototype.getWord = function() {
  var wordIndex = Math.floor(Math.random() * this.words.length);
  var word = this.words.splice(wordIndex, 1);
  this.currentWord = word;
  return word;
};

Round.prototype.run = function() {

};

function countDown (seconds, callback) {
    var time = seconds + ".0";
    var countdown = setInterval(function() {
        time = parseFloat(time - 0.1).toFixed(1);
        if (time < 0) {
            clearInterval(countdown);
            callback();
        }
    }, 100);
}
*/
