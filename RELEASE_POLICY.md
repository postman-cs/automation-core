# Release policy

Immutable `v*` git tags and their GitHub Releases are authoritative for
`@postman/automation-core`. This library sits at the bottom of the consumer
graph used by nine publishing actions, so releases are cut from tags before
consumers move to a new version.

npm publication is best-effort. A release always creates its GitHub Release;
failed or skipped npm publication is restored from the exact release tarball by
`backfill-npm.yml`. The first publish of this npm name requires an npm token;
trusted publishing can only be configured after that initial token-backed
publish.
