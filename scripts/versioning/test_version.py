import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import version


class PolicyTests(unittest.TestCase):
    def test_valid_and_invalid_versions(self):
        for value in ("0.1.0", "1.23.456b", "10.0.0z"):
            version.parse(value)
        for value in ("v1.0.0", "01.0.0", "1.0", "1.0.0a", "1.0.0-b", "1.0.0bb", "1.0.0\n"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                version.parse(value)

    def test_all_increment_boundaries(self):
        cases = [("0.1.0", "suffix", "0.1.0b"), ("0.1.0b", "suffix", "0.1.0c"),
                 ("0.1.0y", "suffix", "0.1.0z"), ("0.1.0z", "suffix", "0.1.1"),
                 ("0.1.9b", "fix", "0.1.10"), ("0.1.9b", "feature", "0.2.0"),
                 ("0.9.9z", "major", "1.0.0")]
        for old, level, expected in cases:
            with self.subTest(old=old, level=level):
                self.assertEqual(version.bump(old, level), expected)

    def test_commit_intent_and_priority(self):
        cases = [(["docs: 更新文档"], "suffix"), (["feat 新功能"], "feature"),
                 (["fix(api): 修复"], "fix"), (["perf: 性能优化"], "fix"),
                 (["refactor: 重构"], "fix"), (["未知提交说明"], "fix"),
                 (["docs: 更新", "fix: 修复", "feat: 功能"], "feature"),
                 (["chore: 配置\n\nVersion-Bump: fix"], "fix"),
                 (["feat: 功能\n\nVersion-Bump: suffix"], "feature"),
                 (["feat!: 不兼容"], "feature"),
                 (["chore: 正式发布\n\nVersion-Bump: major"], "major")]
        for messages, expected in cases:
            with self.subTest(messages=messages):
                self.assertEqual(version.classify(messages, "0.1.0"), expected)
        self.assertEqual(version.classify(["fix!: 不兼容"], "1.1.0"), "major")
        self.assertEqual(version.classify(["fix: 变更\n\nBREAKING CHANGE: 协议"], "1.1.0"), "major")
        with self.assertRaises(ValueError):
            version.classify(["docs: x\n\nVersion-Bump: skip"], "0.1.0")


class GitTests(unittest.TestCase):
    def setUp(self):
        self.original = Path.cwd()
        sandbox = self.original / ".version-tests"
        sandbox.mkdir(exist_ok=True)
        # Keep disposable test repositories inside the workspace; never use /tmp.
        self.root = Path(tempfile.mkdtemp(dir=sandbox))
        self.remote = self.root / "remote.git"
        self.work = self.root / "work"
        self.run_git("init", "--bare", str(self.remote))
        self.run_git("clone", str(self.remote), str(self.work))
        os.chdir(self.work)
        self.run_git("checkout", "-b", "main")
        self.run_git("config", "user.name", "Version Test")
        self.run_git("config", "user.email", "version@example.invalid")
        Path("VERSION").write_text("0.1.0\n")
        self.before = self.commit("chore: 基线")
        self.run_git("push", "origin", "HEAD:refs/heads/main")

    def tearDown(self):
        os.chdir(self.original)

    def run_git(self, *args):
        return subprocess.run(["git", *args], text=True, capture_output=True, check=True).stdout.strip()

    def commit(self, message):
        self.run_git("add", ".")
        self.run_git("commit", "--allow-empty", "-m", message)
        return self.run_git("rev-parse", "HEAD")

    def push_event(self, message="feat: 新功能", ref="refs/heads/main"):
        source = self.commit(message)
        self.run_git("push", "origin", f"HEAD:{ref}")
        return {"ref": ref, "before": self.before, "after": source}

    def test_writeback_and_rerun_are_idempotent(self):
        event = self.push_event()
        first = version.apply(event, delay=0)
        self.assertEqual(first["version"], "0.2.0")
        self.assertFalse(first["reused"])
        again = version.apply(event, delay=0)
        self.assertEqual(first["commit"], again["commit"])
        self.assertTrue(again["reused"])
        self.assertEqual(self.run_git("diff", "--name-only", first["commit"] + "^", first["commit"]), "VERSION")

    def test_multiple_commits_increment_once(self):
        self.commit("fix: 修复一")
        event = self.push_event("fix: 修复二")
        self.assertEqual(version.apply(event, delay=0)["version"], "0.1.1")

    def test_new_branch_and_suffix(self):
        event = self.push_event("docs: 更新", "refs/heads/topic/test")
        event["before"] = version.ZERO
        self.assertEqual(version.apply(event, delay=0)["version"], "0.1.0b")

    def test_dirty_and_forced_events_fail(self):
        event = self.push_event()
        Path("uncommitted").write_text("keep")
        with self.assertRaisesRegex(ValueError, "clean"):
            version.apply(event)
        self.commit("chore: 保存本地文件")
        with self.assertRaisesRegex(ValueError, "Force"):
            version.apply(dict(event, forced=True))

    def test_deleted_and_tags_never_write(self):
        event = self.push_event()
        for invalid in (dict(event, deleted=True), dict(event, ref="refs/tags/v0.1.0")):
            with self.assertRaises(ValueError):
                version.apply(invalid)

    def test_race_retries_without_overwriting_another_push(self):
        event = self.push_event("fix: 修复")
        other = self.root / "other"
        self.run_git("clone", "-b", "main", str(self.remote), str(other))
        self.run_git("-C", str(other), "config", "user.name", "Other Writer")
        self.run_git("-C", str(other), "config", "user.email", "other@example.invalid")
        (other / "parallel.txt").write_text("preserve concurrent work\n")
        self.run_git("-C", str(other), "add", ".")
        self.run_git("-C", str(other), "commit", "-m", "docs: 并发变更")
        real_git = version.git
        raced = False

        def racing_git(*args, **kwargs):
            nonlocal raced
            if args[0] == "push" and not raced:
                raced = True
                self.run_git("-C", str(other), "push", "origin", "main")
            return real_git(*args, **kwargs)

        with patch.object(version, "git", racing_git):
            result = version.apply(event, delay=0)
        self.assertTrue(raced)
        self.assertEqual(result["version"], "0.1.1")
        self.assertEqual(Path("parallel.txt").read_text(), "preserve concurrent work\n")

    def test_out_of_order_pushes_each_get_one_receipt(self):
        older = self.push_event("fix: 先推送")
        self.before = older["after"]
        newer = self.push_event("feat: 后推送")
        self.assertEqual(version.apply(newer, delay=0)["version"], "0.2.0")
        self.assertEqual(version.apply(older, delay=0)["version"], "0.2.1")
        self.assertTrue(version.apply(newer, delay=0)["reused"])

    def test_permission_failure_is_not_reported_as_success(self):
        event = self.push_event()
        hook = self.remote / "hooks" / "pre-receive"
        hook.write_text("#!/bin/sh\nexit 1\n")
        hook.chmod(0o755)
        with self.assertRaisesRegex(RuntimeError, "writeback failed"):
            version.apply(event, attempts=2, delay=0)


if __name__ == "__main__":
    unittest.main()
