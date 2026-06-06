# SPM — Repo Setup (hackathon is live; do this fast)

Goal: an empty repo → a working monorepo with Claude Code fully primed (Algorand skills + SPM-specific config) in ~20 min, before the build clock matters.

## 0. Prereqts (both devs, in parallel)

```bash
# AlgoKit (via pipx)
pip install --user pipx && python -m pipx ensurepath   # restart shell after
pipx install algokit                                    # or: pipx upgrade algokit
algokit --version

# Node 20+ and Claude Code
node -v        # need >= 20
npm i -g @anthropic-ai/claude-code

# Docker running (AlgoKit LocalNet needs it)
docker info >/dev/null && echo "docker ok"
```

You also need a **GitHub PAT** (`GITHUB_TOKEN`) — the Algorand agent skills' MCP config reads it:
```bash
export GITHUB_TOKEN=ghp_xxx   # add to ~/.zshrc / ~/.bashrc
```

## 1. Scaffold the monorepo

```bash
mkdir spm && cd spm && git init
# AlgoKit project for the contract (TypeScript template)
algokit init --no-git    # choose: TypeScript smart contract template -> name it "contracts"
# (or `algokit init -t typescript` non-interactively if your CLI version supports it)
npm init -y
```

Target layout:
```
spm/
├── CLAUDE.md                # written by bootstrap.sh (project memory + @imports)
├── AGENTS.md                # from algorand-agent-skills (imported by CLAUDE.md)
├── SPEC.md  SETUP.md  PLAN.md
├── NOTES.md                 # running two-dev handoff log
├── .mcp.json                # from algorand-agent-skills (Algorand docs MCP)
├── .claude/
│   ├── settings.json
│   ├── agents/              # subagents (5)
│   ├── commands/            # slash commands (4)
│   └── skills/              # SPM skills (3) + Algorand DevRel skills (copied)
├── docs/architecture.md     # imported by CLAUDE.md
├── contracts/               # AlgoKit TS contract (SplitRouter)
├── proxy/                   # Hono overlay + x402 + SQLite status store
├── mcp/                     # MCP server (check_audit_status, install_audited_package)
└── cli/                     # spm wrapper
```

## 2. Load the Algorand DevRel agent skills (highest-leverage step)

This is what stops Claude Code from emitting deprecated AVM APIs.

```bash
# clone once, outside the repo
git clone https://github.com/algorand-devrel/algorand-agent-skills.git ../algorand-agent-skills

# copy SKILLS into Claude Code's skill dir (NOT root ./skills)
mkdir -p .claude/skills
cp -r ../algorand-agent-skills/skills/* .claude/skills/

# copy AGENTS.md (imported by our CLAUDE.md) and the Algorand docs MCP config
cp ../algorand-agent-skills/setups/AGENTS.md ./AGENTS.md
cp ../algorand-agent-skills/setups/claude-code/.mcp.json ./.mcp.json

# IMPORTANT: do NOT copy their setups/claude-code/CLAUDE.md to repo root.
# Our bootstrap.sh writes the root CLAUDE.md and @imports AGENTS.md instead,
# so the two don't collide. If you want their CLAUDE.md content, drop it at
# docs/algorand-claude.md and add `@docs/algorand-claude.md` to our CLAUDE.md.
```

> Alternative one-liner: `vibekit init` auto-detects Claude Code and installs the same skills + MCP. Use it instead of the manual copy if you prefer; then still run `bootstrap.sh` for the SPM-specific layer.

## 3. Run the SPM bootstrap

```bash
bash bootstrap.sh      # writes CLAUDE.md, .claude/{settings,agents,commands}, SPM skills, docs/, NOTES.md
```

## 4. Fund TestNet wallets

```bash
# generate 6 accounts (1 payer + 5 recipients) — see contracts/scripts/genaccounts.ts after bootstrap
# fund ALGO: Lora TestNet faucet  |  fund USDC: Circle TestNet faucet
# USDC TestNet ASA id = 10458941
```
- Lora explorer + ALGO faucet: TestNet.
- Circle USDC faucet: TestNet USDC.

## 5. Verify Claude Code sees everything

```bash
claude          # start in repo root
# inside Claude Code:
/agents         # should list: algorand-contract-engineer, x402-proxy-engineer,
                #               mcp-payer-engineer, integration-tester, scope-sentinel
/skills         # should list SPM skills + Algorand DevRel skills
# CLAUDE.md auto-loads as project memory; confirm @imports resolved (AGENTS.md, docs/architecture.md)
```

## 6. Env file

`.env` (gitignored) — populated after `setup.ts` deploys:
```
ALGOD_TOKEN=...           ALGOD_SERVER=https://testnet-api.algonode.cloud
USDC_ASA_ID=10458941
SPLIT_APP_ID=             SPLIT_APP_ADDRESS=
FACILITATOR_URL=          # GoPlausible; blank => Path B direct submit
PAYER_MNEMONIC=           # demo agent wallet
RECIP_AUDITOR=  RECIP_MAINTAINER=  RECIP_ADVERSARIAL=  RECIP_TREASURY=  RECIP_OPS=
```

Now open `PLAN.md` and split work per the two-dev sprint plan.
