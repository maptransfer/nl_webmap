#!/usr/bin/env python3
"""tools/verify.py — reusable CDP-driven headless-Chrome verification harness.

Every session on this project used to hand-write a throwaway
Chrome-DevTools-Protocol driver, run it once from the session scratchpad, and
throw it away (see PROGRESS.md > "Build & test commands"). This is that driver,
committed: a small registry of independent, named checks that a future session
extends by adding one @check-decorated function, rather than rewriting the
transport and rediscovering the same gotchas.

Usage (see tools/verify.bat for the Windows/OSGeo4W launcher):
    python tools/verify.py                     # all checks vs localhost:8000
    python tools/verify.py --list
    python tools/verify.py wie_popup_opens console_clean
    python tools/verify.py --url https://maptransfer.github.io/nl_webmap/

Exit codes: 0 all passed, 1 a check failed, 2 the harness itself could not run
(no Chrome, WebGL unavailable, server unreachable, unknown check name, ...).

Gotchas retired here (see PROGRESS.md for the war stories):
  - CDP's Runtime.evaluate persists top-level const/let across calls in one
    execution context; a later eval reusing a name throws "already declared"
    and silently no-ops. Page.js() always wraps in an async IIFE, so this is
    structurally impossible rather than a rule to remember.
  - map.queryRenderedFeatures(point, {layers}) needs `point` as an [x, y]
    ARRAY. A plain {x, y} object is silently read as the *options* argument,
    so the call queries the whole viewport and every layer looks hit
    everywhere. Every call in this file uses an array.
  - The first-load #hint-toast overlays the lower map and swallows synthetic
    clicks aimed at the canvas there. Page.goto() dismisses it after the page
    is ready, before returning control to a check.
  - /favicon.ico 404s on every load (the project ships none) - harmless,
    predates all frontend work, and is filtered out of console-cleanliness
    assertions rather than treated as a regression.
  - (found this session) Chrome >=137 refuses the software WebGL fallback in
    headless mode without --enable-unsafe-swiftshader. Without it, MapLibre's
    context creation fails, map.on('load') never fires, and every check times
    out with no explanation. wait_ready() also pre-flights this explicitly.
  - (found this session) Input.dispatchMouseEvent needs clickCount:1 on both
    mousePressed/mouseReleased, or Chrome dispatches mousedown/mouseup but no
    `click` event, so MapLibre's click handler silently never runs.
  - (found this session) the favicon 404 arrives as a Log.entryAdded (source
    "network"), NOT a Runtime.consoleAPICalled - a console-only collector
    never sees it. This harness enables the Log domain and collects from it.
"""
import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

try:
    import websocket  # websocket-client
except ImportError:
    sys.exit(
        "ERROR: the 'websocket-client' package is required.\n"
        "Install it into the interpreter running this script, e.g.:\n"
        '  "C:\\OSGeo4W\\apps\\Python312\\python.exe" -m pip install websocket-client'
    )

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_URL = "http://localhost:8000/"

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
]


def find_chrome():
    for p in CHROME_CANDIDATES:
        if p and os.path.isfile(p):
            return p
    raise SystemExit(
        "ERROR: Chrome not found in any of:\n  " + "\n  ".join(CHROME_CANDIDATES) +
        "\nEdit CHROME_CANDIDATES in tools/verify.py to add its location."
    )


# ---------------------------------------------------------------------------
# Chrome process lifecycle
# ---------------------------------------------------------------------------

class Chrome:
    """Launches headless Chrome with its own throwaway profile and reads back
    the DevTools websocket endpoint it actually bound to
    (--remote-debugging-port=0 avoids colliding with a fixed port from a
    previous or concurrent run).

    On this machine a real Chrome window was already running, and plain
    `chrome.exe --version` silently relayed to it instead of running
    standalone. A distinct --user-data-dir avoids that relay - never share it
    with a real profile. Because a relay is possible, this class never treats
    its own child's liveness as a readiness signal: it waits on
    DevToolsActivePort appearing, with a deadline, and prints the child's own
    stderr if that file never shows up (rather than hanging with no clue why).
    """

    def __init__(self, headless=True):
        self.headless = headless
        self.profile_dir = tempfile.mkdtemp(prefix="nlwebmap_verify_")
        self.proc = None
        self.port = None
        self.ws_path = None

    def start(self):
        exe = find_chrome()
        args = [exe, f"--user-data-dir={self.profile_dir}"]
        if self.headless:
            args.append("--headless=new")
        args += [
            "--remote-debugging-port=0",
            "--remote-allow-origins=*",
            "--window-size=1440,900",
            # DPR feeds js/patterns.js's buildPatterns(Math.min(2,
            # devicePixelRatio)) and all click-coordinate math in this file.
            "--force-device-scale-factor=1",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-sync",
            "--disable-extensions",
            "--disable-background-networking",
            "--mute-audio",
            # Chrome >=137: without this, headless Chrome with no real GPU
            # refuses the software WebGL fallback. MapLibre's context creation
            # then fails and map.on('load') never fires - a 20s timeout with
            # no explanation anywhere in the check output.
            "--enable-unsafe-swiftshader",
            "about:blank",
        ]
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        self.proc = subprocess.Popen(
            args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            creationflags=creationflags,
        )

        port_file = Path(self.profile_dir) / "DevToolsActivePort"
        deadline = time.time() + 15
        while time.time() < deadline:
            if port_file.exists():
                try:
                    lines = port_file.read_text(encoding="utf-8").strip().splitlines()
                except OSError:
                    lines = []
                if len(lines) >= 2:
                    self.port = int(lines[0])
                    self.ws_path = lines[1]
                    return
            if self.proc.poll() is not None:
                out = self.proc.stdout.read().decode("utf-8", "replace") if self.proc.stdout else ""
                raise SystemExit(
                    f"ERROR: chrome.exe exited early (code {self.proc.returncode}).\n{out}"
                )
            time.sleep(0.1)
        raise SystemExit(
            "ERROR: DevToolsActivePort never appeared within 15s - chrome.exe "
            "may have handed off to an already-running instance instead of "
            "starting standalone. Check --user-data-dir isn't shared with a "
            "real profile."
        )

    def browser_ws_url(self):
        return f"ws://127.0.0.1:{self.port}{self.ws_path}"

    def stop(self):
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=5)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
        # Windows briefly holds file locks on a just-exited process's profile
        # dir; retry rather than let cleanup fail the whole run.
        for _ in range(5):
            try:
                shutil.rmtree(self.profile_dir)
                return
            except Exception:
                time.sleep(0.3)
        shutil.rmtree(self.profile_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# CDP transport
# ---------------------------------------------------------------------------

class CDP:
    """Thin CDP client. Connects to the browser endpoint and attaches to the
    single page target via a flat session (Target.attachToTarget,
    flatten=True) rather than connecting directly to a per-target websocket
    URL - this avoids the /json HTTP endpoint, whose rebinding protection can
    reject requests with a non-standard Host header."""

    def __init__(self, browser_ws_url):
        self.ws = websocket.create_connection(browser_ws_url, suppress_origin=True, timeout=30)
        self._id = 0
        self.session_id = None
        self._events = []  # buffered {"method": ..., "params": ...} dicts

    def _next_id(self):
        self._id += 1
        return self._id

    def _recv_one(self, timeout):
        self.ws.settimeout(timeout)
        return json.loads(self.ws.recv())

    def send(self, method, params=None, timeout=20):
        """Blocking call; returns the 'result' dict. Raises on a CDP-level
        error, and RuntimeError is left to the caller for a JS-level exception
        (see Page.js)."""
        msg_id = self._next_id()
        payload = {"id": msg_id, "method": method, "params": params or {}}
        if self.session_id:
            payload["sessionId"] = self.session_id
        self.ws.send(json.dumps(payload))

        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                msg = self._recv_one(max(0.05, deadline - time.time()))
            except websocket.WebSocketTimeoutException:
                break
            if msg.get("id") == msg_id:
                if "error" in msg:
                    raise RuntimeError(f"CDP error on {method}: {msg['error']}")
                return msg.get("result", {})
            self._events.append(msg)
        raise TimeoutError(f"CDP call {method} timed out after {timeout}s")

    def drain_events(self, timeout=0.05):
        """Pulls any currently-available frames off the socket into _events
        without blocking for new ones beyond `timeout`."""
        self.ws.settimeout(timeout)
        try:
            while True:
                self._events.append(json.loads(self.ws.recv()))
        except websocket.WebSocketTimeoutException:
            pass
        except Exception:
            pass

    def wait_event(self, method, timeout):
        for i, ev in enumerate(self._events):
            if ev.get("method") == method:
                del self._events[i]
                return ev.get("params")
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                msg = self._recv_one(max(0.05, deadline - time.time()))
            except websocket.WebSocketTimeoutException:
                break
            if msg.get("method") == method:
                return msg.get("params")
            self._events.append(msg)
        raise TimeoutError(f"timed out waiting for event {method}")

    def take_events(self, methods):
        """Drains the socket, then pops and returns every buffered event whose
        method is in `methods` (leaving everything else buffered)."""
        self.drain_events()
        matched = [e for e in self._events if e.get("method") in methods]
        self._events = [e for e in self._events if e.get("method") not in methods]
        return matched

    def attach_to_page(self):
        targets = self.send("Target.getTargets").get("targetInfos", [])
        page = next((t for t in targets if t.get("type") == "page"), None)
        if not page:
            raise RuntimeError("no page target found in a fresh Chrome instance")
        result = self.send("Target.attachToTarget", {"targetId": page["targetId"], "flatten": True})
        self.session_id = result["sessionId"]
        # Input and Emulation have no enable() method - they work unconditionally.
        for domain in ("Page", "Runtime", "Log", "Network"):
            self.send(f"{domain}.enable")
        return self.session_id

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Console/network classification
# ---------------------------------------------------------------------------

# MapLibre logs some genuinely-broken states at "warning" level, not "error" -
# these mean the map is visibly wrong (e.g. the fill-pattern trap js/app.js
# already has a comment about: a missing pattern image renders an empty fill)
# so they are promoted to FAIL despite the browser's own severity label.
SIGNIFICANT_WARNINGS = [
    re.compile(r"image .* could not be loaded", re.I),
    re.compile(r"glyphs?.*not found", re.I),
    re.compile(r"source .* error", re.I),
    re.compile(r"failed to load", re.I),
]

# Ignored outright, never even printed as a note. The favicon 404 predates all
# frontend work (the project ships no favicon.ico) and is harmless; it arrives
# as a Log.entryAdded (source "network"), not a console API call - some
# headless configurations skip the fetch entirely, so this is "ignore if
# present", never "assert present".
IGNORE_PATTERNS = [
    re.compile(r"favicon\.ico"),
]

# Reported as a note but never fails the run. The OSM raster basemap is
# third-party and PROGRESS.md already accepts it as a deviation at current
# traffic; map.on('error') both shows #error-banner and console.error()s on
# any failed/rate-limited OSM tile, so without this a flaky third party could
# fail an unrelated commit.
NOTE_ONLY_PATTERNS = [
    re.compile(r"tile\.openstreetmap\.org"),
]


def _matches_any(patterns, *texts):
    return any(p.search(t) for p in patterns for t in texts if t)


def classify_events(page):
    """Splits page.console / page.network into (fails, notes) using the rules
    above. `fails` gates the run; `notes` are printed but never gate it."""
    fails, notes = [], []
    for c in page.console:
        text, url = c.get("text", ""), c.get("url", "")
        if _matches_any(IGNORE_PATTERNS, text, url):
            continue
        is_note_worthy = _matches_any(NOTE_ONLY_PATTERNS, text, url)
        if c.get("level") == "error" or c.get("kind") == "exception":
            (notes if is_note_worthy else fails).append(c)
        elif c.get("level") == "warning":
            if _matches_any(SIGNIFICANT_WARNINGS, text):
                fails.append(c)
            else:
                notes.append(c)
    for n in page.network:
        url = n.get("url", "")
        if _matches_any(IGNORE_PATTERNS, url):
            continue
        is_note_worthy = _matches_any(NOTE_ONLY_PATTERNS, url)
        if n.get("failed"):
            if n.get("canceled"):
                continue  # a request cancelled by navigation, not a real failure
            entry = {"text": f"network failed: {n.get('errorText', '?')} ({url})"}
            (notes if is_note_worthy else fails).append(entry)
        elif n.get("status") is not None and not (200 <= n["status"] < 400):
            entry = {"text": f"HTTP {n['status']}: {url}"}
            (notes if is_note_worthy else fails).append(entry)
    return fails, notes


# ---------------------------------------------------------------------------
# Page: the API checks (and the harness itself) are written against
# ---------------------------------------------------------------------------

class Page:
    def __init__(self, cdp: CDP, base_url: str):
        self.cdp = cdp
        self.base_url = base_url
        self.console = []
        self.network = []

    # -- eval -----------------------------------------------------------
    def js(self, expr, timeout=20):
        """Evaluates `expr` (JS statements, may use await/return) in the
        page's main world, always inside an async IIFE - this makes the
        documented const/let re-declaration gotcha structurally impossible
        rather than a rule to remember. Raises with the JS stack on an
        exception; CDP returns HTTP-success with an exceptionDetails payload
        in that case, so reading only result.value would silently give None."""
        wrapped = f"(async () => {{ {expr} }})()"
        result = self.cdp.send("Runtime.evaluate", {
            "expression": wrapped,
            "awaitPromise": True,
            "returnByValue": True,
            "userGesture": True,
        }, timeout=timeout)
        if result.get("exceptionDetails"):
            ed = result["exceptionDetails"]
            desc = (ed.get("exception") or {}).get("description") or ed.get("text")
            raise RuntimeError(f"JS exception: {desc}")
        return result.get("result", {}).get("value")

    # -- navigation -------------------------------------------------------
    def goto(self, dismiss_toast=True):
        self.console = []
        self.network = []
        # Drop anything buffered from the previous check's page (this is a
        # simplification: a stale Page.loadEventFired could in principle slip
        # through without loaderId correlation, but each check runs to
        # completion, including its own wait_event, before the next begins).
        self.cdp.take_events((
            "Page.loadEventFired", "Log.entryAdded", "Runtime.consoleAPICalled",
            "Runtime.exceptionThrown", "Network.responseReceived", "Network.loadingFailed",
        ))

        self.cdp.send("Emulation.setDeviceMetricsOverride", {
            "width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False,
        })
        self.cdp.send("Page.navigate", {"url": self.base_url})
        self.cdp.wait_event("Page.loadEventFired", timeout=20)

        # A fresh page load is NOT a fresh profile: localStorage survives
        # across Page.navigate on the same origin. Without clearing it, the
        # first check to dismiss the toast changes the DOM for every later
        # check, making check order matter - the opposite of independence.
        try:
            self.js("try { localStorage.clear(); } catch (e) {}")
        except Exception:
            pass

        reason = self.wait_ready()
        if reason:
            raise TimeoutError(f"page not ready: {reason}")

        # let a render settle before any assertion/screenshot reads pixels
        self.js("await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));")

        if dismiss_toast:
            self.dismiss_toast()

    def wait_ready(self, timeout=20):
        """Polls a single composite readiness predicate every 100ms. Returns
        None once ready, or the last-seen reason string on timeout (never
        raises on timeout - the caller decides what a failed readiness gate
        means). map.loaded() alone isn't enough: js/app.js adds the 'nl'
        source and every style layer INSIDE map.on('load'), so there's a
        window where the style is loaded but no vector layer exists yet."""
        probe = """
          if (typeof maplibregl === 'undefined') return 'maplibregl not loaded';
          const probe = document.createElement('canvas');
          if (!probe.getContext('webgl2') && !probe.getContext('webgl')) {
            return 'WEBGL_UNAVAILABLE: add --enable-unsafe-swiftshader';
          }
          const map = window.map;
          if (!map) return 'window.map not set yet';
          if (!map.getSource('nl')) return "'nl' source not added yet";
          if (!map.isStyleLoaded()) return 'style not loaded';
          if (!map.isSourceLoaded('nl')) return "'nl' source not loaded";
          if (!map.areTilesLoaded()) return 'tiles not loaded';
          if (!map.loaded()) return 'map not loaded';
          const mod = await import(new URL('js/layers.js', document.baseURI).href);
          const HIT = mod.hitLayerIds(mod.LAYERS);
          const c = map.getCanvas();
          let found = false;
          for (let x = 20; x < c.width && !found; x += 50) {
            for (let y = 20; y < c.height && !found; y += 50) {
              if (map.queryRenderedFeatures([x, y], {layers: HIT}).length) found = true;
            }
          }
          if (!found) return 'no WiE feature rendered yet in this view';
          return null;
        """
        deadline = time.time() + timeout
        last_reason = "timed out before a single readiness check completed"
        while time.time() < deadline:
            try:
                reason = self.js(probe, timeout=5)
            except Exception as e:
                reason = f"eval error while polling readiness: {e}"
            if reason is None:
                return None
            if isinstance(reason, str) and reason.startswith("WEBGL_UNAVAILABLE"):
                raise SystemExit(f"ERROR: {reason}")
            last_reason = reason
            time.sleep(0.1)
        return last_reason

    def dismiss_toast(self):
        """Clicks #hint-dismiss via DOM .click() (no hit-testing needed), then
        asserts the toast is actually gone from layout. That second half is a
        regression guard for the v1 .toast[hidden] CSS-specificity bug, where
        toast.hidden was correctly true while the element stayed on screen -
        checking .hidden alone would have missed exactly that bug."""
        return self.js("""
          const toast = document.getElementById('hint-toast');
          const btn = document.getElementById('hint-dismiss');
          if (toast && !toast.hidden && btn) btn.click();
          await new Promise(r => requestAnimationFrame(r));
          const t2 = document.getElementById('hint-toast');
          return t2 ? getComputedStyle(t2).display : 'missing';
        """)

    # -- input ------------------------------------------------------------
    def click(self, x, y):
        """Real CDP input events, not a JS-synthesised CustomEvent. clickCount
        must be set on BOTH mousePressed and mouseReleased - omit it and
        Chrome dispatches mousedown/mouseup with no `click`, so MapLibre's
        click handler never runs."""
        self.cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "none"})
        self.cdp.send("Input.dispatchMouseEvent", {
            "type": "mousePressed", "x": x, "y": y, "button": "left", "buttons": 1, "clickCount": 1,
        })
        self.cdp.send("Input.dispatchMouseEvent", {
            "type": "mouseReleased", "x": x, "y": y, "button": "left", "buttons": 0, "clickCount": 1,
        })

    def hover(self, x, y):
        self.cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "none"})

    def screenshot(self, path):
        result = self.cdp.send("Page.captureScreenshot", {"format": "png"})
        Path(path).write_bytes(base64.b64decode(result["data"]))

    # -- finding a real hit target -----------------------------------------
    def find_hit_pixel(self):
        """Scans a coarse viewport grid in-page for a pixel the app itself
        considers a hit (map.queryRenderedFeatures - always called with the
        point as an [x, y] ARRAY, never a {x, y} object, which is silently
        read as the *options* arg instead and makes every layer look hit
        everywhere), validated with document.elementFromPoint so the sidebar,
        nav/scale controls or an open popup can never be mistaken for the
        canvas. This replaces projecting a polygon vertex, which is
        unreliable: queryRenderedFeatures returns tile-clipped geometry and
        `we` polygons are concave, so vertex 0 often lies outside the shape.
        Returns {x, y, sourceLayer, properties} in viewport coordinates, or
        None."""
        return self.js("""
          const mod = await import(new URL('js/layers.js', document.baseURI).href);
          const HIT = mod.hitLayerIds(mod.LAYERS);
          const canvas = map.getCanvas();
          const rect = canvas.getBoundingClientRect();
          const cx = Math.floor(rect.width / 2), cy = Math.floor(rect.height / 2);
          const maxR = Math.floor(Math.min(rect.width, rect.height) / 2) - 10;
          for (let r = 0; r <= maxR; r += 20) {
            const pts = r === 0 ? [[cx, cy]] : [
              [cx + r, cy], [cx - r, cy], [cx, cy + r], [cx, cy - r],
              [cx + r, cy + r], [cx - r, cy - r], [cx + r, cy - r], [cx - r, cy + r],
            ];
            for (const [x, y] of pts) {
              if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) continue;
              const feats = map.queryRenderedFeatures([x, y], {layers: HIT});
              if (!feats.length) continue;
              const vx = rect.left + x, vy = rect.top + y;
              if (document.elementFromPoint(vx, vy) !== canvas) continue;
              return {
                x: Math.round(vx), y: Math.round(vy),
                sourceLayer: feats[0].layer['source-layer'],
                properties: feats[0].properties,
              };
            }
          }
          return null;
        """)

    # -- console/network collection ---------------------------------------
    def collect_console_and_network(self):
        """Drains buffered CDP events into self.console / self.network. Reads
        BOTH Log.entryAdded and Runtime.consoleAPICalled - the favicon 404
        (and any other pure network error) arrives only via Log, never as a
        console API call, so a Runtime-only collector would silently miss it
        even though PROGRESS.md documents the filter for it."""
        events = self.cdp.take_events((
            "Log.entryAdded", "Runtime.consoleAPICalled", "Runtime.exceptionThrown",
            "Network.responseReceived", "Network.loadingFailed",
        ))
        for ev in events:
            m, p = ev.get("method"), ev.get("params", {})
            if m == "Log.entryAdded":
                entry = p.get("entry", {})
                self.console.append({"kind": "log", "level": entry.get("level"),
                                      "text": entry.get("text", ""), "url": entry.get("url", "")})
            elif m == "Runtime.consoleAPICalled":
                args = p.get("args", [])
                text = " ".join(str(a.get("value", a.get("description", ""))) for a in args)
                self.console.append({"kind": "console", "level": p.get("type"), "text": text, "url": ""})
            elif m == "Runtime.exceptionThrown":
                exc = (p.get("exceptionDetails", {}).get("exception") or {})
                self.console.append({"kind": "exception", "level": "error",
                                      "text": exc.get("description", ""), "url": ""})
            elif m == "Network.responseReceived":
                resp = p.get("response", {})
                self.network.append({"url": resp.get("url", ""), "status": resp.get("status"), "failed": False})
            elif m == "Network.loadingFailed":
                self.network.append({"url": "", "status": None, "failed": True,
                                      "canceled": p.get("canceled", False),
                                      "errorText": p.get("errorText", "")})


# ---------------------------------------------------------------------------
# Assertions + check registry
# ---------------------------------------------------------------------------

class Skip(Exception):
    """Raise from a check to bail out mid-check with a printed reason."""


class Assert:
    def __init__(self):
        self.results = []  # (status, message) with status in PASS/FAIL/NOTE

    def eq(self, actual, expected, msg):
        ok = actual == expected
        self.results.append(("PASS" if ok else "FAIL",
                              msg if ok else f"{msg}: expected {expected!r}, got {actual!r}"))
        return ok

    def ok(self, cond, msg):
        self.results.append(("PASS" if cond else "FAIL", msg))
        return cond

    def contains(self, needle, haystack, msg):
        ok = needle in haystack
        self.results.append(("PASS" if ok else "FAIL",
                              msg if ok else f"{msg}: {needle!r} not in {haystack!r}"))
        return ok

    def note(self, msg):
        self.results.append(("NOTE", msg))

    def fail(self, msg):
        self.results.append(("FAIL", msg))


CHECKS = []  # ordered list of (name, description, function)


def check(name, description):
    def deco(fn):
        CHECKS.append((name, description, fn))
        return fn
    return deco


# ---------------------------------------------------------------------------
# The checks
#
# Each derives its expectations from the app's own modules (js/layers.js,
# js/bookmarks.js, js/fields.js) at runtime rather than hardcoding today's
# counts/ids, so adding or removing a layer moves the expectation with it.
# Every derivation asserts a non-degenerate precondition first (e.g. LAYERS is
# non-empty) - otherwise a broken module could empty both the DOM and the
# expectation, and "DOM matches config" would pass vacuously.
# ---------------------------------------------------------------------------

@check("map_loads", "Style layers/source match js/layers.js; basemap under it; error banner hidden; a WiE feature renders")
def check_map_loads(page, a):
    data = page.js("""
      const mod = await import(new URL('js/layers.js', document.baseURI).href);
      const builtIds = mod.buildStyleLayers(mod.LAYERS).map(l => l.id);
      const expectedIds = ['bg', 'basemap-osm', ...builtIds];
      const style = map.getStyle();
      const src = style.sources['nl'];
      const banner = document.getElementById('error-banner');
      return {
        layerCount: mod.LAYERS.length,
        expectedIds,
        actualIds: style.layers.map(l => l.id),
        srcType: src && src.type,
        promoteIdMatches: JSON.stringify(src && src.promoteId) === JSON.stringify(mod.buildPromoteId(mod.LAYERS)),
        rasterOpacity: map.getPaintProperty('basemap-osm', 'raster-opacity'),
        bannerHidden: banner.hidden,
        bannerText: banner.textContent,
      };
    """)
    a.ok(data["layerCount"] > 0, "precondition: js/layers.js LAYERS is non-empty")
    a.eq(data["actualIds"], data["expectedIds"], "style layer ids/order match ['bg','basemap-osm', ...buildStyleLayers(LAYERS)]")
    a.eq(data["srcType"], "vector", "'nl' source is a vector source")
    a.ok(data["promoteIdMatches"], "'nl' source promoteId matches buildPromoteId(LAYERS)")
    a.eq(data["rasterOpacity"], 0.5, "basemap-osm raster-opacity is 0.5 (2026-09-08 polish pass)")
    a.ok(data["bannerHidden"], f"#error-banner is hidden (text if not: {data['bannerText']!r})")


@check("console_clean", "No unexpected console errors/exceptions or failed network requests during the initial load")
def check_console_clean(page, a):
    # The runner appends the shared console/network classification to every
    # check after it runs (see main()); this check's own body just needs to
    # exist as the load-and-do-nothing baseline that classification runs
    # against, proving a plain page load is clean on its own.
    a.ok(True, "page loaded and became ready with no additional interaction")


@check("layer_checkboxes_toggle", "Every js/layers.js entry has exactly one checkbox, and toggling it flips every one of its partIds()")
def check_layer_checkboxes_toggle(page, a):
    setup = page.js("""
      const mod = await import(new URL('js/layers.js', document.baseURI).href);
      return {
        total: mod.LAYERS.length,
        rows: mod.LAYERS.map(cfg => ({
          key: cfg.key, defaultVisible: !!cfg.defaultVisible, partIds: mod.partIds(cfg),
        })),
      };
    """)
    a.ok(setup["total"] > 0, "precondition: js/layers.js LAYERS is non-empty")

    checkbox_state = page.js("""
      return Array.from(document.querySelectorAll('.layer-row input[type=checkbox]'))
        .map(b => ({ id: b.id, checked: b.checked }));
    """)
    a.eq(len(checkbox_state), len(setup["rows"]), "one checkbox rendered per LAYERS entry, no extras")
    by_id = {c["id"]: c for c in checkbox_state}

    for row in setup["rows"]:
        cb_id = f"cb-{row['key']}"
        match = by_id.get(cb_id)
        if not a.ok(match is not None, f"checkbox #{cb_id} exists"):
            continue
        a.eq(match["checked"], row["defaultVisible"], f"#{cb_id} checked state matches defaultVisible")

        part_ids_json = json.dumps(row["partIds"])
        result = page.js(f"""
          const ids = {part_ids_json};
          const cb = document.getElementById('{cb_id}');
          cb.checked = false;
          cb.dispatchEvent(new Event('change'));
          await new Promise(r => requestAnimationFrame(r));
          const idsOff = ids.map(id => map.getLayoutProperty(id, 'visibility'));
          cb.checked = true;
          cb.dispatchEvent(new Event('change'));
          await new Promise(r => requestAnimationFrame(r));
          const idsOn = ids.map(id => map.getLayoutProperty(id, 'visibility'));
          return {{ idsOff, idsOn }};
        """)
        a.ok(all(v == "none" for v in result["idsOff"]),
             f"{row['key']}: unchecking sets every partId ({row['partIds']}) to visibility 'none'")
        a.ok(all(v == "visible" for v in result["idsOn"]),
             f"{row['key']}: rechecking restores visibility 'visible'")


@check("wie_popup_opens", "Clicking a rendered WiE polygon opens the grouped popup matching THAT feature's own fields, not a hardcoded one")
def check_wie_popup_opens(page, a):
    # Explicit view (the first Untergebiet of the first town in
    # js/bookmarks.js), independent of DEFAULT_VIEW - so this check keeps
    # working even if the app's default view ever moves somewhere sparser.
    page.js("""
      const mod = await import(new URL('js/bookmarks.js', document.baseURI).href);
      const sub = mod.TOWNS[0].subAreas[0];
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 3000);
        map.once('idle', () => { clearTimeout(t); resolve(); });
        map.fitBounds(sub.bounds, { duration: 0 });
      });
    """)

    hit = page.find_hit_pixel()
    if not a.ok(hit is not None, "found a clickable WiE pixel in TOWNS[0].subAreas[0]"):
        return
    a.eq(hit["sourceLayer"], "we", "the hit pixel resolves to the 'we' source-layer")

    page.click(hit["x"], hit["y"])
    page.js("await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));")

    props_json = json.dumps(hit["properties"])
    expected = page.js(f"""
      const mod = await import(new URL('js/fields.js', document.baseURI).href);
      const p = {props_json};
      return {{
        subtitle: `WiE ${{p.we_id_padded || mod.pad4(p.we_id)}}`,
        title: mod.txt(p.we_bezeichnung),
      }};
    """)

    popup = page.js("""
      const popup = document.querySelector('.maplibregl-popup');
      if (!popup) return null;
      const box = popup.querySelector('.popup');
      return {
        title: popup.querySelector('.popup-head .title')?.textContent ?? null,
        subtitle: popup.querySelector('.popup-head .subtitle')?.textContent ?? null,
        statCount: popup.querySelectorAll('.popup-stat').length,
        groupCount: popup.querySelectorAll('.popup-group').length,
        openGroupCount: popup.querySelectorAll('.popup-group[open]').length,
        scrollTop: box ? box.scrollTop : null,
        overflow: box ? (box.scrollHeight > box.clientHeight) : false,
      };
    """)
    if not a.ok(popup is not None, "a MapLibre popup opened after the click"):
        return
    a.eq(popup["title"], expected["title"], "popup title equals the clicked feature's own we_bezeichnung")
    a.eq(popup["subtitle"], expected["subtitle"], "popup subtitle equals the clicked feature's own WiE id (padded)")
    a.eq(popup["statCount"], 6, "popup shows all 6 stat tiles")
    a.ok(popup["groupCount"] >= 1, "popup shows at least one collapsible detail group")

    # Every detail group starts CLOSED - the popup must lead with the overview
    # fields, with "Lage" behind one click. An explicitly restated requirement
    # (asked for twice), so it is worth locking in, unlike the rest of the
    # popup's presentation detail, which churns and is deliberately left out
    # of this harness.
    a.eq(popup["openGroupCount"], 0, "every collapsible group starts collapsed on first render")

    # Regression guard for the fixed a11y-autoscroll bug (PROGRESS.md v1 bug
    # #2): MapLibre's popup focus handling scrolls .popup down on open; the
    # fix resets scrollTop in a requestAnimationFrame after render. This only
    # means anything when the popup actually overflows its box - asserting it
    # on a short popup would pass trivially and prove nothing.
    if popup["overflow"]:
        a.eq(popup["scrollTop"], 0, "popup body stayed scrolled to top despite MapLibre's a11y focus-scroll")
    else:
        a.note("popup did not overflow its box here - scrollTop regression guard not exercised")


# ---------------------------------------------------------------------------
# Server auto-start (localhost only)
# ---------------------------------------------------------------------------

def ensure_server(url):
    """For a localhost URL with nothing listening, starts serve_range.py
    (same interpreter running this script) and waits for it to accept
    connections. Returns the Popen to stop in a finally, or None if nothing
    was started (already running, or a non-localhost URL)."""
    parsed = urlparse(url)
    if parsed.hostname not in ("localhost", "127.0.0.1"):
        return None
    try:
        urllib.request.urlopen(url, timeout=3)
        return None
    except Exception:
        pass

    port = parsed.port or 80
    print(f"[server] no listener on :{port}, starting serve_range.py")
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "serve_range.py"), str(port)],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            print(f"[server] up (pid {proc.pid})")
            return proc
        except Exception:
            time.sleep(0.2)
    proc.terminate()
    raise SystemExit(f"ERROR: started serve_range.py but :{port} never answered within 10s")


# ---------------------------------------------------------------------------
# CLI / runner
# ---------------------------------------------------------------------------

def git_info():
    def run(args):
        try:
            return subprocess.run(args, cwd=str(ROOT), capture_output=True, text=True, timeout=5).stdout.strip()
        except Exception:
            return ""
    rev = run(["git", "rev-parse", "--short", "HEAD"]) or "unknown"
    dirty = bool(run(["git", "status", "--porcelain"]))
    return rev, dirty


def main():
    parser = argparse.ArgumentParser(description="Reusable CDP verification harness for nl_webmap.")
    parser.add_argument("names", nargs="*", help="run only these checks by name (default: all)")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"base URL to test (default: {DEFAULT_URL})")
    parser.add_argument("--list", action="store_true", help="list available checks and exit")
    parser.add_argument("--headful", action="store_true", help="show the Chrome window (debugging)")
    parser.add_argument("--keep-open", action="store_true", help="leave Chrome running after the run (debugging)")
    parser.add_argument("--screenshot-dir", default=None, help="write one PNG per check into this directory (off by default)")
    args = parser.parse_args()

    if args.list:
        for name, desc, _ in CHECKS:
            print(f"{name:28s} {desc}")
        return 0

    by_name = {name: (name, desc, fn) for name, desc, fn in CHECKS}
    if args.names:
        unknown = [n for n in args.names if n not in by_name]
        if unknown:
            print(f"ERROR: unknown check name(s): {', '.join(unknown)}", file=sys.stderr)
            print(f"Known checks: {', '.join(by_name)}", file=sys.stderr)
            return 2
        selected = [by_name[n] for n in args.names]
    else:
        selected = list(CHECKS)

    rev, dirty = git_info()
    print(f"verify.py against {args.url}  (HEAD {rev}{' +dirty' if dirty else ''})")
    if dirty:
        print("NOTE: working tree has uncommitted changes - a run against a live URL below verifies HEAD, not this tree.")
    else:
        print("NOTE: a green run against a live URL verifies the last pushed commit, not necessarily this tree.")
    print()

    server_proc = ensure_server(args.url)
    chrome = Chrome(headless=not args.headful)
    total_fail = 0
    total_skip = 0
    try:
        chrome.start()
        cdp = CDP(chrome.browser_ws_url())
        cdp.attach_to_page()
        page = Page(cdp, args.url)

        for name, desc, fn in selected:
            start = time.time()
            a = Assert()
            skipped = False
            try:
                page.goto()
                fn(page, a)
                page.collect_console_and_network()
                fails, notes = classify_events(page)
                for f in fails:
                    a.fail("unexpected console/network output: " + f.get("text", "")[:200])
                for n in notes:
                    a.note("ignored/benign: " + n.get("text", "")[:200])
            except Skip as e:
                skipped = True
                a.results.append(("SKIP", str(e)))
            except Exception as e:
                a.results.append(("FAIL", f"check raised {type(e).__name__}: {e}"))

            n_fail = sum(1 for s, _ in a.results if s == "FAIL")
            n_pass = sum(1 for s, _ in a.results if s == "PASS")
            n_note = sum(1 for s, _ in a.results if s == "NOTE")
            status = "SKIP" if skipped else ("FAIL" if n_fail else "PASS")
            elapsed = time.time() - start

            print(f"{status:4s}  {name:32s} {n_pass} ok, {n_fail} failed, {n_note} notes  ({elapsed:.1f}s)")
            for s, msg in a.results:
                if s == "FAIL":
                    print(f"      x {msg}")
                elif s == "NOTE":
                    print(f"      - {msg}")

            if args.screenshot_dir:
                try:
                    Path(args.screenshot_dir).mkdir(parents=True, exist_ok=True)
                    page.screenshot(str(Path(args.screenshot_dir) / f"{name}.png"))
                except Exception as e:
                    print(f"      (screenshot failed: {e})")

            if status == "FAIL":
                total_fail += 1
            elif status == "SKIP":
                total_skip += 1
            print()

        passed = len(selected) - total_fail - total_skip
        print(f"{passed}/{len(selected)} checks passed"
              + (f", {total_skip} skipped" if total_skip else "")
              + (f", {total_fail} FAILED" if total_fail else ""))
        return 1 if total_fail else 0
    finally:
        if not args.keep_open:
            chrome.stop()
        else:
            print(f"(--keep-open: Chrome left running, profile at {chrome.profile_dir})")
        if server_proc:
            server_proc.terminate()


if __name__ == "__main__":
    sys.exit(main())
