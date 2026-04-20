"""Quick tester for sites-not-suitable-SPA scripts."""
import subprocess, sys, os

sites = [
    "foursquare_com", "gamefaqs_com", "giantbomb_com", "google_com__news",
    "google_com__shopping", "guitarcenter_com", "history_com", "howstuffworks_com",
    "joann_com", "kayak_com", "kiwi_com", "lowes_com"
]

os.chdir(r"d:\repos\stagehand\auto_verbs")
for site in sites:
    folder = f"sites-not-suitable-SPA\\{site}"
    py_files = [f for f in os.listdir(folder) if f.endswith('.py')]
    if not py_files:
        print(f"{site}: NO PY FILE")
        continue
    py_file = os.path.join(folder, py_files[0])
    try:
        result = subprocess.run(
            [sys.executable, py_file],
            capture_output=True, text=True, timeout=90,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"}
        )
        output = result.stdout + result.stderr
        lines = [l for l in output.strip().split('\n') if l.strip()]
        last = lines[-1] if lines else "NO OUTPUT"
        print(f"{site}: {last}")
    except subprocess.TimeoutExpired:
        print(f"{site}: TIMEOUT")
    except Exception as e:
        print(f"{site}: ERROR {e}")
