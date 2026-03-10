.PHONY: cre-check ready-to-push contracts-build contracts-test workflows-typecheck dashboard-build format-check secrets-check

# ──────────────────────────────────────────────
# Sentinel-Orbital CRE Guardrails
# ──────────────────────────────────────────────

WORKFLOWS := treasury-risk governance-monitor price-feeds morpho-vault-health \
             token-flows ccip-lane-health curve-pool link-ai-arbitrage

# --- Individual targets ---

contracts-build:
	forge build

contracts-test:
	forge test -vv

workflows-typecheck:
	@for wf in $(WORKFLOWS); do \
		echo "==> Typechecking $$wf"; \
		(cd workflows/$$wf/my-workflow && bun install --frozen-lockfile && tsc --noEmit) || exit 1; \
	done

dashboard-build:
	cd dashboard && npm ci && tsc --noEmit && npx next build

format-check:
	npx prettier --check 'dashboard/**/*.{ts,tsx}' 'scripts/**/*.{ts,mjs}'

secrets-check:
	@echo "==> Scanning for leaked secrets..."
	@! git grep -l 'PRIVATE_KEY\|ANTHROPIC_API_KEY\|OPENAI_API_KEY' -- ':!.env.example' ':!.gitignore' ':!CLAUDE.md' ':!.cre/guardrails.json' ':!Makefile'
	@echo "  OK — no secrets found in tracked files"

# --- Composite targets ---

cre-check: contracts-build contracts-test workflows-typecheck dashboard-build format-check
	@echo ""
	@echo "✓ All CRE guardrails passed"

ready-to-push: cre-check secrets-check
	@echo ""
	@echo "✓ Ready to push"
