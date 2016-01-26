/**
 * hive.js
 * Copyright (C) 2013-2015 Marcel Klehr <mklehr@gmx.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var newActionCreator = require('redux-actions').createAction

var Client = require('hive-client-rest-api')

module.exports = setup
module.exports.consumes = ['ui']
module.exports.provides = ['api']
function setup(plugin, imports, register) {
  var ui = imports.ui

  const middleware = store => next => action => {
    switch(action.type) {
      case 'API_AUTHENTICATE':
        return Client.authenticate(ui.baseURL, action.payload.method, action.payload.credentials, action.payload.scope)
      case 'API_USER_CREATE':
        return createClient().user.create(action.payload)
      case 'API_USER_GET':
        return createClient().user.get(action.payload)
      case 'API_USER_UPDATE':
        return createClient().user.update(action.payload.id, action.payload.body)
      case 'API_USER_DELETE':
        return createClient().user.delete(action.payload)
      case 'API_USER_GET_DOCUMENTS':
        return createClient().user.getDocuments(action.payload)
      case 'API_USER_GET_SNAPSHOTS':
        return createClient().user.create(action.payload)
      case 'API_DOCUMENT_CREATE':
        return createClient().document.create(action.payload)
      case 'API_DOCUMENT_UPDATE':
        return createClient().document.update(action.payload.id, action.payload.body)
      case 'API_DOCUMENT_GET':
        return createClient().document.get(action.payload)
      case 'API_DOCUMENT_DELETE':
        return createClient().document.delete(action.payload)
      case 'API_DOCUMENT_GET_SNAPSHOTS':
        return createClient().document.getSnapshots(action.payload)
      case 'API_DOCUMENT_GET_SNAPSHOTS_SINCE':
        return createClient().document.getSnapshotsSince(action.payload.id, action.payload.since)
      case 'API_DOCUMENT_CHANGE':
        return createClient().document.change(action.payload.id, action.payload.changes, action.payload.parent)
      case 'API_DOCUMENT_IMPORT':
        return createClient().document.import(action.payload.id, action.payload.blob)
      case 'API_SNAPSHOT_GET':
        return createClient().snapshot.get(action.payload)
      case 'API_SNAPSHOT_EXPORT':
        return createClient().snapshot.export(action.payload.id, action.payload.type)
      default:
        return next(action)
    }
    function createClient() {
      if(action.grant) return Client(ui.baseURL, action.grant.access_token)
      return Client(ui.baseURL, store.getState().session.grant.access_token)
    }
  }

  ui.reduxMiddleware.push(middleware)

  var api = {
    action_authenticate: function(method, credentials, scope) {
      return {type: 'API_AUTHENTICATE', payload: {method, credentials, scope}}
    }
  , action_user_create: newActionCreator('API_USER_CREATE')
  , action_user_get: newActionCreator('API_USER_GET')
  , action_user_update: function(id, body) {
      return {type: 'API_USER_UPDATE', payload: {id, body}}
    }
  , action_user_delete: newActionCreator('API_USER_DELETE')
  , action_user_getDocuments: newActionCreator('API_USER_GET_DOCUMENTS')
  , action_user_getSnapshots: newActionCreator('API_USER_GET_SNAPSHOTS')

  , action_document_create: newActionCreator('API_DOCUMENT_CREATE')
  , action_document_get: newActionCreator('API_DOCUMENT_GET')
  , action_document_update: function(id, body) {
      return {type: 'API_DOCUMENT_UPDATE', payload: {id, body}}
    }
  , action_document_delete: newActionCreator('API_DOCUMENT_DELETE')
  , action_document_getSnapshots: newActionCreator('API_DOCUMENT_GET_SNAPSHOTS')
  , action_document_getSnapshotsSince: function(id, since) {
      return {type: 'API_DOCUMENT_GET_SNAPSHOTS_SINCE', payload: {id, since}}
    }
  , action_document_change: function(id, changes, parent) { //
      return {type: 'API_DOCUMENT_CHANGE', payload: {id, changes, parent}}
    }
  , action_document_import: function(id, blob) { //
      return {type: 'API_DOCUMENT_IMPORT', payload: {id, blob}}
    }

  , action_snapshot_get: newActionCreator('API_SNAPSHOT_GET')
  , action_snapshot_export: function(id, type) { //
      return {type: 'API_SNAPSHOT_EXPORT', payload: {id, type}}
    }
  }

  register(null, {api})
}
