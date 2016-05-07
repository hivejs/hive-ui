var cookie = require('tiny-cookie')
module.exports = setup
module.exports.consumes = ['session']

function setup(plugin, imports, register) {
 var session = imports.session

 session.registerAuthenticationProvider('token', {
   silent: function() {
     return cookie.get('token')
   }
 })

 register()
}
