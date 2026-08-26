# Release policy

Immutable `v*` git tags and their GitHub Releases are authoritative for
`@postman-cs/automation-core`. This library sits at the bottom of the consumer
graph used by nine publishing actions, so releases are cut from tags before
consumers move to a new version.

npm publication is OIDC-only from `.github/workflows/release.yml`. The workflow
publishes the exact staged release tarball with provenance and verifies registry
integrity against that artifact. If trusted publishing is unavailable, restore
the publisher mapping and rerun the same immutable release. Never add an npm
token, repack a release artifact, or create a token-backed recovery workflow.
