module.exports = function(reducers) {
  return function(state, action) {
    var bail = false
    function bailEarly() {
      bail = true
    }
    for(var i=0; i < reducers.length; i++) {
      state = reducers[i](state, action, bailEarly)
      if(bail) break;
    }
    return state
  }
}
