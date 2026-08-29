# Trek source data

One JSON file per region, each an array of `Trek` objects matching the
interface in `../trekTypes.ts`. Sourced (duration, high point, season, grade)
rather than invented — see the note at the top of `trekTypes.ts` for what is
and is not filled in, and why `priceFromEur` is always null.

`../trekRecords.ts` is GENERATED from these files. Adding a trek means adding
an object here and regenerating.

## Status

13 of 22 regions done, 124 treks.

Still to author: uk-ireland, drakensberg, new-zealand, australia, japan, north-america, bhutan, central-asia, andes-north
