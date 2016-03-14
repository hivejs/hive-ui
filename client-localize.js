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
          fetch(ui.baseURL+'/locales/'+newLocale+'.json')
          .then((res) => res.json())
          .then((json) => {
            globalize.loadMessages(json)
            globalize.locale(newLocale)
            document.documentElement.dir = ui.config.locales[newLocale].direction
            next(action)
            ui.onLocalize.emit(newLocale)
          })
          return
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

  ui.onStart(() => {
    ui.store.dispatch({type: 'SET_LOCALE', payload: 'en'})
  })

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
    var locale = settings.getForUser('ui:locale')
    if(locale && ui.store.getState().locale !== locale) {
      ui.store.dispatch(ui.action_setLcoale(locale))
    }
  })

  register()
}
