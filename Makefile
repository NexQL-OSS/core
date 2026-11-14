.PHONY: dev-pro dev-free all clean install build package package-pro package-nightly publish publish-nightly publish-ovsx publish-vsx git-tag test test-unit test-integration test-renderer test-all coverage docker-up docker-down vendor-nexql-mcp

# Variables
NODE_BIN := node
NPM_BIN := npm
VSCE_CMD := npx -y @vscode/vsce@2.24.0
OVSX_CMD := npx -y ovsx
OPENVSX_NIGHTLY_NAME ?= postgres-explorer-nightly

# Get version and name from package.json using node
EXTENSION_NAME := $(shell $(NODE_BIN) -p "require('./package.json').name")
EXTENSION_VERSION := $(shell $(NODE_BIN) -p "require('./package.json').version")
VSIX_FILE := $(EXTENSION_NAME)-$(EXTENSION_VERSION).vsix

# Default target
all: clean install build package

# Clean build artifacts
clean:
	rm -rf out dist *.vsix node_modules

# Install dependencies
install:
	$(NPM_BIN) install

# Build the extension
build:
	$(NPM_BIN) run vscode:prepublish

# Package the extension
package: build
	@echo "Replacing README.md with MARKETPLACE.md for packaging..."
	@if [ -f README.md ]; then cp README.md README.md.bak; fi
	@cp MARKETPLACE.md README.md
	@if [ -d node_modules/vscode ]; then mv node_modules/vscode /tmp/vscode-pkg-temp; fi
	@trap 'if [ -f README.md.bak ]; then mv README.md.bak README.md; fi; if [ -d /tmp/vscode-pkg-temp ]; then mv /tmp/vscode-pkg-temp node_modules/vscode; fi' EXIT INT TERM; \
	$(VSCE_CMD) package; \
	EXIT_CODE=$$?; \
	if [ -f README.md.bak ]; then mv README.md.bak README.md; fi; \
	if [ -d /tmp/vscode-pkg-temp ]; then mv /tmp/vscode-pkg-temp node_modules/vscode; fi; \
	echo "Restored original README.md and vscode mock"; \
	exit $$EXIT_CODE

# Pro dev mode: merge pro manifest + templates into the working tree and build
# the pro bundle so F5 runs the full extension. Idempotent (restores from the
# dev backup before re-merging). Run `make dev-free` before committing.
dev-pro:
	@node ./scripts/ensure-pro-package.js
	@if [ ! -d packages/pro ]; then echo "packages/pro missing — clone NexQL-Pro first"; exit 1; fi
	@if [ -f package.json.dev-bak ]; then cp package.json.dev-bak package.json; else cp package.json package.json.dev-bak; fi
	$(NODE_BIN) ./scripts/merge-pro-manifest.js
	cp -r packages/pro/templates/. templates/
	$(NPM_BIN) run typecheck:pro
	$(NPM_BIN) run esbuild:pro
	@echo "Pro dev mode ON — package.json has merged pro manifest; press F5. Run 'make dev-free' before committing."

# Restore free/OSS dev state (undo dev-pro)
dev-free:
	@if [ -f package.json.dev-bak ]; then mv package.json.dev-bak package.json; fi
	@if [ -d packages/pro/templates ]; then \
		(cd packages/pro/templates && find . -type f) | while read -r f; do rm -f "templates/$$f"; done; \
		find templates -type d -empty -delete 2>/dev/null || true; \
	fi
	$(NPM_BIN) run esbuild:free
	@echo "Free dev mode restored."

# Package the free version
package-free:
	@echo "Building and packaging free VSIX..."
	$(NPM_BIN) run vscode:prepublish
	@if [ -f README.md ]; then cp README.md README.md.bak; fi
	@MCP_BIN_STASH=""; \
	if [ -d bin/nexql-mcp ]; then \
	  MCP_BIN_STASH=$$(mktemp -d); \
	  mv bin/nexql-mcp "$$MCP_BIN_STASH/nexql-mcp"; \
	fi; \
	cp MARKETPLACE.md README.md; \
	trap 'if [ -f README.md.bak ]; then mv README.md.bak README.md; fi; if [ -n "$$MCP_BIN_STASH" ] && [ -d "$$MCP_BIN_STASH/nexql-mcp" ]; then mv "$$MCP_BIN_STASH/nexql-mcp" bin/nexql-mcp; rm -rf "$$MCP_BIN_STASH"; fi' EXIT INT TERM; \
	$(VSCE_CMD) package --out postgres-explorer-free.vsix; \
	EXIT_CODE=$$?; \
	if [ -f README.md.bak ]; then mv README.md.bak README.md; fi; \
	if [ -n "$$MCP_BIN_STASH" ] && [ -d "$$MCP_BIN_STASH/nexql-mcp" ]; then mv "$$MCP_BIN_STASH/nexql-mcp" bin/nexql-mcp; rm -rf "$$MCP_BIN_STASH"; fi; \
	echo "Restored original README.md"; \
	exit $$EXIT_CODE

# Vendor nexql-mcp binary into bin/nexql-mcp/<platform-arch>/ for pro packaging.
# Requires a built binary under ../mcp/target/release (or pass SRC=…).
vendor-nexql-mcp:
	@chmod +x ../mcp/scripts/vendor-nexql-mcp.sh
	@../mcp/scripts/vendor-nexql-mcp.sh $(SRC)

# Package the pro version
package-pro:
	@echo "Merging pro manifest, building, and packaging pro VSIX..."
	@# nexql-mcp is not vendored into the pro VSIX: pro launches it via npx or
	@# the user's own install, and Settings > MCP guides installation. Anything
	@# left in bin/nexql-mcp/ (e.g. from `make vendor-nexql-mcp`) still ships.
	@# Set VSCE_TARGET (e.g. linux-x64) to build a platform-specific VSIX.
	@cp package.json package.json.bak
	@trap 'if [ -f package.json.bak ]; then mv package.json.bak package.json; fi; (cd packages/pro/templates && find . -type f) | while read -r f; do rm -f "templates/$$f"; done; find templates -type d -empty -delete 2>/dev/null || true' EXIT INT TERM; \
	$(NPM_BIN) run typecheck:pro; \
	$(NODE_BIN) ./scripts/merge-pro-manifest.js; \
	cp -r packages/pro/templates/. templates/; \
	if [ -f README.md ]; then cp README.md README.md.bak; fi; \
	cp MARKETPLACE.md README.md; \
	$(VSCE_CMD) package $(if $(VSCE_TARGET),--target $(VSCE_TARGET),) --out postgres-explorer-pro.vsix; \
	EXIT_CODE=$$?; \
	if [ -f README.md.bak ]; then mv README.md.bak README.md; fi; \
	if [ -f package.json.bak ]; then mv package.json.bak package.json; fi; \
	(cd packages/pro/templates && find . -type f) | while read -r f; do rm -f "templates/$$f"; done; \
	find templates -type d -empty -delete 2>/dev/null || true; \
	echo "Restored original README.md, package.json, and templates"; \
	exit $$EXIT_CODE

# Package nightly VSIX artifacts for Marketplace (pre-release) and Open VSX companion
package-nightly: build
	@echo "Computing nightly version..."
	@NIGHTLY_VERSION=$$($(NODE_BIN) ./scripts/compute-nightly-version.js); \
	echo "Using nightly version: $$NIGHTLY_VERSION"; \
	NIGHTLY_VERSION=$$NIGHTLY_VERSION OPENVSX_NIGHTLY_NAME=$(OPENVSX_NIGHTLY_NAME) $(NODE_BIN) ./scripts/prepare-nightly-manifests.js
	@if [ -d node_modules/vscode ]; then mv node_modules/vscode /tmp/vscode-pkg-temp; fi
	@trap 'if [ -d /tmp/vscode-pkg-temp ]; then mv /tmp/vscode-pkg-temp node_modules/vscode; fi' EXIT INT TERM; \
	echo "Packaging VS Code Marketplace nightly (pre-release)..."; \
	cp package.json package.json.bak; \
	cp .nightly/package.marketplace.json package.json; \
	$(VSCE_CMD) package --pre-release; \
	mv package.json.bak package.json; \
	echo "Packaging Open VSX nightly companion..."; \
	cp package.json package.json.bak; \
	cp .nightly/package.openvsx.json package.json; \
	$(VSCE_CMD) package; \
	mv package.json.bak package.json; \
	if [ -d /tmp/vscode-pkg-temp ]; then mv /tmp/vscode-pkg-temp node_modules/vscode; fi
	@echo "Nightly packages created:"
	@ls -1 *.vsix

# Registry publishing moved to the private pro repo (NexQL-OSS/pro): its
# workflows publish the Pro build as ric-v.postgres-explorer. Publishing the
# free VSIX from here would replace Pro on the Marketplace and Open VSX, so
# these targets refuse. `make package` / `make package-pro` still build VSIXs.
PUBLISH_MOVED_MSG = Registry publishing moved to NexQL-OSS/pro (Publish Extension (Pro) / Publish Nightly Extension (Pro)). Publishing the free build from core would replace the Pro listing. See RELEASING.md.

publish publish-nightly publish-vsx publish-ovsx:
	@echo "Error: $(PUBLISH_MOVED_MSG)" >&2
	@exit 1

# Watch mode for development
watch:
	$(NPM_BIN) run watch

# Testing targets
test:
	$(NPM_BIN) run test

test-unit:
	$(NPM_BIN) run test:unit

test-integration:
	$(NPM_BIN) run test:integration

test-renderer:
	$(NPM_BIN) run test:renderer

test-all:
	$(NPM_BIN) run test:all

coverage:
	$(NPM_BIN) run coverage

coverage-report:
	$(NPM_BIN) run coverage:report
	@echo "Coverage report generated in ./coverage/index.html"

# Docker testing targets
docker-up:
	docker-compose -f docker-compose.test.yml up -d
	@echo "PostgreSQL test containers started"
	@echo "Versions available on ports: 12(5412), 13(5413), 14(5414), 15(5415), 16(5416), 17(5417), Timescale(5418)"

docker-down:
	docker-compose -f docker-compose.test.yml down

docker-logs:
	docker-compose -f docker-compose.test.yml logs -f

docker-clean:
	docker-compose -f docker-compose.test.yml down -v
	@echo "Test containers and volumes removed"

# update npm dependencies
npm-update:
	$(NPM_BIN) update
	@echo "npm dependencies updated"

# Full test suite
test-full: docker-up test-all coverage docker-down
	@echo "Full test suite completed"

# Git tag and version bump (interactive or non-interactive)
git-tag:
	@$(NODE_BIN) ./scripts/bump-version.js $(CHANNEL) $(BUMP)

# Help target
help:
	@echo "Available targets:"
	@echo "  all             : Clean, install, build, and package"
	@echo "  clean           : Remove build artifacts"
	@echo "  install         : Install dependencies"
	@echo "  build           : Build the extension"
	@echo "  package         : Create VSIX package"
	@echo "  package-nightly : Create nightly VSIX packages (Marketplace pre-release + Open VSX companion)"
	@echo "  publish         : Publish to BOTH VS Code Marketplace and Open VSX"
	@echo "  publish-nightly : Publish nightly builds to BOTH VS Code Marketplace and Open VSX"
	@echo "  publish-vsx     : Publish to VS Code Marketplace only"
	@echo "  publish-ovsx    : Publish to Open VSX Registry only"
	@echo "  git-tag         : Stable version bump, commit, tag, and push (refuses odd minors and vv tags)"
	@echo ""
	@echo "Testing targets:"
	@echo "  test            : Run unit tests"
	@echo "  test-unit       : Run unit tests only"
	@echo "  test-integration: Run integration tests"
	@echo "  test-renderer   : Run renderer component tests"
	@echo "  test-all        : Run all tests"
	@echo "  coverage        : Generate coverage report"
	@echo "  coverage-report : Generate HTML coverage report"
	@echo ""
	@echo "Docker testing targets:"
	@echo "  docker-up       : Start PostgreSQL test containers (12-17)"
	@echo "  docker-down     : Stop and remove test containers"
	@echo "  docker-logs     : View container logs"
	@echo "  docker-clean    : Remove containers and volumes"
	@echo "  test-full       : Run full test suite with Docker (docker-up → test-all → docker-down)"