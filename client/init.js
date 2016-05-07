var architect = require("architect")

var components = HIVE_COMPONENTS
.map((file) => {
  var module = require(file)
  if(typeof(module) != "function") {
    throw new Error("Component "+file+" doesn\'t expose a setup function for registering.")
  }
  return {
    packagePath: file
  , setup: module
  , provides: module.provides || []
  , consumes: module.consumes || []
  }
})

architect.createApp(components, function(er, app) {
  if(er) throw er
  app.getService("ui").start(HIVE_CONFIG)
})
