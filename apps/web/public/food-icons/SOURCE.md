<!-- Owns: provenance and licence of the food icons in this folder (served at /food-icons/). -->

# Food icons source

| What                                                      | Where                                                                                                                                                                                                              | Licence                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `<name>.svg` (113 icons, 32 × 32 viewBox, ~480 KB in all) | [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji), **Flat** style, taken from Iconify's `fluent-emoji-flat` set (`https://api.iconify.design/fluent-emoji-flat.json`, lastModified 2026-08-27) | MIT, © Microsoft Corporation (text below) |
| `index.json`                                              | Ours: keyword map from food names to icons. Each entry's `fluent` field is the original Fluent Emoji name (e.g. `apple` ← `red-apple`, `protein-powder` ← `flexed-biceps`).                                        | Ours                                      |

Each SVG is the Iconify icon body wrapped in a 32 × 32 `<svg>`, unchanged, with a one-line provenance comment. `soda` and `protein-shake` share the same artwork (`cup-with-straw`).

**Lookup** (`index.json`): lower-case the food name; among entries whose keyword appears in it as a whole word or phrase, the longest keyword wins (ties: the earlier entry); with no match use `fallback` (`meal`, a plate with fork and knife). So "peanut butter" → `nuts`, "sweet potato" → `sweet-potato`, "chicken breast" → `chicken`, "protein bar" → `chocolate`.

To add an icon: pick a Fluent Emoji Flat name at <https://icon-sets.iconify.design/fluent-emoji-flat/>, save `https://api.iconify.design/fluent-emoji-flat/<icon>.svg` as `<name>.svg` here with the same comment line, and add an entry to `index.json` (keywords must not repeat across entries).

## Licence

```
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE
```
