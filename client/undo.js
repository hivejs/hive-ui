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
  , newActionCreator = require('redux-actions').createAction
  , AtomicEmitter = require('atomic-emitter')

module.exports = setup
module.exports.consumes = ['ui', 'editor', 'api']
module.exports.provides = ['localUndo']
function setup(plugin, imports, register) {
  var ui = imports.ui
    , editor = imports.editor
    , api = imports.api

  // Inject into page

  ui.onRenderNavbarRight((store, children) => {
    var state = store.getState()
    var editorActive = state.editor.active && !state.editor.loading
    if(!editorActive || !state.localUndo.enabled) return
    children.unshift(renderRedoButton(store))
    children.unshift(renderUndoButton(store))
  })
  
  function renderUndoButton(store) {
    return h('li', h('a', {
      href: 'javascript:void(0)'
    , 'ev-click': evt => store.dispatch(localUndo.action_triggerUndo())
    , title: ui._('editor/undo')()
    }, [
      h('i.glyphicon.glyphicon-arrow-left')
    , h('span.sr-only', ui._('editor/undo')())
    ]))
  }
  
  function renderRedoButton(store) {
    return h('li', h('a', {
      href: 'javascript:void(0)'
    , 'ev-click': evt => store.dispatch(localUndo.action_triggerRedo())
    , title: ui._('editor/redo')()
    }, [
      h('i.glyphicon.glyphicon-arrow-right')
    , h('span.sr-only', ui._('editor/redo')())
    ]))
  }

  var localUndo = {
    action_reset: newActionCreator('LOCALUNDO_RESET')
  , action_disable: newActionCreator('LOCALUNDO_DISABLE')
  , action_setBusy: newActionCreator('LOCALUNDO_SETBUSY')
  , action_setCommitting: newActionCreator('LOCALUNDO_SETCOMMITTING')
  , action_setTip: newActionCreator('LOCALUNDO_SETTIP')
  , action_setCurrent: newActionCreator('LOCALUNDO_SETCURRENT')
 
  , action_undoSnapshot: newActionCreator('LOCALUNDO_UNDO_SNAPSHOT')
  , action_markDead: newActionCreator('LOCALUNDO_MARK_DEAD')

  , action_triggerUndo: function*() {
      if (ui.store.getState().localUndo.busy) return
      if (!editor.editableDocument.ottype.invert) throw new Error('OTType doesn\'t support undo')
      
      yield localUndo.action_setBusy(true)
      
      try {
        var plan = yield localUndo.action_findSnapshotToUndo()
        var snapshot = yield localUndo.action_undoSnapshot(plan.toUndo)
        yield localUndo.action_setCurrent(plan.newCurrent? plan.newCurrent.id : null)
        yield localUndo.action_rememberUndo({original: plan.original, undo: snapshot})
      }catch(e) {
        yield localUndo.action_setBusy(false)
        throw e
      }
      yield localUndo.action_setBusy(false)
    }
  , action_findSnapshotToUndo: newActionCreator('LOCALUNDO_FIND_NEXT_TO_UNDO')
  , action_rememberUndo: newActionCreator('LOCALUNDO_REMEMBER_UNDO')
  
  , action_triggerRedo: function*() { 
      if (ui.store.getState().localUndo.busy) return

      yield localUndo.action_setBusy(true)
      
      try {
        var plan = yield localUndo.action_getSnapshotToRedo()
        var snapshot = yield localUndo.action_undoSnapshot(plan.toUndo)
        yield localUndo.action_setCurrent(plan.newCurrent.id)
        yield localUndo.action_rememberRedo({original: plan.original, redo: snapshot})
      }catch(e) {
        yield localUndo.action_setBusy(false)
        throw e
      }
      yield localUndo.action_setBusy(false)
    }
  , action_getSnapshotToRedo: newActionCreator('LOCALUNDO_FIND_NEXT_TO_REDO')
  , action_rememberRedo: newActionCreator('LOCALUNDO_REMEMBER_REDO')
  
  , action_getSnapshotsByUser: function(docId, userId) {
      return {type: 'LOCALUNDO_GET_SNAPSHOTS_BY_USER', payload: {document: docId, user: userId}}
    }
  , action_getSnapshotsAfterTime: function(docId, timestamp) {
      return {type: 'LOCALUNDO_GET_SNAPSHOTS_AFTER', payload: {document: docId, timestamp}}
    }
  }

  ui.reduxMiddleware.push(function(store) {
    return next => action => {
      if ('LOCALUNDO_SETTIP' === action.type) {
        // Making a change by hand while in detached HEAD state kills all previously undone revisions
        var state = store.getState()
          , current = state.localUndo.current

        return Promise.resolve()
        .then(() => ui.store.dispatch(localUndo.action_getSnapshotsByUser(state.editor.document.id, state.session.user.id)))
        .then((snapshots) => {
          // Get all snapshots after current and mark them as dead.
          var indexOfCurrent = snapshots.map((s) => s.id).indexOf(current)
          for (var i=indexOfCurrent+1; i < snapshots.length-1-1; i++) {
            store.dispatch(localUndo.action_markDead(snapshots[i].id))
          }

          return next(action)
        })
      }
      if ('LOCALUNDO_FIND_NEXT_TO_UNDO' === action.type) {
        // last REDO of `current` (or original `current`) is being undone.
        var state = store.getState()
          , tip = state.localUndo.tip
          , current = state.localUndo.current
          , original
          , toUndo
          , newCurrent

        if (!current) {
          return Promise.reject(new Error('No undo possible. This user has not made any changes or they were all undone.'))
        }
        
        return Promise.resolve()
        .then(() => store.dispatch(api.action_snapshot_get(current)))
        .then(snapshot => {
          original = snapshot
          toUndo = state.localUndo.originalToRedo[original.id] || original
        })
        .then(() => ui.store.dispatch(localUndo.action_getSnapshotsByUser(state.editor.document.id, state.session.user.id)))
        .then((snapshots) => {
          // Get the non-undo/redo snapshot authored by this user immediately before current.
          var indexOfCurrent = snapshots.map((s) => s.id).indexOf(original.id)
          for (var i=indexOfCurrent-1; i >= 0; i--) {
            // If it's an undo or redo snapshot -> skip
            if (state.localUndo.redoToOriginal[snapshots[i].id] || state.localUndo.undoToOriginal[snapshots[i].id]) continue
            // If it's an original, but has been undone -> skip
            // (read: if the last undo for this edit happened after the last redo)
            if (state.localUndo.originalToUndo[snapshots[i].id] && !state.localUndo.originalToRedo[snapshots[i].id]) continue
            if (state.localUndo.originalToRedo[snapshots[i].id]
              && +new Date(state.localUndo.originalToUndo[snapshots[i].id].createdAt) > +new Date(state.localUndo.originalToRedo[snapshots[i].id].createdAt)) continue
            newCurrent = snapshots[i]
            break
          }
        
          return Promise.resolve({
            original
          , toUndo
          , newCurrent
          })
        })
      }
      if ('LOCALUNDO_FIND_NEXT_TO_REDO' === action.type) {
        // last UNDO (or nothing) is being undone.
        var state = store.getState()
          , tip = state.localUndo.tip
          , current = state.localUndo.current
          , original
          , toUndo
          , newCurrent

        if (!current) {
          return Promise.reject(new Error('No redo possible. Nothing left to redo.'))
        }
        
        return Promise.resolve()
        .then(() => ui.store.dispatch(localUndo.action_getSnapshotsByUser(state.editor.document.id, state.session.user.id)))
        .then((snapshots) => {
          // Get the new original snapshot
          var indexOfCurrent = snapshots.map((s) => s.id).indexOf(current)
          for (var i=indexOfCurrent+1,snapshotId; i < snapshots.length; i++) {
            var snapshotId = snapshots[i].id
            console.log('Checking', snapshotId, snapshots[i])
            // If it's an undo or redo snapshot -> skip
            if (state.localUndo.redoToOriginal[snapshotId] || state.localUndo.undoToOriginal[snapshotId]) continue
            console.log('not an undo/redo revision')
            // If it's an original, but has not been undone -> skip
            if (!state.localUndo.originalToUndo[snapshotId]) continue
            console.log('not an original that has been undone')
            // If it has been undone and later redone -> skip
            if (state.localUndo.originalToRedo[snapshotId]
              && +new Date(state.localUndo.originalToUndo[snapshotId].createdAt) < +new Date(state.localUndo.originalToRedo[snapshotId].createdAt)) continue
            console.log('not a redone revision')
            if (state.localUndo.dead[snapshotId]) continue;
            console.log('not dead -- this is our guy!')
            newCurrent = original = snapshots[i]
            break
          }

          if (!newCurrent) {
            return Promise.reject(new Error('No redo possible. Nothing left to redo.'))
          }

          toUndo = state.localUndo.originalToUndo[newCurrent.id]

          return Promise.resolve({
            original
          , toUndo
          , newCurrent
          })
        })
      }
      if ('LOCALUNDO_UNDO_SNAPSHOT' === action.type) {
        var state = store.getState()
          , docId = state.editor.document.id
          , toUndo = action.payload
        
        if (!state.session.streamConnected) {
          // We're offline :(
          return Promise.reject(new Error('Cannot undo when offline'))
        }
        
        return Promise.resolve()
        .then(() => store.dispatch(localUndo.action_getSnapshotsAfterTime(docId, toUndo.attributes.createdAt)))
        .then(rebasingSnapshots => {
          var ot = editor.editableDocument.ottype
          
          var undoOp = JSON.parse(toUndo.attributes.changes)
          undoOp = ot.invert(undoOp)
          
          // rebase undo op
          rebasingSnapshots.forEach(snapshot => {
            var op = JSON.parse(snapshot.attributes.changes)
            undoOp = ot.transform(undoOp, op, 'right')
          })

          return new Promise((resolve) => { 
            store.dispatch(localUndo.action_setCommitting(true)) // Make sure undo stack is not reset
            
            editor.editableDocument.once('commit', (edit) => {
              store.dispatch(localUndo.action_setCommitting(false))
              
              var snapshot = {
                type: 'snapshot'
              , id: edit.id
              , attributes: {
                  changes: JSON.stringify(edit.changeset)
                , contents: null // We neither know nor care about the contents
                , createdAt: new Date().toJSON() // This approximation is hacky but fine.
                }
              }
              resolve(snapshot)
            })

            // send to server!
            editor.editableDocument.update(undoOp)
            // apply locally
            editor.editableDocument._change(undoOp, ()=>{})
          })
        })
      }
      if ('LOCALUNDO_GET_SNAPSHOTS_AFTER' === action.type) {
        var state = store.getState()
          , docId = action.payload.document
          , timestamp = action.payload.timestamp
        return fetch(ui.baseURL+'/api/v1/snapshots?filter[document]='+docId+'&filter[createdAt][>]='+timestamp, {
          headers: {
            Authorization: 'token '+state.session.grant.access_token
          , 'Content-type': 'application/vnd.api+json'
          }
        })
        .then(response => {
          if (response.status === 404) return Promise.resolve({data: []})
          return checkStatus(response).json()
        })
        .then((json) => json.data) 
      }
      if ('LOCALUNDO_GET_SNAPSHOTS_BY_USER' === action.type) {
        var state = store.getState()
          , docId = action.payload.document
          , userId = action.payload.user
        // XXX: Better expose LIMIT and SORT through REST interface
        return fetch(ui.baseURL+'/api/v1/snapshots?filter[document]='+docId+'&filter[author]='+userId, {
          headers: {
            Authorization: 'token '+state.session.grant.access_token
          , 'Content-type': 'application/vnd.api+json'
          }
        })
        .then(checkStatus)
        .then((response) => response.json())
        .then((json) => json.data)
      }
      return next(action)
    }
  })
 
  ui.reduxReducerMap.localUndo = function(state, action) {
    if (!state || action.type === 'LOCALUNDO_RESET') {
      return {
        // These are for taking the right actions to undo/redo a snapshot that has already been undone/redone
        originalToUndo: {} // original id -> undo snapshot
      , undoToOriginal: {} // undo id -> undone original snapshot
      , originalToRedo: {} // original id -> redo snapshot
      , redoToOriginal: {} // redo id -> redone original snapshot
      , dead: {} // dead revision id -> true

      , enabled: true
      , busy: false
      , committing: false
      , current: null // id of the real (non-undo/non-redo) edit by the current user equivalent to the current doc content
                      // (e.g. in "detached HEAD state", this is not the last real edit)
      , tip: null // id of the last real (non-undo/non-redo) edit by the current user
      }
    }
    if (action.type === 'LOCALUNDO_DISABLE') {
      return {
        ...state
      , enabled: false
      }
    }
    if (action.type === 'LOCALUNDO_SETBUSY') {
      return {
        ...state
      , busy: action.payload
      }
    }
    if (action.type === 'LOCALUNDO_SETCOMMITTING') {
      return {
        ...state
      , committing: action.payload
      }
    }
    if (action.type === 'LOCALUNDO_SETCURRENT') {
      return {
        ...state
      , current: action.payload
      }
    }
    if (action.type === 'LOCALUNDO_SETTIP') {
      return {
        ...state
      , tip: action.payload 
      }
    }
    if (action.type === 'LOCALUNDO_MARK_DEAD') {
      return {
        ...state
      , dead: {
        ...state.dead
        , [action.payload]: true
        }
      }
    }
    if (action.type === 'LOCALUNDO_REMEMBER_UNDO') {
      return {
        ...state
      , undoToOriginal: {
          ...state.undoToOriginal
        , [action.payload.undo.id]: action.payload.original
        }
      , originalToUndo: {
          ...state.originalToUndo
        , [action.payload.original.id]: action.payload.undo
        }
      }
    }
    if (action.type === 'LOCALUNDO_REMEMBER_REDO') {
      return {
        ...state
      , redoToOriginal: {
          ...state.redoToOriginal
        , [action.payload.redo.id]: action.payload.original
        }
      , originalToRedo: {
          ...state.originalToRedo
        , [action.payload.original.id]: action.payload.redo
        }
      }
    }
    return state
  }

  editor.onLoad((editableDoc, broadcast, onClose) => {
    ui.store.dispatch(localUndo.action_reset())
    if (!editableDoc.ottype.invert) return ui.store.dispatch(localUndo.action_disable())
    
    editableDoc.on('editableInitialized', () => {
      var state = ui.store.getState()
      ui.store.dispatch(localUndo.action_getSnapshotsByUser(state.editor.document.id, state.session.user.id))
      .then((snapshots) => {
        if (!snapshots.length) return
        ui.store.dispatch(localUndo.action_setCurrent(snapshots[snapshots.length-1].id))
        ui.store.dispatch(localUndo.action_setTip(snapshots[snapshots.length-1].id))
      })
    })
    
    var hookUpdate, hookCommit
    editableDoc.on('update', hookUpdate = (edit) => {
      var state = ui.store.getState()
      if (state.session.streamConnected) return
      resetUndo(edit)
    })
    editableDoc.on('commit', hookCommit = (edit) => {
      resetUndo(edit)
    })
    onClose(() => { 
      editableDoc.removeListener('commit', hookCommit)
      editableDoc.removeListener('update', hookUpdate)
    })
  })
  const resetUndo = (edit) => {
    if (ui.store.getState().localUndo.committing) return
    ui.store.dispatch(localUndo.action_setTip(edit.id))
    ui.store.dispatch(localUndo.action_setCurrent(edit.id))
  }

  return register(null, {localUndo})
}

function checkStatus(response) {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    var error = new Error(response.statusText)
    error.response = response
    throw error
  }
}
