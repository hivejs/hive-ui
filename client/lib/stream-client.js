var dataplex = require('dataplex')
  , Primus = require('./primus')

module.exports = function(baseURL, access_token) {
  var plex = dataplex()

  var stream = new Primus(baseURL,{
    reconnect: {
      max: 60000 // Number: The max delay before we try to reconnect.
    , min: 500 // Number: The minimum delay before we try reconnect.
    , retries: Infinity // Number: How many times we shoult try to reconnect.
    }
  })
  stream.on('open', function() {
      
      authenticate(er => {
        if(er) return
        plex.emit('connect')
      })
    })
  stream.on('reconnect scheduled', function (err) {
      plex.emit('disconnect')
    })
  stream.on('end', function() {
      plex.emit('disconnect')
    })
  stream.on('error', function (err) {
      setTimeout(() => {throw err}, 0)
    })
  stream.pipe(plex).pipe(stream)

  return plex

  function authenticate(cb) {
    var authStream = plex.open('/authenticate')
    authStream.once('data', function(chunk){
      try {
        var auth = JSON.parse(chunk).authenticated
        if(auth) {
          cb()
        }else {
          cb(new Error('Authentication failed'))
        }
      }catch(e){
        cb(new Error('Authentication failed due to a connection problem'))
      }
    })
    authStream.write(access_token)
  }
}
