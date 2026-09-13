# Counter Type Go

A monkeytype-style typing test as a desktop app, with two twists:

- **Keyboard guidance** — the key you need to press next lights up on your keyboard (RK R65 via
  the [rk-r65-leds](#keyboard-lights) bridge; any keyboard can be wired in through the same
  tiny WebSocket protocol).
- **CT Defense** — an arcade mode where counter-terrorist-style soldiers converge on you from
  every side. Each carries a word; type it to drop them before they reach you. The one outlined
  in green is next.

![modes](https://img.shields.io/badge/modes-time%20%C2%B7%20words%20%C2%B7%20ct%20defense-5ce08a) ![electron](https://img.shields.io/badge/electron-44-2f7a4b)

## Run

```bash
npm install
npm start          # Electron app
npm run web        # or just serve it to a browser at http://127.0.0.1:5173
npm run dist       # portable Windows .exe via electron-builder (npm i -D electron-builder first)
```

## Modes

| mode | options |
|---|---|
| **time** | 15 / 30 / 60 / 120 s, punctuation, numbers |
| **words** | 10 / 25 / 50 / 100 words, punctuation, numbers |
| **ct defense** | easy / normal / hard — more soldiers, faster, fewer lives |

Results show wpm, raw, accuracy, consistency, character breakdown and a wpm-over-time chart with
error markers. Personal bests are kept per mode in `localStorage`.

Keys: `tab` or `esc` restart · `ctrl+backspace` delete word · `enter` on the results screen for the
next test. In CT Defense `backspace` undoes a typo on the current word.

Scoring matches monkeytype: **wpm** = characters of correctly typed words (incl. the space) ÷ 5 ÷
minutes; **raw** = everything typed ÷ 5 ÷ minutes; **acc** = correct keypresses ÷ all keypresses.

## Keyboard lights

The app connects to `ws://127.0.0.1:7365` and sends the next character to type:

```jsonc
{"op":"char","char":"A"}     // bridge lights Shift + A
{"op":"clear"}               // test over
```

Run the `rk-r65-leds` bridge (`npm start` in that folder) and the status pill in the top-right
turns green. Without the bridge the app simply works without lights. Colour, bridge URL and
on/off live in ⚙ settings. Any other keyboard can join by implementing the same two messages.

## Notes

- The CT sprites are drawn in code (canvas), a nod to the CS look rather than game assets.
- Plain HTML/CSS/JS in `src/`, no bundler. `main.js` is the Electron shell (sandboxed renderer,
  no Node in the page).

MIT © thatdanyal
