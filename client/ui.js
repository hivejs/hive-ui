/**
 * hive.js
 * Copyright (C) 2013-2015 Marcel Klehr <mklehr@gmx.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License version 2
 * as published by the Mozilla Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the Mozilla Public License
 * along with this program.  If not, see <https://www.mozilla.org/en-US/MPL/2.0/>.
 */
var AtomicEmitter = require('atomic-emitter')
  , vdom = require('virtual-dom')
  , h = vdom.h
  , domDelegator = require('dom-delegator')()
  , redux = require('redux')
  , reduceReducers = require('reduce-reducers')
  , pathToRegexp = require('path-to-regexp')
  , throttlePerFrame = require('per-frame')

import reduxGen from 'redux-gen'

// Determine baseURL
var src = document.getElementById('bundlejs').getAttribute('src')
, baseURL = src.substr(0, src.lastIndexOf('/static/build/bundle.js'))

// Include bootstrap
var link = document.createElement('link')
link.setAttribute('href', baseURL+'/static/hive-ui/bootstrap/css/bootstrap.min.css')
link.setAttribute('rel', 'stylesheet')
document.head.insertBefore(link, document.head.firstChild)

module.exports = setup
module.exports.consumes = []
module.exports.provides = ['ui']
function setup(plugin, imports, register) {
  var ui = {
    /**
     * Creates the redux store and emits ui.onStart
     */
    start: function(config) {
      ui.config = config
      ui.reduxRootReducers.push(redux.combineReducers(ui.reduxReducerMap))
      var createStore = redux.applyMiddleware.apply(null, ui.reduxMiddleware)(redux.createStore)
      ui.store = createStore(reduceReducers.apply(null, ui.reduxRootReducers))
      window.store = ui.store
      ui.onStart.emit()
    }
  /**
   * Helper for redux middleware
   * @param action the redux action being dispatched
   * @param route an express-style route string
   * @returns Bool|Object Either `false` or an object with the params specified in your route
   */
  , route: function(action, route) {
      if('ROUTE' !== action.type) return false
      var keys
      var res = pathToRegexp(route, keys=[])
      .exec(action.payload)
      if(!res) return false
      return res
      .slice(1)
      .reduce(function(obj, val, i) {
        obj[keys[i].name] = val
        return obj
      }, {})
    }
  , exitRoute: function(store, action, route) {
      if('ROUTE' !== action.type) return false
      var keys
      var regex = pathToRegexp(route, keys=[])
      var matchesOld = regex.exec(store.getState().router)
      var matchesNew = regex.exec(action.payload)
      if(matchesOld && !matchesNew) return true
      return false
    }
  , scripts: {}
  , requireScript: function(url) {
      if (this.scripts[url]) return Promise.resolve()
      return new Promise((resolve) => {
        var script = document.createElement('script')
        script.src = url
        script.onload = () => {
          this.scripts[url] = script
          resolve()
        }
        document.body.appendChild(script)
      })
    }
  , onRenderBody: AtomicEmitter()
  , onRenderHeader: AtomicEmitter()
  , onRenderNavbarRight: AtomicEmitter()
  , onRenderNavbarLeft: AtomicEmitter()
  , onRenderContent: AtomicEmitter()
  , onStart: AtomicEmitter()
  , baseURL: baseURL
  , reduxMiddleware: [reduxGen(), loggerMiddleware, routerMiddleware]
  , reduxRootReducers: []
  , reduxReducerMap: {}
  , action_route: function(path, manipulateHistory) {
      return {
        type: 'ROUTE'
      , payload: path
      , manipulateHistory: 'undefined'===typeof manipulateHistory? true : manipulateHistory
      }
    }
  , action_loadState: function(state) {
      return {type: 'LOAD_STATE', payload: state}
    }
  , render: render
  , renderNavbar: renderNavbar
  , renderContent: renderContent
  }

  function loggerMiddleware(store) {
    return next => action => {
      console.log('Dispatching action', action)
      var result = next(action)
      console.log('New state:', store.getState())
      return result
    }
  }

  ui.reduxRootReducers.push(loadStateReducer)
  function loadStateReducer(state, action) {
    if('LOAD_STATE' === action.type) {
      return action.payload
    }
    return state
  }

  // Router

  ui.reduxReducerMap.router = routerReducer
  function routerReducer(state, action) {
    if('ROUTE' === action.type) {
      return action.payload
    }
    if(!state) return null
    return state
  }

  function routerMiddleware(store) {
    return next => action => {
      if(action.type === 'ROUTE' && store.getState().router && action.manipulateHistory) {
        // Only save state if this is not the first route and we're supposed to manipulate history
        saveStateToHistory(store)
        goToNewPath(store, action.payload)
      }
      if(action.type === 'LOAD_STATE') {
        var res = next(action)
        store.dispatch(ui.action_route(action.payload.router, false))
        return res
      }
      return next(action)
    }
  }
  function saveStateToHistory(store) {
    window.history.replaceState(store.getState(), '', store.getState().router)
  }
  window.addEventListener('close', saveStateToHistory.bind(null, ui.stornull, ui.store))

  function goToNewPath(store, path) { 
    window.history.pushState(null, '', path)
  }

  function onpopstate(evt) {
    if(evt.state) ui.store.dispatch(ui.action_loadState(evt.state))
    else if(ui.store) ui.store.dispatch(ui.action_route(document.location.pathname, false))
  }
  window.addEventListener('popstate', onpopstate, false)

  ui.onStart(function() {
    if(window.history.state) {
      ui.store.dispatch(ui.action_loadState(window.history.state))
    }else {
      ui.store.dispatch(ui.action_route(document.location.pathname))
    }
  })

  // Toggle main Menu

  ui.reduxReducerMap.displayMainMenu = (state, action) => {
    if('undefined' === typeof state) return false
    if('UI_TOGGLE_MAIN_MENU' === action.type) {
      return !state
    }
    return state
  }

  ui.action_toggleMainMenu = function() {
    return {type: 'UI_TOGGLE_MAIN_MENU'}
  }

  // Render loop

  ui.onStart(() => {
    if(ui.store.getState().locale) main()
    else {
      var dispose = ui.onLocalize(() => {
        dispose()
        main()
      })
    }
  })

  function main() {
    var tree
      , rootNode = document.body
    try {
      tree = render(ui.store)
    }catch(e) {
      console.log(e.stack)
      console.log(e)
    }
    rootNode.innerHTML = ''
    vdom.patch(rootNode, vdom.diff(h('body'), tree))

    // as the sate changes, the page will be re-rendered
    // at most once per animation frame...
    var dispose = ui.store.subscribe(throttlePerFrame(triggerRender))

    // ... but at least once a second
    var interv = setInterval(triggerRender, 1000)

    function triggerRender() {
      try {
      var newtree = render(ui.store)
      }catch(e) {
        console.log(e.stack)
        console.log(e)
        return
      }
      vdom.patch(rootNode, vdom.diff(tree, newtree))
      tree = newtree
    }

    function stopRendering() {
      dispose()
      clearInterval(interv)
    }
  }

  function render(store) {
    var props
    return h('body', props={}, extensible('onRenderBody', store, [
      renderNavbar(store)
    , renderContent(store)
    ], props))
  }

  function renderNavbar(store) {
    var displayMainMenu = store.getState().displayMainMenu
    return h('div.navbar.navbar-default.navbar-static-top', [
      h('div.container-fluid', [
        h('div.navbar-header',
        extensible('onRenderHeader', store, [
          h('button.navbar-toggle'+(displayMainMenu? '' : '.collapsed')
          , { attributes:
              { type:"button"
              , "aria-expanded":displayMainMenu? 'true' : 'false'
              }
            , 'ev-click': evt => store.dispatch(ui.action_toggleMainMenu())
            }
          , [
            h('span.sr-only', 'Toggle navigation'),
            h('span.icon-bar'),
            h('span.icon-bar'),
            h('span.icon-bar'),
          ]),
          h('span.navbar-brand', {title: 'Hive.js'}
          , h('img', {src: ui.baseURL+'/static/hive-ui/img/logo_grey.svg'}))
        ])),
        h('div.collapse.navbar-collapse'+(displayMainMenu? '.in' : '')
        ,[
            h('ul.nav.navbar-nav.navbar-right',
              extensible('onRenderNavbarRight', store, [])
            )
          , h('ul.nav.navbar-nav.navbar-left',
              extensible('onRenderNavbarLeft', store, [])
            )
        ])
      ])
    ])
  }

  function renderContent(store) {
    var props
    return h('div.body', props={style: {
        position: 'absolute'
      , top: '50px'
      , left: '0px'
      , bottom: '0px'
      , right: '0px'
      }},
      extensible('onRenderContent', store, [], props)
    )
  }

  function extensible(hookName, store, children, props) {
    ui[hookName].emit(store, children, props)
    return children
  }

  register(null, {ui: ui})
}
