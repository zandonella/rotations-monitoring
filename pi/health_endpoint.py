# Add this to the schedule-wake Flask app on the Pi.
# Requires: import json, subprocess; from datetime import datetime, timezone

@app.get("/health")
def health():
    try:
        out = subprocess.run(
            ["systemctl", "list-timers", "pc-wake-*", "--all", "--output=json"],
            capture_output=True, text=True, timeout=10,
        )
        timers = json.loads(out.stdout) if out.returncode == 0 and out.stdout.strip() else []
    except Exception:
        timers = []

    pending = []
    for t in timers:
        nxt = t.get("next")
        if isinstance(nxt, (int, float)) and nxt > 0:
            # systemd reports usec since epoch
            pending.append(
                datetime.fromtimestamp(nxt / 1_000_000, tz=timezone.utc).isoformat()
            )
        elif isinstance(nxt, str):
            pending.append(nxt)

    return jsonify({"ok": True, "pending_wakes": sorted(pending)}), 200
