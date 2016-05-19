# hive-ui
This is the standard web UI for [hive.js](http://hivejs.org).

`hive-ui` is comprised of the following components:

 * `ui` -- the component that initializes the frameworks and provides the basic facilities that other components build on
   * `localize` -- subcomponent that enables localization
 * `session` -- controls authentication on the client-side and holds the real-time connection to the [stream interface on the server](https://github.com/hivejs/hive-interface-stream/)
 * `editor` -- integrates and wires editors to the real-time collaboration service
 * `settings` -- manages and exposes settings to the user and other components
 * `oauth` -- implements the oauth provider ui
 * `authToken` -- this is the default auth mechanism (login via session token)

## License
MPL 2.0
