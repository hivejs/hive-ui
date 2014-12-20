var page = require('page.js')

Object.keys(require.modules)
  .forEach(function(module) {
    if(~module.indexOf('~hive-')) require(module)
  })

page.start()