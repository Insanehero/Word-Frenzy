window.onload = function() {
  var ws = new WebSocket('ws://localhost:8080', 'echo-protocol');
  var currentWordIndex = 0;
  var words = [];
  var me = '';
  var players = [];

  ws.onmessage = function(e) {
    data = JSON.parse(e.data);
    console.log(data.type);
    if (data.type.endsWith('Request')) {
      requestHandlers[data.type](data);
    } else {
      responseHandlers[data.type](data);
    }
  };

  var requestHandlers = {

  };

  var responseHandlers = {
    htmlResponse : function(data) {
      renderNewPage(data.page);
      $('#join').on('click', function(e) {
        var name = $('#username').val()
        if (/\s+/.test(name)) {
          $('.alert').fadeIn();
        } else {
          sendData(constructRequest('joinGame', {username: name}));
        }
      });
      if (data.route == 'game') {
        me = data.me;
      };
    },
    playersListResponse : function(data) {
      events();
      if (players) {
        for (var i = 0; i < players.length; i++) {
          var username = players[i];
          var hit = false;
          for (var playa in data.players) {
            if (data.players[playa].username == username) {
              var hit = true;
              break;
            }
          }
          if (!hit) {
            console.log(players.splice(i, 1));
            console.log(username);
            $('#user-' + username).remove();
          }
        }
      }

      data.players.forEach(function(player) {
        if (players.indexOf(player.username) == -1) {
          players.push(player.username);
          renderNewPage(player.element, 'player');
        }
      });
      //players = data.players;
    },
    wordsResponse : function(data) {
      $('#user-input').prop('disabled', false);
      $('#ready').hide();
      $('#alert').text("Get Ready!");
      $('#alert').show();
      setTimeout(function() {
        countDown(2, function(time) {
          $('#alert').text(time + "s");
        }, function() {
          $('#alert').hide();
          $('.game-input').show();
          $('.player-ready').hide();
          $('.player-game').show();
          watchKeys();
          currentWordIndex = 0;
          words = data.words;
          $('.word').text(words[currentWordIndex]);
          updateWord();
        });
      }, 500);
    },
    playerPlacementResponse : function(data) {
      var selector = '#user-' + data.username
      $(selector).find('.player-game').hide();
      $(selector).find('.player-place').show().text(data.place);
      if (data.username == me) {
        $('#alert').show();
        $('#alert').text(data.place);
      };
    },
    gameOverResponse : function(data) {
      setTimeout(function() {
        $('#alert').show();
        $('#alert').text('The game is over!');
        console.log('NEW AGmaess');
        $('#newGame').show();
      }, 1500)
    },
    playersReadyResponse : function(data) {
      data.players.forEach(function(player) {
        $('#user-' + player.username).find('.player-ready').css({
          color: 'rgb(173, 255, 174)',
          borderColor: 'rgb(173, 255, 174)'
        });
      });
    },
    playersWordsResponse : function(data) {
      $('#user-' + data.username).find('.word').text(data.word);
    }
  };

  function updateWord () {
    var text = words[currentWordIndex];
    if (!text) {
      $('.game-input').hide();
      sendData(constructResponse('playerFinished'));
      $('#user-input').prop('disabled', true);
    };
    $('#currentWord').text(text);
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

  function sendData(data) {
    ws.send(JSON.stringify(data));
  };

  function renderNewPage(page, route) {
    if (route === 'player') {
      $('#players').append(page);
    } else {
      $('#container').empty();
      $('#container').append(page);
    }
  }

  function events() {
    $('#ready').on('click', function() {
      $(this).css({
        color: 'rgb(173, 255, 174)',
        borderColor: 'rgb(173, 255, 174)'
      });
      $(this).text("READY!");
      sendData(constructResponse('playerReady'));
    });
  }

  function watchKeys() {
    $('body').on('keyup', function() {
      colorKeys();
      if ($('#user-input').val().toLowerCase() == words[currentWordIndex].toLowerCase()) {
        $('#user-input').val('');
        console.log("got the word!");
        currentWordIndex++;
        updateWord();
        sendData(constructResponse('playerWord', {word: words[currentWordIndex]}));
      };
    });

    function colorKeys() {
      var input = $('#user-input').val().toLowerCase().split('');
      var word = words[currentWordIndex].toLowerCase().split('');
      var breakIndex = 0;
      var matched = [];
      for (var i = 0; i < word.length; i++) {
        if (input[i] == word[i]) {
          matched.push(input[i]);
        } else {
          breakIndex = i;
          break;
        }
      }
      if (breakIndex >= 0) {
        var newword = word.slice(breakIndex);
        $('#currentWord').html("<span style='color: rgb(60, 217, 92)'>" + matched.join('') + "</span>" + newword.join(''));
      }
    };
  };

  function countDown (seconds, callback, next) {
      var time = seconds + ".0";
      var countdown = setInterval(function() {
          callback(time);
          time = parseFloat(time - 0.1).toFixed(1);
          if (time < 0) {
              clearInterval(countdown);
              next();
          }
      }, 100);
  }

  ws.onopen = function() {
    sendData(constructRequest('html', {route: 'home'}));
    console.log("connected to server");
  };

}
