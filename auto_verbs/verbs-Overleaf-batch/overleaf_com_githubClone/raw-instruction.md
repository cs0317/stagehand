Use Overleaf’s hidden Git backend (local)

Even on free accounts, every project still has a Git backend, but only accessible via git commands, not the UI.
This works because Overleaf exposes a Git remote even if the menu is hidden: 

git clone https://git.overleaf.com/<PROJECT_ID>
Then:
git remote add github https://github.com/USER/REPO.git 
push github 

✔️ Free
✔️ Full Git history
❌ Requires local git usage
❌ No web-based sync button
This is the most common academic workaround.