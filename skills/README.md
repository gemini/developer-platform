# Skills

Claude Code skills for the Gemini Developer Platform.

## Installing skills

Skills can be installed using the [`skills`](https://www.npmjs.com/package/skills) CLI.

### Install all skills

```bash
npx skills add gemini/developer-platform -a claude-code --all -y
```

### Install a specific skill

```bash
npx skills add gemini/developer-platform -a claude-code --skill gemini-developer
```

### Preview available skills before installing

```bash
npx skills add gemini/developer-platform --list
```

### Install globally (available across all projects)

```bash
npx skills add gemini/developer-platform -a claude-code --all -g -y
```

## Available skills

| Skill | Description |
|-------|-------------|
| [`gemini-candles`](gemini-candles/) | Display terminal candlestick charts for Gemini trading pairs |
| [`gemini-developer`](gemini-developer/) | Guide for building integrations with the Gemini API |

## Manual installation

You can also copy any skill directory directly into your project's `skills/` folder or symlink it there.
