.DEFAULT_GOAL := check

PNPM = docker compose run --rm --user "$$(id -u):$$(id -g)" tooling pnpm

.PHONY: check lint typecheck fmt fmt-check test build

check:
	$(MAKE) lint
	$(MAKE) typecheck
	$(MAKE) fmt-check

lint typecheck fmt test build:
	$(PNPM) $@

fmt-check:
	$(PNPM) fmt:check
