"""SoundRoom component version policy and optimistic, idempotent CI writeback.

Standard library only. Run apply only in a clean, disposable CI checkout.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time


PATTERN = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)([b-z]?)")
LEVELS = {"suffix": 0, "fix": 1, "feature": 2, "major": 3}
ZERO = "0" * 40


def parse(value):
    match = PATTERN.fullmatch(value)
    if not match:
        raise ValueError(f"Invalid component VERSION: {value!r}")
    major, feature, fix, suffix = match.groups()
    return int(major), int(feature), int(fix), suffix


def bump(value, level):
    major, feature, fix, suffix = parse(value)
    if level == "major":
        return f"{major + 1}.0.0"
    if level == "feature":
        return f"{major}.{feature + 1}.0"
    if level == "fix" or (level == "suffix" and suffix == "z"):
        return f"{major}.{feature}.{fix + 1}"
    if level == "suffix":
        return f"{major}.{feature}.{fix}{chr(ord(suffix) + 1) if suffix else 'b'}"
    raise ValueError(f"Unknown bump: {level}")


def classify(messages, current):
    """One increment per push; the strongest contained change wins."""
    result = "suffix"
    for message in messages:
        header = message.splitlines()[0] if message else ""
        match = re.match(r"(\w+)(?:\([^\n)]+\))?(!)?(?::|\s)", header)
        kind = match.group(1) if match else ""
        breaking = bool(match and match.group(2)) or bool(
            re.search(r"(?m)^BREAKING[ -]CHANGE:", message)
        )
        level = ("feature" if parse(current)[0] == 0 else "major") if breaking else (
            "feature" if kind == "feat" else
            "suffix" if kind in {"docs", "style", "test", "chore", "ci", "build"} else "fix"
        )
        # Explicit intent may promote a light change; it cannot hide a fix/feature.
        for hint in re.findall(r"(?m)^Version-Bump:\s*(\S+)\s*$", message):
            if hint not in LEVELS:
                raise ValueError(f"Invalid Version-Bump: {hint}")
            level = max((level, hint), key=LEVELS.get)
        result = max((result, level), key=LEVELS.get)
    return result


def git(*args, check=True):
    return subprocess.run(["git", *args], text=True, capture_output=True, check=check)


def read_version(ref=None):
    value = git("show", f"{ref}:VERSION").stdout if ref else Path("VERSION").read_text()
    value = value.strip()
    parse(value)
    return value


def receipt(ref, marker):
    for record in git("log", "--format=%H%x00%B%x00%x1e", ref).stdout.split("\x1e"):
        fields = record.strip().split("\x00")
        if len(fields) >= 2 and marker in fields[1].splitlines():
            return fields[0]
    return None


def apply(event, attempts=12, delay=1):
    ref = event["ref"]
    source = event["after"]
    before = event.get("before", ZERO)
    if event.get("deleted") or not ref.startswith("refs/heads/"):
        raise ValueError("Only non-deleted branch push events can refresh VERSION")
    if not re.fullmatch(r"[0-9a-f]{40}", source) or source == ZERO:
        raise ValueError("Invalid source commit")
    if not re.fullmatch(r"[0-9a-f]{40}", before):
        raise ValueError("Invalid previous commit")
    git("check-ref-format", ref)
    if git("status", "--porcelain").stdout:
        raise ValueError("Version writeback requires a clean CI checkout")
    if event.get("forced"):
        raise ValueError("Force pushes are unsupported; reconcile history before retrying")
    if before != ZERO:
        git("merge-base", "--is-ancestor", before, source)
    messages = git("log", "--no-merges", "--format=%B%x00",
                   f"{before}..{source}" if before != ZERO else source,
                   *([] if before != ZERO else ["-1"])).stdout.split("\x00")
    messages = [message.strip() for message in messages if message.strip()]
    marker = f"Version-Source: {ref}@{source}"
    for attempt in range(attempts):
        # No Actions concurrency group: GitHub's pending-run replacement can lose pushes.
        git("fetch", "--no-tags", "origin", ref)
        tip = git("rev-parse", "FETCH_HEAD").stdout.strip()
        existing = receipt(tip, marker)
        if existing:
            return {"version": read_version(existing), "commit": existing, "source": source,
                    "reused": True}
        if git("merge-base", "--is-ancestor", source, tip, check=False).returncode:
            raise ValueError("Source push is no longer on the branch; refusing stale writeback")
        git("checkout", "--detach", tip)
        current = read_version()
        # A merged branch must not lower the target branch's pre-push version.
        if before != ZERO and git("cat-file", "-e", f"{before}:VERSION", check=False).returncode == 0:
            current = max((current, read_version(before)), key=parse)
        level = classify(messages, current)
        version = bump(current, level)
        Path("VERSION").write_text(version + "\n")
        git("add", "--", "VERSION")
        git("-c", "user.name=github-actions[bot]", "-c",
            "user.email=41898282+github-actions[bot]@users.noreply.github.com",
            "commit", "-m", f"chore(version): 自动更新至 {version}\n\n{marker}\nVersion-Level: {level}")
        commit = git("rev-parse", "HEAD").stdout.strip()
        pushed = git("push", "origin", f"HEAD:{ref}", check=False)
        if pushed.returncode == 0:
            return {"version": version, "commit": commit, "source": source, "reused": False}
        # Re-read the remote receipt as well: a lost response can follow a successful push.
        if attempt + 1 < attempts:
            time.sleep(delay)
    raise RuntimeError("VERSION writeback failed after retries. Check branch permissions/protection and rerun.\n"
                       + pushed.stderr)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["check", "apply"])
    args = parser.parse_args()
    if args.command == "check":
        print(read_version())
        return
    if os.environ.get("GITHUB_EVENT_NAME") != "push":
        raise ValueError("Automatic writeback requires a GitHub push event")
    result = apply(json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text()))
    print(json.dumps(result, ensure_ascii=False))
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        for key in ("version", "commit", "source"):
            output.write(f"{key}={result[key]}\n")


if __name__ == "__main__":
    main()
