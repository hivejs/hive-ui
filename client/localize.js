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
  , globalize = require('globalize')
  , AtomicEmitter = require('atomic-emitter')

// load cldr data
globalize.load(require('cldr-data/supplemental/likelySubtags.json'))
globalize.load(require('cldr-data/supplemental/plurals.json'))// for cardinals
globalize.load(require('cldr-data/supplemental/ordinals.json'))// for ordinals


module.exports = setup
module.exports.consumes = ['ui', 'settings']

function setup(plugin, imports, register) {
  var ui = imports.ui
    , settings = imports.settings

  // Monkeypatch ui

  ui.globalize = globalize
  ui._ = (id) => globalize.messageFormatter(id)
  ui.onLocalize = AtomicEmitter()
  ui.action_setLcoale =  function(locale) {
    return {type: 'SET_LOCALE', payload: locale}
  }
  ui.renderLocaleSetting = renderLocaleSetting

  // SET_LOCALE middleware + reducer

  ui.reduxMiddleware.push(globalizeMiddleware)
  function globalizeMiddleware(store) {
    return next => action => {
      if('SET_LOCALE' === action.type || 'LOAD_STATE' === action.type) {
        var newLocale = action.payload.locale || action.payload
        if(globalize.locale() !== newLocale) {
          if (!ui.config.locales[newLocale]) return Promise.reject()
          return fetch(ui.baseURL+'/static/build/locales/'+newLocale+'.json')
          .then((res) => {
            if (res.status != 200) throw new Error('Not ok')
            return res.json()
          })
          .then((json) => {
            globalize.loadMessages(json)
            globalize.locale(newLocale)
            document.documentElement.dir = ui.config.locales[newLocale].direction
            next(action)
            ui.onLocalize.emit(newLocale)
          })
        }
      }
      return next(action)
    }
  }

  ui.reduxReducerMap.locale = function(state, action) {
    if('undefined' === typeof state) return null
    if('SET_LOCALE' === action.type) {
      return action.payload
    }
    return state
  }

  ui.action_setLocale = function(locale) {
    return {type: 'SET_LOCALE', payload: locale}
  }

  ui.action_setLocaleWithFallbacks = function*(locales) {
    for (var i=0; i<locales.length; i++) {
      try {
        yield ui.action_setLocale(locales[i])
        return
      }catch(e) {
        // Do nothing -- next locale will be set.
      }
    }
    throw new Error('No locales found. Network down?')
  }

  ui.onStart(() => {
    var locales = [
      navigator.language || navigator.userLanguage
    , getLocaleRoot(navigator.language || navigator.userLanguage)
    , 'en' // default
    ]
    store.dispatch(ui.action_setLocaleWithFallbacks(locales))
  })

  function getLocaleRoot(locale) {
    if (!~locale.indexOf('-')) return
    return locale.split('-')[0]
  }

  // Locale setting

  settings.onRenderUserSettings((children) => {
    children.push(renderLocaleSetting(ui.store))
  })

  function renderLocaleSetting(store) {
    var currentLanguage = store.getState().locale
    return h('div', [
      h('h4', ui._('ui/locale')())
    , h('ul.list-group', [
        h('li.list-group-item', [
          h('label', [
            ui._('ui/select-language')()+': '
          , h('select'
            , { 'ev-change': onchange, value: currentLanguage }
            , Object.keys(ui.config.locales).map(locale => {
                return h('option'
                , { value: locale
                  , attributes: currentLanguage == locale? {selected: true} : {}
                  }
                , ui.config.locales[locale].nativeName
                )
              }))
          ])
        ])
      ])
    ])

    function onchange(evt) {
      store.dispatch(
        settings.action_setForUser({'ui:locale':evt.currentTarget.value})
      )
    }
  }

  // Integrate with settings

  settings.onChange(() => {
    var state = ui.store.getState()
    if (!state.session.user) return
    var locale = settings.getForUser('ui:locale')
    if(locale && state.locale !== locale) {
      ui.store.dispatch(ui.action_setLcoale(locale))
    }
  })

  register()
}
