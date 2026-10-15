from pathlib import Path

root = Path(__file__).parent / 'backend/app'
p = root / 'review_runner.py'
s = p.read_text()
s = s.replace('from pathlib import Path', 'from contextlib import asynccontextmanager\nfrom pathlib import Path')
start = s.index('async def _run_revision(')
end = s.index('\n\nasync def run_runtime_probes', start)
old = s[start:end]
setup = old[old.index('        emit(run_id, "runtime", "running"'):old.index('        for probe in probes:')]
setup = setup.replace('        needs_app = any(item.kind in {"http", "browser"} for item in probes)',
                      '        needs_app = any(item.kind in {"http", "browser"} for item in probes)')
# Setup state survives startup failure so independent native checks can still run.
setup = setup.replace('        services = analysis.get("services", [])',
                      '        state["dependencies_ready"] = True\n        services = analysis.get("services", [])')
setup = setup.replace('        needs_app =', '        state["services_ready"] = True\n        needs_app =')
setup = setup.replace('        install_commands, runtime_fixtures =', '''        for runtime, expected in analysis.get("runtime_versions", {}).items():
            binary = "python" if runtime == "python" else "node"
            code, actual = await _command("docker", "exec", container, binary, "--version", timeout=20)
            version = actual.strip().removeprefix("Python ").removeprefix("v")
            if code or not (version == expected or version.startswith(expected + ".")):
                raise RuntimeError(f"{runtime} requires {expected}; runner provides {version}")
        install_commands, runtime_fixtures =''')
setup = setup.replace('        emit(run_id, "runtime", "failed" if app_error else "passed"',
                      '        state.update(origin=origin, environment=environment, app_error=app_error, browser_error=browser_error)\n        emit(run_id, "runtime", "failed" if app_error else "passed"')
cleanup = old[old.index('    finally:'):]
header = '''@asynccontextmanager
async def prepare_runtime(run_id: str, context: dict, revision: str, probes: list):
    """Own a runtime independently of its probes and always release its resources."""
    source_key = "source_path" if revision == "head" else "base_source_path"
    source_text = context.get(source_key)
    source = Path(source_text).resolve() if source_text else None
    state = {"container": "", "origin": "", "environment": {}, "setup_error": "",
             "app_error": "", "browser_error": "", "dependencies_ready": False,
             "services_ready": False, "analysis": context.get("analysis", {})}
    if not source or not source.is_dir():
        state["setup_error"] = "Pinned source snapshot unavailable"
        emit(run_id, "runtime", "failed", agent="runner", node=f"{revision}_setup",
             success=False, detail={"error": state["setup_error"]})
        yield state
        return
    analysis = context["analysis"]
    setup_prefix = f"review/runtime/{revision}/setup-{context.get('runtime_environment_id', 'default')}"
    suffix = uuid4().hex[:8]
    container = f"ardberg-review-{revision}-{suffix}"
    network = f"{container}-net"
    database = f"{container}-postgres"
    state["container"] = container
    started = network_started = database_started = False
    processes = []
    try:
        try:
'''
setup = '\n'.join('    ' + line if line else line for line in setup.splitlines()) + '\n'
tail = '''        except Exception as exc:
            state["setup_error"] = str(exc)
            emit(run_id, "runtime", "failed", agent="runner", node=f"{revision}_setup",
                 success=False, detail={"error": str(exc)})
        yield state
'''
execute = '''

async def observe_prepared(run_id: str, state: dict, revision: str, probes: list) -> list[dict]:
    observations = []
    for probe in probes:
        blocker = state["setup_error"] or (state["browser_error"] if probe.kind == "browser" else "") or (
            state["app_error"] if probe.kind in {"http", "browser"} or
            state["analysis"].get("runtime_processes") else "")
        if blocker:
            detail = {"probe_id": probe.id, "expectation_id": probe.expectation_id,
                      "revision": revision, "kind": probe.kind, "status": "blocked", "error": blocker}
            emit(run_id, "runtime", "not_selected", agent="runner", node=probe.id, detail=detail)
            observations.append(detail)
        else:
            observations.append(await _observe(run_id, state["container"], revision, probe,
                                               state["origin"], state["environment"]))
    return observations


async def _run_revision(run_id: str, context: dict, revision: str, probes: list) -> list[dict]:
    if not probes:
        return []
    async with prepare_runtime(run_id, context, revision, probes) as state:
        return await observe_prepared(run_id, state, revision, probes)
'''
s = s[:start] + header + setup + tail + cleanup + execute + s[end:]
s = s.replace('async def run_runtime_probes(run_id: str, context: dict, plan) -> dict:',
              'async def run_runtime_probes(run_id: str, context: dict, plan, prepared=None) -> dict:')
s = s.replace('        head_result, base_result = await asyncio.gather(\n            _run_revision(run_id, scoped, "head", probes),', '''        reusable = prepared and can_reuse(prepared, analysis, probes)
        head_result, base_result = await asyncio.gather(
            observe_prepared(run_id, prepared, "head", probes) if reusable else
            _run_revision(run_id, scoped, "head", probes),''')
s += '''

def can_reuse(state: dict, analysis: dict, probes: list) -> bool:
    """Reuse only equivalent ready environments; never apply a PR recipe to base."""
    if state["setup_error"] or state["app_error"] or not state["container"]:
        return False
    # Browser helpers are provisioned separately by the focused browser environment.
    if any(p.kind == "browser" for p in probes):
        return False
    baseline = state["analysis"]
    if not {_setup_key(c) for c in analysis.get("install_commands", [])} <= {
            _setup_key(c) for c in baseline.get("install_commands", [])}:
        return False
    for key in ("services", "runtime_processes", "runtime_setup_commands", "test_environment"):
        if analysis.get(key, []) != baseline.get(key, []):
            return False
    return analysis.get("runtime_target_url", "") == baseline.get("runtime_target_url", "")
'''
p.write_text(s)

p = root / 'inspection.py'
s = p.read_text().replace('from .artifacts import run_dir, write_artifact',
                        'from .artifacts import run_dir, restore_artifact, write_artifact')
s = s.replace('async def prepare_run(run_id: str) -> dict:',
              'async def prepare_run(run_id: str, *, pinned_only: bool = False) -> dict:')
s = s.replace('"commits": commits[:100], "commits_truncated": commits_truncated,\n                     "diff_artifact": diff_artifact}',
              '"commits": commits[:100], "commits_truncated": commits_truncated,\n                     "commits_error": commits_error, "diff_artifact": diff_artifact}')
anchor = '    emit(run_id, "preflight", "running", node="validate_instruction")'
idx = s.index(anchor, s.index('async def prepare_run'))
s = s[:idx] + '''    pinned = get_run(run_id)["context"]
    if pinned_only:
        return {**pinned, "needs_preflight_analysis": True}
    return await finish_preflight(run_id, pinned)


async def finish_preflight(run_id: str, pinned: dict) -> dict:
    """Model-dependent inspection; baseline setup never waits for this function."""
    run = get_run(run_id)
    review_mode = pinned.get("mode") == "critique"
    pr = {"title": run["title"], "body": pinned.get("pr_description", "")}
    head_sha, base_sha = pinned["head_sha"], pinned["base_sha"]
    source = Path(pinned["source_path"])
    base_source = Path(pinned["base_source_path"]) if pinned.get("base_source_path") else None
    base_source_error = pinned.get("base_source_error", "")
    diff_artifact = pinned["diff_artifact"]
    changed = json.loads(restore_artifact(run_id, diff_artifact).read_text(encoding="utf-8"))
    commits, commits_truncated = pinned.get("commits", []), pinned.get("commits_truncated", False)
    commits_error = pinned.get("commits_error", "")
    partial_files, partial_snippets = pinned["files"], pinned["snippets"]

''' + s[idx:]
s = s.replace('"there is no native test framework. Existing test-suite commands are background "\n           "context and will not be run by this workflow."',
              '"there is no native test framework. Baseline repository checks execute separately "\n           "from focused behavior probes."')
p.write_text(s)
