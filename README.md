# Octopus CLI

Command-line interface for [Octopus](https://octopus-review.ai) — AI-powered PR review and codebase intelligence platform.

## Installation

```bash
npm install -g @octp/cli
```

## Authentication

### Browser Login (Recommended)

```bash
octopus login
```

Opens your browser to authorize the CLI with your Octopus account. Select an organization, approve access, and you're ready to go.

### Token Login

```bash
octopus login --token oct_your_api_token
```

Use an existing API token (generated from the Octopus dashboard) to authenticate directly.

### Custom API URL

```bash
octopus login --api-url https://your-instance.example.com
```

### Multiple Profiles

```bash
octopus login --profile work
octopus login --profile personal
octopus config set activeProfile work
```

### Environment Variables

| Variable | Description |
|---|---|
| `OCTOPUS_API_KEY` | API token (overrides saved config) |
| `OCTOPUS_API_URL` | API base URL (overrides saved config) |

## Commands

### `octopus whoami`

Display your current user and organization info.

```
$ octopus whoami

  Account
    Name:  John Doe
    Email: john@example.com

  Organization
    Name:    Acme Corp
    Slug:    acme-corp
    Members: 12
    Repos:   34
```

### `octopus repo list`

List all repositories connected to your organization.

```
$ octopus repo list

  Repository          Provider   Index     Analysis   PRs   Last Indexed
  acme/backend        github     indexed   done       42    2 hours ago
  acme/frontend       github     indexed   done       28    1 day ago
  acme/mobile-app     github     pending   pending    0     —

  3 repositories total
```

### `octopus repo status [repo]`

Show detailed status for a repository. Auto-detects the repo from your current git remote, or specify it explicitly.

```bash
# Auto-detect from current directory
octopus repo status

# Specify explicitly
octopus repo status acme/backend
```

```
$ octopus repo status

  acme/backend
    Provider:       github
    Default Branch: main
    Auto Review:    enabled

  Indexing
    Status:     indexed
    Last Index: 2 hours ago
    Files:      847/847
    Chunks:     3,241
    Vectors:    3,241
    Duration:   2m 14s

  Analysis
    Status:      done
    Last Analyzed: 1 day ago
    Purpose:     Backend API service for the Acme platform
    Summary:     Node.js REST API with PostgreSQL...

  Stats
    Pull Requests: 42
    Contributors:  8
```

### `octopus repo index [repo]`

Trigger code indexing for a repository. The CLI polls until indexing completes.

```bash
octopus repo index
octopus repo index acme/backend
```

### `octopus repo analyze [repo]`

Run AI analysis on a repository to generate purpose summaries and codebase understanding.

```bash
octopus repo analyze
octopus repo analyze acme/backend
```

### `octopus repo chat [repo]`

Start an interactive chat session about a repository. Ask questions about the codebase and get AI-powered answers with full context.

```
$ octopus repo chat

  Chatting about acme/backend. Type 'exit' or Ctrl+C to quit.

  you> How does authentication work in this project?
  octopus> The project uses JWT-based authentication with...

  you> Where are the database migrations?
  octopus> Database migrations are located in...
```

### `octopus pr review <pr>`

Trigger an AI review on a pull request. Accepts a PR number or full URL.

```bash
# By PR number (uses current repo)
octopus pr review 123

# By GitHub URL
octopus pr review https://github.com/acme/backend/pull/123

# By Bitbucket URL
octopus pr review https://bitbucket.org/acme/backend/pull-requests/123
```

The review results are posted as comments directly on the PR.

### `octopus knowledge list`

List all knowledge base documents in your organization.

```
$ octopus knowledge list

  ID        Title               Type     Status    Chunks   Created
  cm3x...   API Guidelines      file     indexed   12       3 days ago
  cm4a...   Security Policy     file     indexed   8        1 week ago

  2 documents total
```

### `octopus knowledge add <file>`

Upload a file to your organization's knowledge base. These documents provide additional context for AI reviews.

```bash
octopus knowledge add docs/api-guidelines.md
octopus knowledge add --title "Security Policy" security.pdf
```

### `octopus knowledge remove <id>`

Remove a document from the knowledge base.

```bash
octopus knowledge remove cm3x1234
```

### `octopus usage`

Show your organization's monthly usage, spend, and credit balance.

```
$ octopus usage

  Monthly Usage
    Period:        Mar 1, 2026 — now
    Total Spend:   $12.34
    Spend Limit:   $100.00
    Credit Balance: $87.66 (+ $10.00 free)

  Breakdown
    Model               Operation   Calls   Input      Output     Cost
    claude-sonnet-4-6    review      45      1,234,567  234,567    $8.50
    text-embedding-3-l   embedding   120     2,345,678  0          $2.34
    claude-haiku-4-5     chat        30      345,678    45,678     $1.50
```

### `octopus config list`

List all saved profiles.

```
$ octopus config list

  Profile     Org          API URL                      Token
  * default   acme-corp    https://octopus-review.ai    oct_a1b2...
    personal  my-org       https://octopus-review.ai    oct_c3d4...
```

### `octopus config set <key> <value>`

Update a configuration value.

```bash
octopus config set activeProfile personal
octopus config set apiUrl https://your-instance.example.com
```

### `octopus config get <key>`

Read a configuration value. Available keys: `activeProfile`, `apiUrl`, `orgSlug`, `orgId`.

```bash
octopus config get activeProfile
octopus config get apiUrl
```

### `octopus logout`

Remove saved credentials for a profile.

```bash
octopus logout
octopus logout --profile work
```

## Configuration

Credentials and settings are stored in `~/.config/octopus/config.json` with `0600` permissions (readable only by you).

```json
{
  "activeProfile": "default",
  "profiles": {
    "default": {
      "apiUrl": "https://octopus-review.ai",
      "token": "oct_...",
      "orgSlug": "acme-corp",
      "orgId": "cm3x..."
    }
  }
}
```

## Repository Auto-Detection

Commands that accept a `[repo]` argument will automatically detect the repository from your current directory's git remote. This means you can run most commands without specifying a repo:

```bash
cd ~/projects/my-app
octopus repo status     # auto-detects from git remote
octopus repo index      # auto-detects from git remote
octopus pr review 42    # auto-detects from git remote
```

## License

MIT
