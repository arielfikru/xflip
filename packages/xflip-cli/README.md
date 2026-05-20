# @xflip/cli

Command-line tool for the [xflip](https://github.com/arielfikru/xflip) image
format. Create, inspect, validate, and extract `.xflip` files from Node.

> Status: **work in progress.** P4.1 ships `inspect` only. `create`,
> `extract`, `validate`, and `layers` follow in subsequent P4 tasks.

## Install

```sh
npm install --global @xflip/cli
# or, per-project:
npm install --save-dev @xflip/cli
```

Requires Node 20+.

## Usage

```
xflip <command> [options]
```

Run `xflip help` or `xflip <command> --help` for details.

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

## Programmatic use

`@xflip/cli` also exports its command logic as functions for embedding:

```ts
import { readFile } from 'node:fs/promises';
import { inspect } from '@xflip/cli';

const summary = inspect(await readFile('card.xflip'));
console.log(summary.chunks);
```

## License

MIT
