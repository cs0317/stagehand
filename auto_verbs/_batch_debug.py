"""Debug multiple sites to see what DOM renders."""
import subprocess, sys, os

sites_urls = {
    "foursquare_com": "https://foursquare.com/explore?near=New+York&q=coffee",
    "gamefaqs_com": "https://gamefaqs.gamespot.com/search?game=zelda",
    "giantbomb_com": "https://www.giantbomb.com/search/?q=mario",
    "google_com__news": "https://news.google.com/search?q=technology",
    "google_com__shopping": "https://shopping.google.com/search?q=headphones",
    "guitarcenter_com": "https://www.guitarcenter.com/search?Ntt=acoustic+guitar",
    "history_com": "https://www.history.com/articles",
    "howstuffworks_com": "https://www.howstuffworks.com/search.php?terms=space",
    "joann_com": "https://www.joann.com/search?q=fabric",
    "kayak_com": "https://www.kayak.com/flights/NYC-LAX/2025-07-15",
    "kiwi_com": "https://www.kiwi.com/en/search/results/new-york/los-angeles",
    "lowes_com": "https://www.lowes.com/search?searchTerm=drill",
}

os.chdir(r"d:\repos\stagehand\auto_verbs")
for site, url in sites_urls.items():
    try:
        result = subprocess.run(
            [sys.executable, "debug_page.py", url],
            capture_output=True, text=True, timeout=60,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"}
        )
        output = result.stdout
        lines = [l for l in output.strip().split('\n') if l.strip()]
        # Get first 3 lines (headings info + first heading)
        summary = ' | '.join(lines[:3]) if lines else "NO OUTPUT"
        print(f"{site}: {summary}")
    except subprocess.TimeoutExpired:
        print(f"{site}: TIMEOUT")
    except Exception as e:
        print(f"{site}: ERROR {e}")
