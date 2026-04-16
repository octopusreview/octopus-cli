# Changelog

All notable changes to Octopus CLI are documented in this file.

## [0.1.13] - 2026-04-16

### Added
- Global mode (`-g`) to `repo chat` for org-wide questions

## [0.1.12] - 2026-04-15

### Added
- Pipeline mode (`-p`) to `repo chat` command (#20)
- Agent stop command (#21)
- Claude CLI answer task type for agent (#22)

### Fixed
- Agent search improvements and error logging (#24)
- ApiError `url` field propagation (#25)

### Changed
- Detect compiled binary for agent daemon spawning (#23)
- Version bump and gitignore updates (#25)

## [0.1.9] - 2026-04-01

### Added
- Windows ARM64 support and fix install scripts for tar.gz archives

### Fixed
- Remove unsupported bun-windows-arm64 target
- Resolve tmpdir unbound variable and prefer user-local install path
- Read skills prompt from `/dev/tty` for curl-pipe-bash support

## [0.1.8] - 2026-04-01

### Added
- Cross-platform install scripts for curl-based installation (#11)
- Top-level `review` command alias with `--pr` option support

### Changed
- Release binary builds with bun compile (#12)

### Fixed
- Release workflow improvements from review feedback (#13)
- Add `shell: bash` to all workflow steps for Windows compatibility

## [0.1.7] - 2026-03-26

### Added
- Agent background mode and auto-start (#10)
- Remote skills registry with hash-based versioning (#9)
- Local agent command for real-time codebase search (#4)
- Skills management command with octopus-fix skill (#2)
- Claude Code split-and-ship slash command (#6)

### Fixed
- Read version from package.json instead of hardcoded value (#6)

## [0.1.4] - 2026-03-23

### Added
- `analyze-deps` command for npm dependency security analysis (#4)

### Fixed
- Use `exec` instead of `spawn` for browser open on Windows
- Handle spawn ENOENT crash on Windows browser open
- Resolve browser open failure on Windows during login

## [0.1.0] - 2026-03-13

### Added
- Initial release of Octopus CLI
- Comprehensive CLI documentation
- Repository chat, review, and login commands
- GitHub integration with Octopus API
