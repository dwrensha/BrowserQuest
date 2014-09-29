
var cls = require("./lib/class"),
    url = require('url'),
    wsserver = require("websocket-server"),
    miksagoConnection = require('websocket-server/lib/ws/connection'),
    worlizeRequest = require('websocket').request,
    http = require('http'),
    Utils = require('./utils'),
    _ = require('underscore'),
    BISON = require('bison'),
    WS = {},
    useBison = false;

Capnp = require('capnp');
fs = require('fs');
HackSessionContext = Capnp.import('schema/hack-session.capnp').HackSessionContext;
var rpcConn; // put this out here to prevent it from being garbage collected.

var serveStatic = require('serve-static')
var serveFiles = serveStatic('client', {'index': ['index.html']})

module.exports = WS;


/**
 * Abstract Server and Connection classes
 */
var Server = cls.Class.extend({
    init: function(port) {
        this.port = port;
    },
    
    onConnect: function(callback) {
        this.connection_callback = callback;
    },
    
    onError: function(callback) {
        this.error_callback = callback;
    },
    
    broadcast: function(message) {
        throw "Not implemented";
    },
    
    forEachConnection: function(callback) {
        _.each(this._connections, callback);
    },
    
    addConnection: function(connection) {
        this._connections[connection.id] = connection;
    },
    
    removeConnection: function(id) {
        delete this._connections[id];
    },
    
    getConnection: function(id) {
        return this._connections[id];
    }
});


var Connection = cls.Class.extend({
    init: function(id, connection, server) {
        this._connection = connection;
        this._server = server;
        this.id = id;
    },
    
    onClose: function(callback) {
        this.close_callback = callback;
    },
    
    listen: function(callback) {
        this.listen_callback = callback;
    },
    
    broadcast: function(message) {
        throw "Not implemented";
    },
    
    send: function(message) {
        throw "Not implemented";
    },
    
    sendUTF8: function(data) {
        throw "Not implemented";
    },
    
    close: function(logError) {
        log.info("Closing connection to "+this._connection.remoteAddress+". Error: "+logError);
        this._connection.close();
    }
});

/**
 * MultiVersionWebsocketServer
 * 
 * Websocket server supporting draft-75, draft-76 and version 08+ of the WebSocket protocol.
 * Fallback for older protocol versions borrowed from https://gist.github.com/1219165
 */
WS.MultiVersionWebsocketServer = Server.extend({
    worlizeServerConfig: {
        // All options *except* 'httpServer' are required when bypassing
        // WebSocketServer.
        maxReceivedFrameSize: 0x10000,
        maxReceivedMessageSize: 0x100000,
        fragmentOutgoingMessages: true,
        fragmentationThreshold: 0x4000,
        keepalive: true,
        keepaliveInterval: 20000,
        assembleFragments: true,
        // autoAcceptConnections is not applicable when bypassing WebSocketServer
        // autoAcceptConnections: false,
        disableNagleAlgorithm: true,
        closeTimeout: 5000
    },
    _connections: {},
    _counter: 0,
    
    init: function(port) {
        var self = this;
        
        this._super(port);
        

        this._httpServer = http.createServer(function(request, response) {
            serveFiles(request, response, function (request, response, next) {
                var path = url.parse(request.url).pathname;
                if (path == "/status") {
                    if(self.status_callback) {
                        response.writeHead(200);
                        response.write(self.status_callback());
                        response.end();
                    }
                } else {
                    response.writeHead(404);
                    response.end();
                }
            });
        });
        this._httpServer.listen(port, function() {
          log.info("Server is listening on port "+port);
          // need to wait another 10ms or so before we know /tmp/sandstorm-api exists
          setTimeout(function() {
            console.log("the socket should exist now");
            rpcConn = Capnp.connect("unix:/tmp/sandstorm-api");
            console.log("connected");
            var context = rpcConn.restore("HackSessionContext", HackSessionContext);
            context.getPublicId().then(function(result) {
              console.log("got it: " + result.publicId);
            }).catch(function(err) {
              console.log("what?");
              console.log("error: " + err);
            });
            context.listApiTokens().then(function(result) {
              var tokens = result.tokens;
              if (tokens.length == 0) {
                console.log("no tokens!");
                context.generateApiToken({petname:"browserquest"}).then(function(result) {
                  console.log(result);
                  fs.writeFile('/var/www/js/apitoken.js',
                               "define(function () {var ApiToken = {};\n" +
                               "ApiToken.value = '" + result.token + "';\n" +
                               "return ApiToken;});");
                }).catch(function (err) {
                  console.log(err);
                });
              } else {
                console.log("already have a token");
              }
            });

          }, 15);
        });
        this._miksagoServer = wsserver.createServer();
        this._miksagoServer.server = this._httpServer;
        this._miksagoServer.addListener('connection', function(connection) {
            // Add remoteAddress property
            connection.remoteAddress = connection._socket.remoteAddress;

            // We want to use "sendUTF" regardless of the server implementation
            connection.sendUTF = connection.send;
            var c = new WS.miksagoWebSocketConnection(self._createId(), connection, self);
            
            if(self.connection_callback) {
                self.connection_callback(c);
            }
            self.addConnection(c);
        });
        
        this._httpServer.on('upgrade', function(req, socket, head) {
            if (typeof req.headers['sec-websocket-version'] !== 'undefined') {
                // WebSocket hybi-08/-09/-10 connection (WebSocket-Node)
                var wsRequest = new worlizeRequest(socket, req, self.worlizeServerConfig);
                try {
                    wsRequest.readHandshake();
                    var wsConnection = wsRequest.accept(wsRequest.requestedProtocols[0], wsRequest.origin);
                    var c = new WS.worlizeWebSocketConnection(self._createId(), wsConnection, self);
                    if(self.connection_callback) {
                        self.connection_callback(c);
                    }
                    self.addConnection(c);
                }
                catch(e) {
                    console.log("WebSocket Request unsupported by WebSocket-Node: " + e.toString());
                    return;
                }
            } else {
                // WebSocket hixie-75/-76/hybi-00 connection (node-websocket-server)
                if (req.method === 'GET' &&
                    (req.headers.upgrade && req.headers.connection) &&
                    req.headers.upgrade.toLowerCase() === 'websocket' &&
                    req.headers.connection.toLowerCase() === 'upgrade') {
                    new miksagoConnection(self._miksagoServer.manager, self._miksagoServer.options, req, socket, head);
                }
            }
        });
    },
    
    _createId: function() {
        return '5' + Utils.random(99) + '' + (this._counter++);
    },
    
    broadcast: function(message) {
        this.forEachConnection(function(connection) {
            connection.send(message);
        });
    },
    
    onRequestStatus: function(status_callback) {
        this.status_callback = status_callback;
    }
});


/**
 * Connection class for Websocket-Node (Worlize)
 * https://github.com/Worlize/WebSocket-Node
 */
WS.worlizeWebSocketConnection = Connection.extend({
    init: function(id, connection, server) {
        var self = this;
        
        this._super(id, connection, server);
        
        this._connection.on('message', function(message) {
            if(self.listen_callback) {
                if(message.type === 'utf8') {
                    if(useBison) {
                        self.listen_callback(BISON.decode(message.utf8Data));
                    } else {
                        try {
                            self.listen_callback(JSON.parse(message.utf8Data));
                        } catch(e) {
                            if(e instanceof SyntaxError) {
                                self.close("Received message was not valid JSON.");
                            } else {
                                throw e;
                            }
                        }
                    }
                }
            }
        });
        
        this._connection.on('close', function(connection) {
            if(self.close_callback) {
                self.close_callback();
            }
            delete self._server.removeConnection(self.id);
        });
    },
    
    send: function(message) {
        var data;
        if(useBison) {
            data = BISON.encode(message);
        } else {
            data = JSON.stringify(message);
        }
        this.sendUTF8(data);
    },
    
    sendUTF8: function(data) {
        this._connection.sendUTF(data);
    }
});


/**
 * Connection class for websocket-server (miksago)
 * https://github.com/miksago/node-websocket-server
 */
WS.miksagoWebSocketConnection = Connection.extend({
    init: function(id, connection, server) {
        var self = this;
        
        this._super(id, connection, server);
        
        this._connection.addListener("message", function(message) {
            if(self.listen_callback) {
                if(useBison) {
                    self.listen_callback(BISON.decode(message));
                } else {
                    self.listen_callback(JSON.parse(message));
                }
            }
        });
        
        this._connection.on('close', function(connection) {
            if(self.close_callback) {
                self.close_callback();
            }
            delete self._server.removeConnection(self.id);
        });
    },
    
    send: function(message) {
        var data;
        if(useBison) {
            data = BISON.encode(message);
        } else {
            data = JSON.stringify(message);
        }
        this.sendUTF8(data);
    },
    
    sendUTF8: function(data) {
        this._connection.send(data);
    }
});
