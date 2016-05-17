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
var vdom = require('virtual-dom')
  , h = vdom.h
  , createActionFactory = require('redux-actions').createAction
  , AtomicEmitter = require('atomic-emitter')

import cookieEffects  from 'redux-effects-cookie'
import {cookie} from 'redux-effects-cookie'

var Stream = require('./lib/stream-client.js')

module.exports = setup
module.exports.consumes = ['ui', 'api']
module.exports.provides = ['session']
function setup(plugin, imports, register) {
  var ui = imports.ui
    , api = imports.api

  ui.reduxReducerMap.session = reducer
  ui.reduxMiddleware.push(cookieEffects())
  ui.reduxMiddleware.push(store => next => action => {
    if('SESSION_STREAM_LOAD' === action.type) {
      var state = store.getState()
      if(session.stream) session.stream.close()
      session.stream = Stream(ui.baseURL, action.payload)
      session.onLoadStream.emit()
    }
    return next(action)
  })

  ui.onRenderBody((store, children) => {
    var state = store.getState()
    if(!state.session.user) {
      children.push(render(store))
    }
  })

  ui.onRenderHeader((store, children) => {
    var state = store.getState()
    if(false === state.session.streamConnected) {
      children.push(renderDisconnected(store))
    }
  })

  ui.onStart(function() {
    var sessionUserId
    ui.store.subscribe(function() {
      var state = ui.store.getState()
      // if session.grant has changed, emit onLogin
      if(state.session.grant && state.session.grant.user != sessionUserId) {
        sessionUserId = state.session.grant.user
        session.onLogin.emit()
      }
    })

    // try to login silently first
    if(!ui.store.getState().session.user) session.silentLogin()
  })

  function reducer(state, action) {
    if(!state) {
      return {
        authMethod: null
      , grant: null
      , user: null
      , loggingIn: false
      , streamConnected: null
      }
    }
    if('SESSION_STREAM_CONNECTED' === action.type) {
      return {...state, streamConnected: true}
    }
    if('SESSION_STREAM_DISCONNECTED' === action.type) {
      return {...state, streamConnected: false}
    }
    if('SESSION_CHOOSE_AUTH_METHOD' === action.type) {
      return {...state, authMethod: action.payload}
    }
    if('SESSION_LOGGING_IN' === action.type) {
      return {...state, user: null, loggingIn: true}
    }
    if('SESSION_LOGIN' === action.type && action.error) {
      return {user: null, authMethod: null, authFailed: true, loggingIn: false}
    }
    if('SESSION_LOGIN' === action.type) {
      return {...state, ...action.payload, authFailed: false, loggingIn: false}
    }
    return state
  }

  var session = {
    providers: {}

    /**
     * register an authentication provider
     * @param method the name of the authentication method
     * @param obj an object with the following fields
     *   `silent` {Function} silently checks if credentials are available and returns them if so
     *   `ask` {Function} uses the user agent to ask for credentials
     *   `description` {String} User-friendly description of the auth method
     */
  , registerAuthenticationProvider: function(method, obj) {
      if(this.providers[method]) return
      this.providers[method] = obj
    }

    /**
     * Use the first silent-enabled auth provider to effect a silent auth try
     */
  , silentLogin: function() {
      var methods = Object.keys(this.providers)

      // Try silent authentication
      var values = methods.map(function(method) {
        return this.providers[method].silent && this.providers[method].silent()
      }.bind(this))
      values = values
        .map(function(creds, i) {
          return {method: methods[i], credentials: creds}
        })
        .filter(function(o) {
          return !!o.credentials
        })

      if(values.length >= 1) {
        // a silent authentication is possible
        ui.store.dispatch(session.action_loggingIn()) // Necessary because of rendering logic below...
        ui.store.dispatch(session.action_chooseAuthMethod(values[0].method))
        ui.store.dispatch(session.action_login(values[0].credentials))
      }else {
        // No silent auth is possible
        return
      }
    }

    /**
     * Tries to authenticate and emits a SESSION_LOGIN action, which has an `error` property in case of error
     *
     * @param credentials The credentials to be used for authentication
     */
  , action_login: function *(credentials) {
      yield session.action_loggingIn()
      try {
        var grant = yield api.action_authenticate(ui.store.getState().session.authMethod, credentials)

        var user = yield { ...(api.action_user_get(grant.user)), grant: grant}

        yield cookie('token', grant.access_token)

        yield {type: 'SESSION_LOGIN', payload: {grant, user}}

        yield session.action_loadStream(grant.access_token) // Speed up log-in: Don't wait for stream
      }catch(e) {
        console.error(e)
        return yield {type: 'SESSION_LOGIN', error: true, payload: e}
      }
    }

    /**
     * Returns a SESSION_CHOOSE_AUTH_METHOD action
     *
     * @param method The id of teh auth provider to use for authentication
     */
  , action_chooseAuthMethod: createActionFactory('SESSION_CHOOSE_AUTH_METHOD')
  , action_loggingIn: createActionFactory('SESSION_LOGGING_IN')
  , action_loadStream: createActionFactory('SESSION_STREAM_LOAD')
  , action_streamConnected: createActionFactory('SESSION_STREAM_CONNECTED')
  , action_streamDisconnected: createActionFactory('SESSION_STREAM_DISCONNECTED')
  , render
  , renderLoggingIn
  , renderChooseAuthMethod
  , renderAsk
  , renderDisconnected
  , onLogin: AtomicEmitter()
  , onLoadStream: AtomicEmitter()
  , onStreamConnect: AtomicEmitter()
  , onceLoggedIn: function(cb) {
      if(ui.store.getState().session.user) return setImmediate(cb)
      var dispose = session.onLogin(function() {
        dispose()
        cb()
      })
    }
  , onceStreamConnected: function(cb) {
      if(ui.store.getState().session.streamConnected) return setImmediate(cb)
      var dispose = session.onStreamConnect(() => {
        dispose()
        cb()
      })
    }
  }

  session.onLoadStream(() => {
    session.stream.on('disconnect', () => {
      ui.store.dispatch(session.action_streamDisconnected())
    })
    session.stream.on('connect', () => {
      ui.store.dispatch(session.action_streamConnected())
      session.onStreamConnect.emit()
    })
  })

  function render(store) {
    var state = store.getState()

    if(state.session.loggingIn) {
      return renderLoggingIn()
    }

    if(!state.session.authMethod) {
      return renderChooseAuthMethod(store)
    }else {
      return renderAsk(store)
    }
  }

  function renderLoggingIn() {
    return h('div.panel.panel-default', {style: {
      width:'20%',
      'min-width': '7.5cm',
      margin: '3cm auto'
    }}, [
      h('div.panel-body', [
        h('p', ui._('session/logging-in')())
      ])
    ])
  }

  function renderChooseAuthMethod(store) {
    var state = store.getState()
    var authfail = !!state.session.authFailed
    return h('div.panel.panel-default', {style: {
      width:'20%',
      'min-width': '7.5cm',
      margin: '3cm auto'
    }}, [
      h('div.panel-heading', [
        h('h3',ui._('session/authenticate')())
      ]),
      h('div.panel-body', [
        authfail
        ? h('p.alert.alert-warning', {attributes: { role:"alert"}}
          , 'Authentication failed!')
        : h('p', {style: {display: 'none'}}),
        h('p',ui._('session/authenticate-explanation')())
      ]),
      h('ul.list-group', Object.keys(session.providers)
        .filter(provider => !!session.providers[provider].ask)
        .map(function(provider) {
          return h('li.list-group-item', [
            h('a', {
              href: 'javascript:void(0)'
            , 'ev-click': evt => store.dispatch(session.action_chooseAuthMethod(provider))
            }, provider)
          , ' '+session.providers[provider].description])
        })
      )
    ])
  }

  function renderAsk(store) {
    var state = store.getState()
    var children = []
    session.providers[state.session.authMethod].ask(children)
    return h('div.panel.panel-default', {style: {
      width:'20%',
      'min-width': '7.5cm',
      margin: '3cm auto'
    }}, children)
  }

  function renderDisconnected(store) {
    return h('span.Session__offlineTag', {
      attributes: {'aria-describedby': 'popover-sessionoffline'}
    , href: "javascript:void(0)"
    , 'ev-click':(e)=> {
        var popover = e.currentTarget.querySelector('.popover')
        if (popover.classList.contains('in')) popover.classList.remove('in')
        else popover.classList.add('in')
      }
    },[
      h('i.glyphicon.glyphicon-plane')
    , h('div.popover.fade.bottom.in',{role:"tooltip", id: 'popover-sessionoffline'}, [
        h('div.arrow')
      , h('h3.popover-title', ui._('session/offline')())
      , h('div.popover-content', [
          h('p', [
            h('big', ui._('session/offline-subheading')())
          , h('br')
          , h('span.text-muted', ui._('session/offline-reasons')())
          ])
        , h('p.text-primary', ui._('session/offline-explanation')())
        ])
      ])
    ])
  }

  register(null, {session: session})
}
