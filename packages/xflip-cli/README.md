# @xflip/cli

Command-line tool for the [xflip](https://github.com/arielfikru/xflip) image
format. Create, inspect, validate, and extract `.xflip` files from Node.

> Four subcommands shipped: `inspect`, `validate`, `extract`, `create`.

## Install

```sh
npm install --global @xflip/cli
# or, per-project:
npm install --save-dev @xflip/cli
```

Requires Node 20+. Zero runtime dependencies beyond `@xflip/core`.

## Usage

```
xflip <command> [options]
```

Run `xflip help` or `xflip <command> --help` for details.

### Exit codes

| Code | Meaning |
| ---- | ------- |
| `0`  | Success |
| `1`  | Runtime error (invalid input file, I/O failure, refused overwrite) |
| `2`  | Usage error (missing/unknown flag, bad value, unknown subcommand) |

### `xflip inspect <file>`

Print the version, byte length, and per-chunk summary (type, source
offset, payload length, critical flag) of an `.xflip` file. Validates the
signature and every CRC; exits non-zero on malformed input.

```sh
xflip inspect card.xflip
```

```
xflip file: card.xflip
  size:    78 bytes
  version: 1.0
  chunks:  3

  TYPE  OFFSET     LENGTH  CRITICAL
  HEAD         6        12  yes
  FRNT        34         5  yes
  BACK        51         5  yes
```

Options:

- `--strict-ancillary-crc` — treat ancillary CRC mismatches as fatal.
- `-h`, `--help` — show command help.

### `xflip validate <file>`

Run the full decoder on an `.xflip` file. Checks signature, every CRC,
chunk order, mandatory chunks, HEAD payload shape, and known ancillary
parse contracts. Prints a one-line `OK` report on success, or a
multi-line `FAIL` report (with error class + message) on failure.

```sh
xflip validate card.xflip
# OK  card.xflip  (xflip 1.0, 78 bytes)

xflip validate broken.xflip
# FAIL  broken.xflip  (8 bytes)
#   XflipParseError: invalid magic bytes
```

Options:

- `--strict-ancillary-crc` — treat ancillary CRC mismatches as fatal.
- `-h`, `--help` — show command help.

### `xflip extract <file> --to <dir>`

Decode an `.xflip` file and write `front.<ext>`, `back.<ext>`, and (if
present) `meta.json` into `<dir>`. Extensions follow the HEAD image-
format code (`raw` / `custom` → `.bin`). The target directory is created
if missing. Refuses to overwrite existing files unless `--force` is
passed.

```sh
xflip extract card.xflip --to ./out
```

Options:

- `--to <dir>` — target directory (required).
- `--force` — overwrite existing output files.
- `--strict-ancillary-crc` — treat ancillary CRC mismatches as fatal.

### `xflip create --front <a> --back <b> --output <o> --width <W> --height <H>`

Assemble an `.xflip` v1.0 file from two image inputs. Image formats are
inferred from each input's filename extension; use `--front-format` /
`--back-format` to override.

```sh
xflip create \
  --front front.png --back back.jpg \
  --width 512 --height 720 \
  --flip-axis horizontal \
  --meta meta.json \
  --output card.xflip
```

Options:

- `--front <path>`, `--back <path>` — source image bytes (required).
- `--output <path>`, `--width <N>`, `--height <N>` — required.
- `--front-format <fmt>`, `--back-format <fmt>` — override inference.
- `--flip-axis <horizontal|vertical|diagonal>` — default `horizontal`.
- `--default-back`, `--no-flip-anim` — HEAD flag bits.
- `--meta <path>` — embed META chunk; validates UTF-8 JSON first.
- `--force` — overwrite an existing `--output`.

Supported formats: `png`, `jpeg` (`.jpg`/`.jpeg`), `webp`, `avif`, `jxl`,
`raw` (`.bin`/`.raw`).

## Programmatic use

Each subcommand's pure logic is exported for embedding:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { buildFile, extract, inspect, validate } from '@xflip/cli';

const bytes = await readFile('card.xflip');

inspect(bytes);
validate(bytes);
const plan = extract(bytes);
await writeFile(`out/${plan.front.filename}`, plan.front.bytes);

const fresh = buildFile({
  front: await readFile('front.png'),
  back: await readFile('back.jpg'),
  frontFormat: 'png',
  backFormat: 'jpeg',
  width: 512,
  height: 720,
});
await writeFile('card.xflip', fresh);
```

## License

MIT
