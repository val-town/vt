# VT Companion

VT Companion is a companion browser extension for
[VT](https://github.com/val-town/vt), the [Val Town](https://val.town) CLI.

It works via a Websocket connection on localhost. When you run `vt watch` `vt`
starts hosting a Websocket on localhost. Whenever it does a `push` during the
`watch`, `vt` sends links for each HTTP val over the Websocket.

On the extension side, it runs in a service worker, and auto-wakes up when you
load a `val.run` url or click "Connect to VT" on the extension dropdown, and
connects to the Websocket. When it receives a URL through the Websocket it finds
all tabs with that URL open and reloads them. Because of how it works you don’t
need to even log in or change settings, since it talks directly to the `vt` CLI.

## Trying it out

- Install the [`vt` CLI](https://jsr.io/@valtown/vt).
- Build the `VT Companion` extension. See the Building section below.
- Run `vt create someProject`, `cd someProject`, `vt.ts watch`.
- Make a file `foo.http.tsx` and put
  `export default () => new
  Response("hi!");` in it.
- Run `vt push` and then `vt browse`.
- Go to that HTTP Val's deployment in a browser that has the `VT Companion`
  extension installed. You should see "Connected to browser" in the console as
  the page loads. If you don't, click the extension in the extension bar, and
  click "Connect to VT." Make sure you are running a version of `VT` >= `0.1.30`
  for companion support.
- Make a change locally to the files in the `someProject` folder.
- Should automatically reload the tab!

## Building

To build the extension, you will need Node and npm. Building has only been
tested on Node v20 and later.

Run `npm install`, and then `npm run build:chrome` or `npm run build:firefox`.
This will produce a `zip` of the (minified) extension files in a `dist` folder.
The build process should work on Linux or MacOS.
